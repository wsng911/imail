const router = require('express').Router()
const db = require('../db')
const accountsDb = require('../accountsDb')
const { convert } = require('html-to-text')
const toPlainText = (html) => html ? convert(html, { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }, { selector: 'a', options: { ignoreHref: true } }] }).slice(0, 5000) : ''
const { fetchEmails, fetchOlderEmails } = require('../imap')
const { getAuthUrl, handleCallback, getAccessToken } = require('../outlook')
const { randomUUID } = require('crypto')
const nodemailer = require('nodemailer')
const fs = require('fs')
const path = require('path')

// POST /api/emails/send
router.post('/send', async (req, res) => {
  const { fromAccountId, to, bcc, subject, body } = req.body
  if (!fromAccountId || !to || !subject) return res.status(400).json({ error: 'missing fields' })

  const account = accountsDb.prepare('SELECT * FROM accounts WHERE id = ?').get(fromAccountId)
  if (!account) return res.status(404).json({ error: 'account not found' })

  const config = JSON.parse(account.config)
  let transporter

  if (account.type === 'outlook') {
    let accessToken
    try { accessToken = await getAccessToken(account.id) }
    catch (e) { return res.status(401).json({ error: 'token_expired', message: '授权已过期，请重新添加账号' }) }
    transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { type: 'OAuth2', user: account.email, accessToken },
    })
  } else {
    const smtpHost = account.type === 'gmail' ? 'smtp.gmail.com' : 'smtp.qq.com'
    const smtpPort = account.type === 'gmail' ? 587 : 465
    transporter = nodemailer.createTransport({
      host: smtpHost, port: smtpPort, secure: account.type !== 'gmail',
      auth: { user: account.email, pass: config.credential },
    })
  }

  try {
    await transporter.sendMail({
      from: account.email, to, bcc: bcc || undefined,
      subject, text: body, html: body,
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'send_failed', message: e.message })
  }
})

// GET /api/emails?accountId=&folder=inbox&page=1
router.get('/', (req, res) => {
  const { accountId, folder = 'inbox', page = 1 } = req.query
  const limit = 50
  const offset = (page - 1) * limit
  const attSub = `(SELECT COUNT(*) FROM attachments WHERE email_id = emails.id) > 0 AS has_attachment`
  
  let rows
  if (folder === 'unread') {
    rows = accountId
      ? db.prepare(`SELECT id, account_id, from_addr, from_name, subject, preview, date, raw_date, read, starred, folder, ${attSub} FROM emails WHERE account_id = ? AND read = 0 AND deleted = 0 ORDER BY raw_date DESC LIMIT ? OFFSET ?`).all(accountId, limit, offset)
      : db.prepare(`SELECT id, account_id, from_addr, from_name, subject, preview, date, raw_date, read, starred, folder, ${attSub} FROM emails WHERE read = 0 AND deleted = 0 ORDER BY raw_date DESC LIMIT ? OFFSET ?`).all(limit, offset)
  } else if (folder === 'starred') {
    rows = accountId
      ? db.prepare(`SELECT id, account_id, from_addr, from_name, subject, preview, date, raw_date, read, starred, folder, ${attSub} FROM emails WHERE account_id = ? AND starred = 1 AND deleted = 0 ORDER BY raw_date DESC LIMIT ? OFFSET ?`).all(accountId, limit, offset)
      : db.prepare(`SELECT id, account_id, from_addr, from_name, subject, preview, date, raw_date, read, starred, folder, ${attSub} FROM emails WHERE starred = 1 AND deleted = 0 ORDER BY raw_date DESC LIMIT ? OFFSET ?`).all(limit, offset)
  } else if (accountId) {
    rows = db.prepare(`SELECT id, account_id, from_addr, from_name, subject, preview, date, raw_date, read, starred, folder, ${attSub} FROM emails WHERE account_id = ? AND folder = ? AND deleted = 0 ORDER BY raw_date DESC LIMIT ? OFFSET ?`).all(accountId, folder, limit, offset)
  } else {
    rows = db.prepare(`SELECT id, account_id, from_addr, from_name, subject, preview, date, raw_date, read, starred, folder, ${attSub} FROM emails WHERE folder = ? AND deleted = 0 ORDER BY raw_date DESC LIMIT ? OFFSET ?`).all(folder, limit, offset)
  }
  res.json(rows)
})

// GET /api/emails/stats
router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as n FROM emails WHERE deleted=0').get().n
  const unread = db.prepare('SELECT COUNT(*) as n FROM emails WHERE deleted=0 AND read=0').get().n
  const starred = db.prepare('SELECT COUNT(*) as n FROM emails WHERE deleted=0 AND starred=1').get().n
  const noBody = db.prepare("SELECT COUNT(*) as n FROM emails WHERE deleted=0 AND (body='' OR body IS NULL)").get().n
  res.json({ total, unread, starred, listOnly: noBody, withBody: total - noBody })
})

