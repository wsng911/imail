const router = require('express').Router()
const accountsDb = require('../accountsDb')
const db = require('../db')
const { randomUUID } = require('crypto')

const COLORS = ['#4A90D9','#E91E8C','#FF7043','#8BC34A','#9C27B0','#26A69A','#FF9800','#607D8B']

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
