const router = require('express').Router()
const db = require('../db')
const path = require('path')
const fs = require('fs')
const os = require('os')
const Database = require('better-sqlite3')
const archiver = require('archiver')
const unzipper = require('unzipper')

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), './data')

// GET /api/migrate/bundle — 打包 accounts + msal_*.json 为 zip 下载
router.get('/bundle', (req, res) => {
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', 'attachment; filename="imail_accounts.zip"')

  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.pipe(res)

  // 导出 accounts 为独立 sqlite
  const tmpDb = path.join(os.tmpdir(), `imail_accounts_${Date.now()}.db`)
  try {
    const out = new Database(tmpDb)
    out.exec('CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, type TEXT NOT NULL, color TEXT NOT NULL, config TEXT NOT NULL, created_at INTEGER)')
    const rows = db.prepare('SELECT * FROM accounts').all()
    const ins = out.prepare('INSERT OR REPLACE INTO accounts VALUES (?,?,?,?,?,?)')
    out.transaction(() => rows.forEach(r => ins.run(r.id, r.email, r.type, r.color, r.config, r.created_at)))()
    out.close()
    archive.file(tmpDb, { name: 'accounts.db' })
  } catch (e) {
    archive.abort()
    return res.status(500).end()
  }

  // 打包所有 msal_*.json
  const msalFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('msal_') && f.endsWith('.json'))
  msalFiles.forEach(f => archive.file(path.join(DATA_DIR, f), { name: f }))

  archive.finalize().then(() => {
    try { fs.unlinkSync(tmpDb) } catch {}
  })
})

// POST /api/migrate/bundle — 上传 zip，解包并导入
router.post('/bundle', async (req, res) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imail_import_'))
  try {
    await new Promise((resolve, reject) => {
      req.pipe(unzipper.Extract({ path: tmpDir })).on('close', resolve).on('error', reject)
    })

    // 导入 accounts.db
    const accountsDb = path.join(tmpDir, 'accounts.db')
    let imported = 0
    if (fs.existsSync(accountsDb)) {
      const imp = new Database(accountsDb, { readonly: true })
      const rows = imp.prepare('SELECT * FROM accounts').all()
      imp.close()
      const ins = db.prepare('INSERT OR IGNORE INTO accounts (id, email, type, color, config, created_at) VALUES (?,?,?,?,?,?)')
      db.transaction(() => rows.forEach(r => ins.run(r.id, r.email, r.type, r.color, r.config, r.created_at)))()
      imported = rows.length
    }

    // 恢复 msal_*.json
    const msalFiles = fs.readdirSync(tmpDir).filter(f => f.startsWith('msal_') && f.endsWith('.json'))
    msalFiles.forEach(f => fs.copyFileSync(path.join(tmpDir, f), path.join(DATA_DIR, f)))

    res.json({ ok: true, imported, msal: msalFiles.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

// 保留原有 export/import 路由
router.get('/export', (req, res) => {
  const dest = req.query.path
  if (!dest) return res.status(400).json({ error: '请提供导出路径' })
  const dir = path.dirname(dest)
  if (!fs.existsSync(dir)) return res.status(400).json({ error: `目录不存在: ${dir}` })
  try {
    const out = new Database(dest)
    out.exec('CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, type TEXT NOT NULL, color TEXT NOT NULL, config TEXT NOT NULL, created_at INTEGER)')
    const rows = db.prepare('SELECT * FROM accounts').all()
    const ins = out.prepare('INSERT OR REPLACE INTO accounts VALUES (?,?,?,?,?,?)')
    out.transaction(() => rows.forEach(r => ins.run(r.id, r.email, r.type, r.color, r.config, r.created_at)))()
    out.close()
    res.json({ ok: true, count: rows.length, path: dest })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/import', (req, res) => {
  const src = req.body.path
  if (!src) return res.status(400).json({ error: '请提供导入路径' })
  if (!fs.existsSync(src)) return res.status(400).json({ error: `文件不存在: ${src}` })
  try {
    const imp = new Database(src, { readonly: true })
    const rows = imp.prepare('SELECT * FROM accounts').all()
    imp.close()
    const ins = db.prepare('INSERT OR IGNORE INTO accounts (id, email, type, color, config, created_at) VALUES (?,?,?,?,?,?)')
    db.transaction(() => rows.forEach(r => ins.run(r.id, r.email, r.type, r.color, r.config, r.created_at)))()
    res.json({ ok: true, imported: rows.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