// GET /api/emails/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM emails WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'not found' })
  if (!row.read) db.prepare('UPDATE emails SET read = 1 WHERE id = ?').run(req.params.id)
  res.json({ ...row, read: 1 })
})

// PATCH /api/emails/batch { ids, read, starred }
router.patch('/batch', (req, res) => {
  const { ids, read, starred } = req.body
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' })
  const fields = []
  const vals = []
  if (read !== undefined) { fields.push('read = ?'); vals.push(read ? 1 : 0) }
  if (starred !== undefined) { fields.push('starred = ?'); vals.push(starred ? 1 : 0) }
  if (!fields.length) return res.status(400).json({ error: 'nothing to update' })
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`UPDATE emails SET ${fields.join(', ')} WHERE id IN (${placeholders})`).run(...vals, ...ids)
  res.json({ ok: true })
})

// PATCH /api/emails/:id  { read, starred, folder }
router.patch('/:id', (req, res) => {
  const { read, starred, folder } = req.body
  const fields = []
  const vals = []
  if (read !== undefined)    { fields.push('read = ?');    vals.push(read ? 1 : 0) }
  if (starred !== undefined) { fields.push('starred = ?'); vals.push(starred ? 1 : 0) }
  if (folder !== undefined)  { fields.push('folder = ?');  vals.push(folder) }
  if (!fields.length) return res.status(400).json({ error: 'nothing to update' })
  vals.push(req.params.id)
  db.prepare(`UPDATE emails SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
  res.json({ ok: true })
})

// DELETE /api/emails/:id  → 移到 trash；trash 里再删才真正软删除
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT folder FROM emails WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'not found' })
  if (row.folder === 'trash') {
    db.prepare('UPDATE emails SET deleted = 1 WHERE id = ?').run(req.params.id)
  } else {
    db.prepare('UPDATE emails SET folder = \'trash\' WHERE id = ?').run(req.params.id)
  }
  res.json({ ok: true })
})

// GET /api/emails/:id/body — 实时从 IMAP/Outlook 拉取 body
router.get('/:id/body', async (req, res) => {
  const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(req.params.id)
  if (!email) return res.status(404).json({ error: 'not found' })
  if (email.body) return res.json({ body: email.body })
  const account = accountsDb.prepare('SELECT * FROM accounts WHERE id = ?').get(email.account_id)
  if (!account) return res.status(404).json({ error: 'account not found' })
  const config = JSON.parse(account.config)
  try {
    if (account.type === 'outlook') {
      const token = await getAccessToken(account.id)
      const nodeFetch = (await import('node-fetch')).default
      const data = await nodeFetch(`https://graph.microsoft.com/v1.0/me/messages/${email.uid}?$select=body`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
      const body = data.body?.content || ''
      if (body) db.prepare('UPDATE emails SET body = ? WHERE id = ?').run(body, email.id)
      return res.json({ body })
    } else {
      const { fetchBodyByUid } = require('../imap')
      const body = await fetchBodyByUid(account, config, email.uid, email.folder)
      if (body) db.prepare('UPDATE emails SET body = ? WHERE id = ?').run(body, email.id)
      return res.json({ body: body || '' })
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/emails/:id/attachments
router.get('/:id/attachments', (req, res) => {
  const rows = db.prepare('SELECT id, filename, content_type, size FROM attachments WHERE email_id = ?').all(req.params.id)
  res.json(rows)
})

// GET /api/emails/:id/attachments/:attId
router.get('/:id/attachments/:attId', (req, res) => {
  res.status(404).json({ error: 'attachment_data_not_stored' })
})

// GET /api/emails/fetch-older?accountId=&before=
router.get('/fetch-older', async (req, res) => {
  const { accountId, before } = req.query
  if (!accountId || !before) return res.status(400).json({ error: 'missing params' })
  const account = accountsDb.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId)
  if (!account) return res.status(404).json({ error: 'account not found' })
  const config = JSON.parse(account.config)
  try {
    if (account.type === 'outlook') {
      const token = await getAccessToken(accountId)
      const beforeDate = new Date(parseInt(before)).toISOString()
      const url = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc&$filter=receivedDateTime lt ${beforeDate}&$select=id,subject,from,bodyPreview,receivedDateTime,isRead`
      const data = await (await require('node-fetch')(url, { headers: { Authorization: `Bearer ${token}` } })).json()
      const rows = (data.value || []).map(msg => ({
        uid: msg.id, folder: 'inbox',
        from_addr: msg.from?.emailAddress?.address || '',
        from_name: msg.from?.emailAddress?.name || '',
        subject: msg.subject || '(无主题)',
        preview: (msg.bodyPreview || '').slice(0, 100),
        date: msg.receivedDateTime || new Date().toISOString(),
        raw_date: msg.receivedDateTime ? new Date(msg.receivedDateTime).getTime() : Date.now(),
        read: msg.isRead ? 1 : 0, starred: 0,
      }))
      return res.json(rows)
    } else {
      const rows = await fetchOlderEmails(account, config, parseInt(before))
      return res.json(rows)
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/emails/sync/:accountId
router.post('/sync/:accountId', async (req, res) => {
  const account = accountsDb.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.accountId)
  if (!account) return res.status(404).json({ error: 'account not found' })

  const config = JSON.parse(account.config)

  if (account.type === 'outlook') {
    let token
    try { token = await getAccessToken(account.id) }
    catch (e) { return res.status(401).json({ error: 'token_expired', message: '授权已过期，请重新添加账号' }) }
    const nodeFetch = (await import('node-fetch')).default
    const OUTLOOK_FOLDERS = {
      inbox: 'inbox',
      sent: 'sentitems',
      draft: 'drafts',
      trash: 'deleteditems',
      spam: 'junkemail',
    }
    let count = 0
    const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
    for (const [folderKey, folderId] of Object.entries(OUTLOOK_FOLDERS)) {
      let url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages?$top=999&$orderby=receivedDateTime desc&$select=id,subject,from,bodyPreview,body,receivedDateTime,isRead,hasAttachments`
      let pageCount = 0
      while (url && pageCount < 20) {
        pageCount++
        const resp = await nodeFetch(url, { headers: { Authorization: `Bearer ${token}` } })
        const data = await resp.json()
        const attTasks = []
        for (const msg of (data.value || [])) {
          const existing = db.prepare('SELECT id FROM emails WHERE account_id = ? AND uid = ?').get(account.id, msg.id)
          if (!existing) {
            const emailId = randomUUID()
            const emailDate = msg.receivedDateTime ? new Date(msg.receivedDateTime).getTime() : Date.now()
            const isOld = emailDate < threeMonthsAgo
            const body = isOld ? '' : (msg.body?.content || '')
            const read = isOld ? 1 : (msg.isRead ? 1 : 0)
            db.prepare(`INSERT INTO emails (id, account_id, uid, folder, from_addr, from_name, subject, preview, body, date, read, raw_date)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(emailId, account.id, msg.id, folderKey,
                msg.from?.emailAddress?.address || '',
                msg.from?.emailAddress?.name || '',
                msg.subject || '(无主题)',
                (msg.bodyPreview || '').slice(0, 100),
                body,
                msg.receivedDateTime || new Date().toISOString(),
                read,
                emailDate,
              )
            if (!isOld && msg.hasAttachments) {
              attTasks.push(async () => {
                try {
                  const attData = await nodeFetch(`https://graph.microsoft.com/v1.0/me/messages/${msg.id}/attachments?$select=id,name,contentType,size`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
                  for (const att of (attData.value || [])) {
                    if (att['@odata.type'] !== '#microsoft.graph.fileAttachment') continue
                    db.prepare('INSERT OR IGNORE INTO attachments (id, email_id, filename, content_type, size) VALUES (?, ?, ?, ?, ?)')
                      .run(randomUUID(), emailId, att.name || 'attachment', att.contentType || 'application/octet-stream', att.size || 0)
                  }
                } catch {}
              })
            }
            count++
          }
        }
        for (const task of attTasks) await task()
        url = data['@odata.nextLink'] || null
      }
    }
    const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    db.prepare('UPDATE emails SET read = 1 WHERE account_id = ? AND read = 0 AND (raw_date < ? OR raw_date = 0) AND deleted = 0')
      .run(account.id, oneMonthAgo)
    return res.json({ synced: count })
  }
  // 标记超过一个月的邮件为已读
  const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  // 立即返回，后台异步同步
  res.json({ ok: true, async: true })
  try {
    const count = await fetchEmails(account, config)
    db.prepare('UPDATE emails SET read = 1 WHERE account_id = ? AND read = 0 AND (raw_date < ? OR raw_date = 0) AND deleted = 0')
      .run(account.id, oneMonthAgo)
    console.log(`[sync] ${account.email} synced ${count}`)
  } catch (e) {
    console.error(`[sync] ${account.email} failed:`, e.message)
  }
})


module.exports = router
