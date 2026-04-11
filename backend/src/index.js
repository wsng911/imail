require('express-async-errors')
const express = require('express')
const session = require('express-session')
const cfg = require('./config')

const app = express()
app.set('trust proxy', 1)  // 信任 Nginx 反代的 X-Forwarded-Proto
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

app.post('/api/auth/change-password', (req, res) => {
  if (!req.session.authenticated) return res.status(401).json({ error: 'unauthorized' })
  const { oldPassword, newPassword } = req.body
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'missing fields' })
  if (String(oldPassword) !== String(cfg.app.password)) return res.status(401).json({ error: '原密码错误' })
  if (newPassword.length < 4) return res.status(400).json({ error: '新密码至少4位' })
  try {
    const yaml = require('js-yaml')
    const configCandidates = [path.resolve(__dirname, '../config.yaml'), path.resolve(__dirname, '../../config.yaml')]
    const configPath = configCandidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile()) || configCandidates[1]
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8'))
    raw.app.password = String(newPassword)
    fs.writeFileSync(configPath, yaml.dump(raw))
    cfg.app.password = String(newPassword)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
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
  const selfCallback = `${req.protocol}://${req.get('host')}/api/emails/oauth/outlook/callback`
  const relayUrl = cfg.outlook?.relay_url
  const redirectUri = relayUrl || selfCallback
  const url = await getAuthUrl(redirectUri)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.redirect(url)
})

