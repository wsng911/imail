const Imap = require('imap')
const { simpleParser } = require('mailparser')
const Iconv = require('iconv').Iconv
const db = require('./db')
const { randomUUID } = require('crypto')

const IMAP_CONFIG = {
  gmail: { host: 'imap.gmail.com', port: 993, tls: true },
  qq:    { host: 'imap.qq.com',    port: 993, tls: true },
}

const FOLDER_MAP = {
  gmail:   { inbox: 'INBOX', sent: '[Gmail]/已发邮件', draft: '[Gmail]/草稿', trash: '[Gmail]/已删除邮件', spam: '[Gmail]/垃圾邮件' },
  qq:      { inbox: 'INBOX', sent: 'Sent Messages',   draft: 'Drafts',       trash: 'Deleted Messages', spam: 'Junk' },
}

// QQ 邮箱文件夹名备选（不同版本可能不同）
const QQ_FOLDER_FALLBACK = {
  sent:  ['Sent Messages', '已发送', 'Sent'],
  draft: ['Drafts', '草稿箱', '草稿'],
  trash: ['Deleted Messages', '已删除', 'Trash'],
  spam:  ['Junk', '垃圾', 'Spam'],
}

function fetchFolder(imap, account, imapFolder, folderKey) {
  return new Promise((resolve) => {
    imap.openBox(imapFolder, true, async (err, box) => {
      if (err || !box || box.messages.total === 0) return resolve(0)
      const total = box.messages.total
      const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
      const threeMonthsAgoDate = new Date(threeMonthsAgo)
      const pad = (n) => String(n).padStart(2, '0')
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const sinceStr = `${pad(threeMonthsAgoDate.getDate())}-${MONTHS[threeMonthsAgoDate.getMonth()]}-${threeMonthsAgoDate.getFullYear()}`
      console.log(`[fetchFolder] ${folderKey} total:${total} since:${sinceStr}`)

      // 用 SEARCH 按日期分两组：近3月 SINCE，超3月 BEFORE
      const searchAndFetch = (criteria, bodyOpt) => new Promise(res2 => {
        imap.search(criteria, (err2, uids) => {
          console.log(`[searchAndFetch] ${folderKey} criteria:${JSON.stringify(criteria)} uids:${uids?.length} err:${err2?.message}`)
          if (err2 || !uids || uids.length === 0) return res2([])
          // 过滤已存在
          const newUids = uids.filter((uid) => {
            const existing = db.prepare('SELECT id FROM emails WHERE account_id = ? AND uid = ? AND folder = ?').get(account.id, uid, folderKey)
            const purged = db.prepare('SELECT 1 FROM deleted_uids WHERE account_id = ? AND uid = ? AND folder = ?').get(account.id, String(uid), folderKey)
            return !existing && !purged
          })
          if (newUids.length === 0) return res2([])
          console.log(`[fetchFolder] ${folderKey} fetching ${newUids.length} uids`)
          const rows = []
          const promises = []
          const BATCH = 20
          let pending = Math.ceil(newUids.length / BATCH)
          if (pending === 0) return res2([])
          for (let i = 0; i < newUids.length; i += BATCH) {
            const batch = newUids.slice(i, i + BATCH)
            const f = imap.fetch(batch, { bodies: bodyOpt, struct: false })
            f.on('message', msg => {
              let uid = null, flags = [], internalDate = null
              let uidRes
              const uidReady = Promise.race([new Promise(r => { uidRes = r }), new Promise(r => setTimeout(r, 3000))])
              const p = new Promise(r2b => {
                msg.on('attributes', (attrs) => { uid = attrs.uid; flags = attrs.flags || []; internalDate = attrs.date || null; uidRes && uidRes() })
                msg.on('body', (stream) => {
                  simpleParser(stream, { Iconv }, async (err3, parsed) => {
                    if (err3) return r2b()
                    await uidReady
                    if (uid) rows.push({ uid, flags, parsed, internalDate })
                    r2b()
                  })
                })
              })
              promises.push(p)
            })
            f.once('end', () => { pending--; console.log(`[fetch] ${folderKey} batch done, pending:${pending}`); if (pending === 0) Promise.all(promises).then(() => res2(rows)) })
            f.once('error', () => { pending--; if (pending === 0) Promise.all(promises).then(() => res2(rows)) })
          }
        })
      })

      // 近3月：拉完整 body
      const newRows = await searchAndFetch([['SINCE', sinceStr]], '')
      // 超3月：只拉 header，date 用 internalDate 补
      const oldRows = await searchAndFetch([['BEFORE', sinceStr]], 'HEADER')

      console.log(`[fetchFolder] ${folderKey} new:${newRows.length} old:${oldRows.length}`)
      if (newRows.length === 0 && oldRows.length === 0) return resolve(0)

      const insertEmail = db.prepare(`INSERT OR IGNORE INTO emails (id, account_id, uid, folder, from_addr, from_name, subject, preview, body, date, raw_date, read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      const insertAtt = db.prepare('INSERT INTO attachments (id, email_id, filename, content_type, size) VALUES (?, ?, ?, ?, ?)')
      db.transaction(() => {
        for (const { uid, parsed: hp, internalDate: id1 } of oldRows) {
          const d = id1 || hp.date || null
          const emailDate = d ? new Date(d).getTime() : Date.now()
          insertEmail.run(randomUUID(), account.id, uid, folderKey,
            hp.from?.value?.[0]?.address || '', hp.from?.value?.[0]?.name || '',
            hp.subject || '(无主题)', '', '', d ? new Date(d).toISOString() : new Date().toISOString(), emailDate, 1)
        }
        for (const { uid, flags, parsed: fp, internalDate: id2 } of newRows) {
          const d = id2 || fp.date || null
          const emailDate = d ? new Date(d).getTime() : Date.now()
          const emailId = randomUUID()
          insertEmail.run(emailId, account.id, uid, folderKey,
            fp.from?.value?.[0]?.address || '', fp.from?.value?.[0]?.name || '',
            fp.subject || '(无主题)', (fp.text || '').slice(0, 100).replace(/\n/g, ' '),
            fp.html || fp.text || '', d ? new Date(d).toISOString() : new Date().toISOString(), emailDate,
            flags.includes('\\Seen') ? 1 : 0)
          for (const att of (fp.attachments || [])) {
            if (!att.filename) continue
            insertAtt.run(randomUUID(), emailId, att.filename, att.contentType || 'application/octet-stream', att.size || att.content?.length || 0)
          }
        }
      })()
      resolve(newRows.length + oldRows.length)
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
      connTimeout: 120000,
      authTimeout: 15000,
    })

    imap.once('ready', async () => {
      const folders = FOLDER_MAP[account.type] || FOLDER_MAP.qq
      let total = 0
      for (const [folderKey, imapFolder] of Object.entries(folders)) {
        const candidates = (account.type === 'qq' && QQ_FOLDER_FALLBACK[folderKey])
          ? QQ_FOLDER_FALLBACK[folderKey]
          : [imapFolder]
        for (const candidate of candidates) {
          try {
            const n = await fetchFolder(imap, account, candidate, folderKey)
            total += n
            break // 成功则不再尝试下一个
          } catch (e) {
            // try next candidate
          }
        }
      }
      imap.end()
      resolve(total)
    })

    imap.once('error', reject)
    imap.connect()
  })
}

// 从 IMAP 拉取 before 时间戳之前的邮件，不存 db，直接返回
function fetchOlderEmails(account, config, before, limit = 50) {
  return new Promise((resolve, reject) => {
    const imapCfg = IMAP_CONFIG[account.type]
    if (!imapCfg) return reject(new Error('unsupported type'))
    const imap = new Imap({
      user: account.email, password: config.credential, ...imapCfg,
      tlsOptions: { rejectUnauthorized: false }, connTimeout: 15000, authTimeout: 10000,
    })
    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err || !box || box.messages.total === 0) { imap.end(); return resolve([]) }
        // 用 BEFORE 搜索
        const beforeDate = new Date(before)
        imap.search([['BEFORE', beforeDate]], (err, uids) => {
          if (err || !uids || uids.length === 0) { imap.end(); return resolve([]) }
          // 取最新的 limit 封（uid 最大的）
          const slice = uids.sort((a, b) => b - a).slice(0, limit)
          const fetch = imap.fetch(slice, { bodies: '', struct: true })
          const results = []
          const promises = []
          fetch.on('message', (msg) => {
            let uid = null, uidResolve
            const uidReady = Promise.race([new Promise(r => { uidResolve = r }), new Promise(r => setTimeout(r, 3000))])
            const p = new Promise(res => {
              msg.on('attributes', attrs => { uid = attrs.uid; uidResolve && uidResolve() })
              msg.on('body', stream => {
                simpleParser(stream, { Iconv }, async (err, parsed) => {
                  if (err) return res()
                  await uidReady
                  if (!uid) return res()
                  results.push({
                    uid: String(uid), folder: 'inbox',
                    from_addr: parsed.from?.value?.[0]?.address || '',
                    from_name: parsed.from?.value?.[0]?.name || '',
                    subject: parsed.subject || '(无主题)',
                    preview: (parsed.text || '').slice(0, 100).replace(/\n/g, ' '),
                    date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
                    raw_date: parsed.date ? parsed.date.getTime() : Date.now(),
                    read: 1, starred: 0,
                  })
                  res()
                })
              })
            })
            promises.push(p)
          })
          fetch.once('end', async () => { await Promise.all(promises); imap.end(); resolve(results) })
          fetch.once('error', () => { imap.end(); resolve([]) })
        })
      })
    })
    imap.once('error', reject)
    imap.connect()
  })
}

// 按 UID 实时拉取单封邮件 body
function fetchBodyByUid(account, config, uid, folder) {
  return new Promise((resolve) => {
    const imapCfg = IMAP_CONFIG[account.type]
    if (!imapCfg) return resolve('')
    const imap = new Imap({
      user: account.email, password: config.credential, ...imapCfg,
      tlsOptions: { rejectUnauthorized: false }, connTimeout: 15000, authTimeout: 10000,
    })
    const folderMap = FOLDER_MAP[account.type] || FOLDER_MAP.qq
    const imapFolder = folderMap[folder] || 'INBOX'
    imap.once('ready', () => {
      imap.openBox(imapFolder, true, (err) => {
        if (err) { imap.end(); return resolve('') }
        imap.search([['UID', `${uid}:${uid}`]], (err2, seqNos) => {
          if (err2 || !seqNos || seqNos.length === 0) { imap.end(); return resolve('') }
          const f = imap.fetch(seqNos, { bodies: '' })
          f.on('message', msg => {
            msg.on('body', stream => {
              simpleParser(stream, { Iconv }, (err3, parsed) => {
                const body = (!err3 && (parsed.html || parsed.text)) || ''
                imap.end()
                resolve(body)
              })
            })
          })
          f.once('error', () => { imap.end(); resolve('') })
        })
      })
    })
    imap.once('error', () => resolve(''))
    imap.connect()
  })
}

module.exports = { fetchEmails, fetchOlderEmails, fetchBodyByUid }
