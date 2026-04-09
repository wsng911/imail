const Imap = require('imap')
const { simpleParser } = require('mailparser')
const { convert } = require('html-to-text')
const db = require('./db')
const { randomUUID } = require('crypto')

function toPlainText(html, text) {
  if (text) return text.slice(0, 5000)
  if (html) return convert(html, { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }, { selector: 'a', options: { ignoreHref: true } }] }).slice(0, 5000)
  return ''
}

const IMAP_CONFIG = {
  gmail: { host: 'imap.gmail.com', port: 993, tls: true },
  qq:    { host: 'imap.qq.com',    port: 993, tls: true },
}

const FOLDER_MAP = {
  gmail:   { inbox: 'INBOX', sent: '[Gmail]/Sent Mail', draft: '[Gmail]/Drafts', trash: '[Gmail]/Trash', spam: '[Gmail]/Spam' },
  qq:      { inbox: 'INBOX', sent: 'Sent Messages',     draft: 'Drafts',         trash: 'Deleted Messages', spam: 'Junk' },
  outlook: { inbox: 'INBOX', sent: 'Sent',              draft: 'Drafts',         trash: 'Deleted',          spam: 'Junk' },
}

function fetchFolder(imap, account, imapFolder, folderKey) {
  return new Promise((resolve) => {
    imap.openBox(imapFolder, true, (err, box) => {
      if (err || !box || box.messages.total === 0) return resolve(0)
      const fetch = imap.seq.fetch('1:*', { bodies: '', struct: true })
      const promises = []
      fetch.on('message', (msg, seqno) => {
        let uid = seqno
        const p = new Promise(res => {
          msg.on('attributes', attrs => { uid = attrs.uid })
          msg.on('body', stream => {
            simpleParser(stream, (err, parsed) => {
              if (err) return res()
              const existing = db.prepare('SELECT id FROM emails WHERE account_id = ? AND uid = ? AND folder = ?').get(account.id, uid, folderKey)
              if (!existing) {
                db.prepare(`INSERT INTO emails (id, account_id, uid, folder, from_addr, from_name, subject, preview, body, date, raw_date)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                  .run(
                    randomUUID(), account.id, uid, folderKey,
                    parsed.from?.value?.[0]?.address || '',
                    parsed.from?.value?.[0]?.name || '',
                    parsed.subject || '(无主题)',
                    (parsed.text || '').slice(0, 100).replace(/\n/g, ' '),
                    toPlainText(parsed.html, parsed.text),
                    parsed.date ? parsed.date.toISOString() : '',
                    parsed.date ? parsed.date.getTime() : 0,
                  )
              }
              res()
            })
          })
        })
        promises.push(p)
      })
      fetch.once('end', async () => { await Promise.all(promises); resolve(promises.length) })
      fetch.once('error', () => resolve(0))
    })
  })
}

function fetchEmails(account, config) {
  return new Promise((resolve, reject) => {
    const imapCfg = IMAP_CONFIG[account.type]
    if (!imapCfg) return reject(new Error('unsupported type'))

    const imap = new Imap({
      user: account.email,
      password: config.credential,
      ...imapCfg,
      tlsOptions: { rejectUnauthorized: false },
    })

    imap.once('ready', async () => {
      const folders = FOLDER_MAP[account.type] || FOLDER_MAP.qq
      let total = 0
      for (const [folderKey, imapFolder] of Object.entries(folders)) {
        try {
          const n = await fetchFolder(imap, account, imapFolder, folderKey)
          total += n
        } catch (e) {
          // skip unavailable folders
        }
      }
      imap.end()
      resolve(total)
    })

    imap.once('error', reject)
    imap.connect()
  })
}

module.exports = { fetchEmails }
