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
    raw_date INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id, folder, deleted);
  CREATE INDEX IF NOT EXISTS idx_emails_folder_date ON emails(folder, raw_date DESC);
  CREATE INDEX IF NOT EXISTS idx_emails_account_folder_date ON emails(account_id, folder, raw_date DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

module.exports = db

// Auto-import accounts.db if present (migration helper)
const importPath = path.join(DATA_DIR, 'accounts.db')
if (fs.existsSync(importPath)) {
  try {
    db.exec(`
      ATTACH '${importPath.replace(/'/g, "''")}' AS migration;
      INSERT OR IGNORE INTO accounts SELECT * FROM migration.accounts;
      DETACH migration;
    `)
    fs.renameSync(importPath, importPath + '.imported')
    console.log('[db] accounts.db imported and renamed to accounts.db.imported')
  } catch (e) {
    console.error('[db] import failed:', e.message)
  }
}
