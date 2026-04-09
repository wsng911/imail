require('express-async-errors')
const express = require('express')
const session = require('express-session')
const cfg = require('./config')

const app = express()
app.use(express.json())

// CORS for frontend dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

const FileStore = require('session-file-store')(session)
const path = require('path')
const fs = require('fs')
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), cfg.server.data_dir || './data')
fs.mkdirSync(path.join(DATA_DIR, 'sessions'), { recursive: true })

app.use(session({
  store: new FileStore({ path: path.join(DATA_DIR, 'sessions'), retries: 1, logFn: () => {} }),
  secret: 'imall-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
}))

// ── Auth routes (public) ──────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body
  if (username === cfg.app.username && password === cfg.app.password) {
    req.session.authenticated = true
    return res.json({ ok: true })
  }
  res.status(401).json({ error: '账号或密码错误' })
})

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy()
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated })
})

// ── Auth middleware ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next()
  res.status(401).json({ error: 'unauthorized' })
}

// ── Protected routes ─────────────────────────────────────
const { getAuthUrl, handleCallback } = require('./outlook')
const db = require('./db')
const accountsDb = require('./accountsDb')
const { randomUUID } = require('crypto')
const COLORS = ['#4A90D9','#E91E8C','#FF7043','#8BC34A','#9C27B0','#26A69A','#FF9800','#607D8B']

// OAuth routes are public (redirect happens before login)
app.get('/api/emails/oauth/outlook', async (req, res) => {
  const redirectUri = `${req.protocol}://${req.get('host')}/api/emails/oauth/outlook/callback`
  const url = await getAuthUrl(redirectUri)
  res.redirect(url)
})

app.get('/api/emails/oauth/outlook/callback', async (req, res) => {
  const { code } = req.query
  const redirectUri = `${req.protocol}://${req.get('host')}/api/emails/oauth/outlook/callback`
  const { result, email } = await handleCallback(code, redirectUri)
  const existing = accountsDb.prepare('SELECT id FROM accounts WHERE email = ?').get(email)
  let accountId
  if (!existing) {
    const count = accountsDb.prepare('SELECT COUNT(*) as n FROM accounts').get().n
    accountId = randomUUID()
    accountsDb.prepare('INSERT INTO accounts (id, email, type, color, config) VALUES (?, ?, ?, ?, ?)')
      .run(accountId, email, 'outlook', COLORS[count % COLORS.length], JSON.stringify({}))
  } else {
    accountId = existing.id
  }
  // copy shared token cache to account-specific cache
  const path = require('path')
  const fs = require('fs')
  const tempDir = DATA_DIR
  const sharedCache = path.join(tempDir, 'msal_shared.json')
  const accountCache = path.join(tempDir, `msal_${accountId}.json`)
  if (fs.existsSync(sharedCache)) fs.copyFileSync(sharedCache, accountCache)
  res.redirect(`/?oauth=success`)
})

// ── Settings API ─────────────────────────────────────────
const yaml = require('js-yaml')
const CONFIG_PATH = [
  require('path').resolve(__dirname, '../config.yaml'),
  require('path').resolve(__dirname, '../../config.yaml'),
].find(p => require('fs').existsSync(p)) || require('path').resolve(__dirname, '../../config.yaml')

app.get('/api/settings', requireAuth, (req, res) => {
  const raw = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'))
  res.json(raw.ui || {})
})

app.post('/api/settings', requireAuth, (req, res) => {
  const raw = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'))
  raw.ui = { ...raw.ui, ...req.body }
  fs.writeFileSync(CONFIG_PATH, yaml.dump(raw))
  res.json(raw.ui)
})

app.use('/api/accounts', requireAuth, require('./routes/accounts'))
app.use('/api/emails',   requireAuth, require('./routes/emails'))
app.use('/api/migrate',  requireAuth, require('./routes/migrate'))

app.get('/health', (_, res) => res.json({ ok: true }))

// Error handler
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message })
})

// Serve frontend static files (production)
const DIST = path.resolve(__dirname, '../public')
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

const PORT = cfg.server.port || 30000
app.listen(PORT, () => console.log(`iMall backend running on :${PORT}`))
