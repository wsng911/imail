const router = require('express').Router()
const accountsDb = require('../accountsDb')
const db = require('../db')
const { randomUUID } = require('crypto')
const { getAccessToken } = require('../outlook')
const Imap = require('imap')
const cfg = require('../config')

const COLORS = ['#4A90D9','#E91E8C','#FF7043','#8BC34A','#9C27B0','#26A69A','#FF9800','#607D8B']

router.get('/status', async (req, res) => {
  const accounts = accountsDb.prepare('SELECT id, email, type, config FROM accounts').all()
  const IMAP_CONFIG = { gmail: { host: 'imap.gmail.com', port: 993, tls: true }, qq: { host: 'imap.qq.com', port: 993, tls: true } }
  const results = await Promise.all(accounts.map(async acc => {
    try {
      if (acc.type === 'outlook') {
        await getAccessToken(acc.id)
        return { id: acc.id, email: acc.email, type: acc.type, valid: true }
      } else {
        const config = JSON.parse(acc.config)
        const imapCfg = IMAP_CONFIG[acc.type]
        if (!imapCfg) return { id: acc.id, email: acc.email, type: acc.type, valid: true }
        await new Promise((resolve, reject) => {
          const imap = new Imap({ user: acc.email, password: config.credential, ...imapCfg, tlsOptions: { rejectUnauthorized: false }, connTimeout: 8000, authTimeout: 6000 })
          imap.once('ready', () => { imap.end(); resolve() })
          imap.once('error', reject)
          imap.connect()
        })
        return { id: acc.id, email: acc.email, type: acc.type, valid: true }
      }
    } catch {
      return { id: acc.id, email: acc.email, type: acc.type, valid: false }
    }
  }))
  res.json(results)
})

router.get('/', (req, res) => {
  const accounts = accountsDb.prepare('SELECT id, email, type, color FROM accounts').all()
  const unreadMap = Object.fromEntries(
    db.prepare('SELECT account_id, COUNT(*) as n FROM emails WHERE read=0 AND deleted=0 GROUP BY account_id').all()
      .map(r => [r.account_id, r.n])
  )
  const folderRows = db.prepare('SELECT account_id, folder, COUNT(*) as n FROM emails WHERE deleted=0 GROUP BY account_id, folder').all()
  const folderMap = {}
  for (const r of folderRows) {
    if (!folderMap[r.account_id]) folderMap[r.account_id] = {}
    folderMap[r.account_id][r.folder] = r.n
  }
  res.json(accounts
    .sort((a, b) => a.email.localeCompare(b.email))
    .map(a => ({ ...a, unread: unreadMap[a.id] || 0, folderCounts: folderMap[a.id] || {} }))
  )
})

router.post('/', (req, res) => {
  const { email, type, credential } = req.body
  if (!email || !type || !credential) return res.status(400).json({ error: 'missing fields' })
  const count = accountsDb.prepare('SELECT COUNT(*) as n FROM accounts').get().n
  const id = randomUUID()
  const color = COLORS[count % COLORS.length]
  accountsDb.prepare('INSERT INTO accounts (id, email, type, color, config) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, type, color, JSON.stringify({ credential }))
  res.status(201).json({ id, email, type, color, unread: 0 })
})

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM emails WHERE account_id = ?').run(req.params.id)
  accountsDb.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

router.get('/:id/config', (req, res) => {
  const row = accountsDb.prepare('SELECT config FROM accounts WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'not found' })
  res.json(JSON.parse(row.config))
})

module.exports = router
