const router = require('express').Router()
const db = require('../db')

const ALLOWED = new Set(['theme', 'fontSize', 'language'])

// GET /api/settings
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const result = {}
  for (const { key, value } of rows) result[key] = value
  res.json(result)
})

// POST /api/settings  { theme, fontSize, language }
router.post('/', (req, res) => {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const insert = db.transaction((patch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (ALLOWED.has(k) && typeof v === 'string') upsert.run(k, v)
    }
  })
  insert(req.body)
  res.json({ ok: true })
})

module.exports = router