app.get('/api/emails/oauth/outlook/callback', async (req, res) => {
  const { code, error, error_description } = req.query
  if (error) return res.redirect(`/?oauth=error&reason=${encodeURIComponent(error_description || error)}`)
  try {
    const relayUrl = cfg.outlook?.relay_url
    const redirectUri = relayUrl || `${req.protocol}://${req.get('host')}/api/emails/oauth/outlook/callback`
    const result = await handleCallback(code, redirectUri)
    const email = result.email
    const existing = accountsDb.prepare('SELECT id FROM accounts WHERE email = ?').get(email)
    let accountId
    if (!existing) {
      const count = accountsDb.prepare('SELECT COUNT(*) as n FROM accounts').get().n
      accountId = randomUUID()
      accountsDb.prepare('INSERT INTO accounts (id, email, type, color, config) VALUES (?, ?, ?, ?, ?)')
        .run(accountId, email, 'outlook', COLORS[count % COLORS.length], JSON.stringify({ refreshToken: result.result.account.homeAccountId || '' }))
    } else {
      accountId = existing.id
    }
    const fs = require('fs')
    const accountPath = require('path').join(DATA_DIR, `msal_${email}.json`)
    console.log(`[oauth] tmpCachePath=${result.tmpCachePath} exists=${result.tmpCachePath && fs.existsSync(result.tmpCachePath)}`)
    if (result.tmpCachePath && fs.existsSync(result.tmpCachePath)) {
      fs.copyFileSync(result.tmpCachePath, accountPath)
      try { fs.unlinkSync(result.tmpCachePath) } catch {}
    }
    try {
      const cache = JSON.parse(fs.readFileSync(accountPath, 'utf8'))
      const cacheAccounts = Object.values(cache.Account || {})
      const match = cacheAccounts.find(a => a.username?.toLowerCase() === email.toLowerCase())
      const homeId = match?.home_account_id || result.result.account.homeAccountId || ''
      if (homeId) accountsDb.prepare('UPDATE accounts SET config=? WHERE id=?').run(JSON.stringify({ refreshToken: homeId }), accountId)
    } catch {}
    res.redirect(`/?oauth=success&email=${encodeURIComponent(email)}`)
  } catch (e) {
    console.log(`[oauth] error: ${e.message}`)
    res.redirect(`/?oauth=error&reason=${encodeURIComponent(e.message)}`)
  }
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

function markOldEmailsRead() {
  const db = require('./db')
  const threeMonthsAgo2 = Date.now() - 90 * 24 * 60 * 60 * 1000
  const { changes } = db.prepare('UPDATE emails SET read = 1 WHERE read = 0 AND raw_date > 0 AND raw_date < ? AND deleted = 0').run(threeMonthsAgo2)
  if (changes > 0) console.log(`[auto] 标记 ${changes} 封历史邮件为已读`)
}

function purgeOldEmails() {
  const db = require('./db')
  const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  // 超3月非星标邮件：清空 body，标已读
  const { changes: bc } = db.prepare('UPDATE emails SET body = \'\', read = 1 WHERE starred = 0 AND body != \'\' AND raw_date > 0 AND raw_date < ? AND deleted = 0').run(threeMonthsAgo)
  if (bc > 0) console.log(`[purge] 清空 ${bc} 封超3月邮件 body`)
  // 超1年非星标邮件：删除记录，记录 uid 防重新同步
  // 超1年非星标邮件：直接删除，不写 deleted_uids（允许重新同步列表）
  const { changes } = db.prepare('DELETE FROM emails WHERE starred = 0 AND raw_date > 0 AND raw_date < ? AND deleted = 0').run(oneYearAgo)
  if (changes > 0) console.log(`[purge] 删除 ${changes} 封超1年邮件`)
  // 软删除超30天
  const { changes: dc } = db.prepare('DELETE FROM emails WHERE deleted = 1 AND raw_date > 0 AND raw_date < ?').run(thirtyDaysAgo)
  if (dc > 0) console.log(`[purge] 清理 ${dc} 封软删除邮件`)
  // 孤立附件
  const { changes: ac } = db.prepare('DELETE FROM attachments WHERE email_id NOT IN (SELECT id FROM emails)').run()
  if (ac > 0) console.log(`[purge] 清理 ${ac} 个孤立附件`)
  // 附件 BLOB
  const { changes: ab } = db.prepare('UPDATE attachments SET data = NULL WHERE data IS NOT NULL').run()
  if (ab > 0) console.log(`[purge] 清理 ${ab} 个附件 BLOB`)
  if (bc > 0 || changes > 0 || ac > 0 || ab > 0) db.exec('VACUUM')
}

async function autoSync() {
  const accountsDb = require('./accountsDb')
  const { fetchEmails } = require('./imap')
  const { getAccessToken } = require('./outlook')
  const nodeFetch = (await import('node-fetch')).default
  const { randomUUID } = require('crypto')
  const accounts = accountsDb.prepare('SELECT * FROM accounts').all()
  for (const account of accounts) {
    try {
      const config = JSON.parse(account.config)
      if (account.type === 'outlook') {
        let token
        try { token = await getAccessToken(account.id) } catch (e) { console.log(`[sync] ${account.email} token error:`, e.message); continue }
        const db = require('./db')
        const OUTLOOK_FOLDERS = { inbox: 'inbox', sent: 'sentitems', trash: 'deleteditems', spam: 'junkemail' }
        const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
        let newCount = 0
        for (const [folderKey, folderId] of Object.entries(OUTLOOK_FOLDERS)) {
          let url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,from,bodyPreview,body,receivedDateTime,isRead,hasAttachments`
          const resp = await nodeFetch(url, { headers: { Authorization: `Bearer ${token}` } })
          const data = await resp.json()
          if (data.error) { console.log(`[sync] ${account.email} graph error:`, data.error.message); continue }
          for (const msg of (data.value || [])) {
            const existing = db.prepare('SELECT id FROM emails WHERE account_id = ? AND uid = ?').get(account.id, msg.id)
            const purged = db.prepare('SELECT 1 FROM deleted_uids WHERE account_id = ? AND uid = ? AND folder = ?').get(account.id, msg.id, folderKey)
            if (!existing && !purged) {
              const emailDate = msg.receivedDateTime ? new Date(msg.receivedDateTime).getTime() : Date.now()
              const isOld = emailDate < threeMonthsAgo
              db.prepare(`INSERT OR IGNORE INTO emails (id,account_id,uid,folder,from_addr,from_name,subject,preview,body,date,read,raw_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
                .run(randomUUID(), account.id, msg.id, folderKey,
                  msg.from?.emailAddress?.address || '', msg.from?.emailAddress?.name || '',
                  msg.subject || '(无主题)', (msg.bodyPreview || '').slice(0, 100),
                  isOld ? '' : (msg.body?.content || ''), msg.receivedDateTime || new Date().toISOString(),
                  isOld ? 1 : (msg.isRead ? 1 : 0), emailDate)
              newCount++
            }
          }
        }
        console.log(`[sync] ${account.email} synced ${newCount}`)
        await fetchEmails(account, config)
      }
    } catch {}
  }
}

app.listen(PORT, () => {
  console.log(`iMall backend running on :${PORT}`)
  markOldEmailsRead()
  purgeOldEmails()
  setInterval(markOldEmailsRead, 24 * 60 * 60 * 1000)
  setInterval(purgeOldEmails, 24 * 60 * 60 * 1000)
  setInterval(autoSync, 60 * 1000)
})
