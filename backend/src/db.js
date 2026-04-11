const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const cfg = require('./config')

const DATA_DIR = process.env.DATA_DIR || (
  path.isAbsolute(cfg.server.data_dir)
    ? cfg.server.data_dir
    : path.resolve(process.cwd(), cfg.server.data_dir)
)
fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(path.join(DATA_DIR, 'imall.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    color TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    uid INTEGER,
    folder TEXT DEFAULT 'inbox',
    from_addr TEXT,
    from_name TEXT,
    subject TEXT,
    preview TEXT,
    body TEXT,
    date TEXT,
    read INTEGER DEFAULT 0,
    starred INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    raw_date INTEGER,
    UNIQUE(account_id, uid, folder)
  );

  CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id, folder, deleted);
  CREATE INDEX IF NOT EXISTS idx_emails_folder_date ON emails(folder, raw_date DESC);
  CREATE INDEX IF NOT EXISTS idx_emails_account_folder_date ON emails(account_id, folder, raw_date DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    email_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,
    data BLOB
  );

  CREATE TABLE IF NOT EXISTS deleted_uids (
    account_id TEXT NOT NULL,
    uid TEXT NOT NULL,
    folder TEXT NOT NULL,
    PRIMARY KEY (account_id, uid, folder)
  );
`)

module.exports = db

// ── 数据迁移（每次启动自动执行，幂等）──────────────────────────────
// 1. 修复 raw_date=0 的旧邮件：尝试从 date 字段解析时间戳
const migrated = db.prepare("SELECT value FROM settings WHERE key = 'migration_raw_date_fixed'").get()
if (!migrated) {
  const zeroDateRows = db.prepare("SELECT id, date FROM emails WHERE raw_date = 0 OR raw_date IS NULL").all()
  if (zeroDateRows.length > 0) {
    const upd = db.prepare("UPDATE emails SET raw_date = ? WHERE id = ?")
    db.transaction(() => {
      for (const row of zeroDateRows) {
        const ts = row.date ? new Date(row.date).getTime() : null
        if (ts && !isNaN(ts)) upd.run(ts, row.id)
      }
    })()
    console.log(`[db] 修复 ${zeroDateRows.length} 封邮件的 raw_date`)
  }
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration_raw_date_fixed', '1')").run()
}

// 2. 修复 folder 为空的旧邮件，默认归入 inbox
const folderMigrated = db.prepare("SELECT value FROM settings WHERE key = 'migration_folder_fixed'").get()
if (!folderMigrated) {
  const { changes: folderFix } = db.prepare("UPDATE emails SET folder = 'inbox' WHERE folder IS NULL OR folder = ''").run()
  if (folderFix > 0) console.log(`[db] 修复 ${folderFix} 封邮件的 folder 字段`)
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration_folder_fixed', '1')").run()
}

// Auto-import accounts.db if present (migration helper)
const importPath = path.join(DATA_DIR, 'accounts.db')
if (fs.existsSync(importPath)) {
  try {
    const importDb = new Database(importPath, { readonly: true })
    const rows = importDb.prepare('SELECT * FROM accounts').all()
    importDb.close()
    const insert = db.prepare('INSERT OR IGNORE INTO accounts (id, email, type, color, config, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    db.transaction(() => { for (const r of rows) insert.run(r.id, r.email, r.type, r.color, r.config, r.created_at ?? Math.floor(Date.now() / 1000)) })()
    fs.renameSync(importPath, importPath + '.imported')
    console.log('[db] accounts.db imported and renamed to accounts.db.imported')
  } catch (e) {
    console.error('[db] import failed:', e.message)
  }
}
