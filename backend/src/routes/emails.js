const router = require('express').Router()
const db = require('../db')
const accountsDb = require('../accountsDb')
const { convert } = require('html-to-text')
const toPlainText = (html) => html ? convert(html, { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }, { selector: 'a', options: { ignoreHref: true } }] }).slice(0, 5000) : ''
const { fetchEmails } = require('../imap')
const { getAuthUrl, handleCallback, getAccessToken } = require('../outlook')
const { randomUUID } = require('crypto')
const nodemailer = require('nodemailer')

// POST /api/emails/send
router.post('/send', async (req, res) => {
  const { fromAccountId, to, bcc, subject, body } = req.body
  if (!fromAccountId || !to || !subject) return res.status(400).json({ error: 'missing fields' })

  const account = accountsDb.prepare('SELECT * FROM accounts WHERE id = ?').get(fromAccountId)
  if (!account) return res.status(404).json({ error: 'account not found' })

  const config = JSON.parse(account.config)
  let transporter

  if (account.type === 'outlook') {
    const accessToken = await getAccessToken(account.id)
    transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { type: 'OAuth2', user: account.email, accessToken },
    })
  } else {
    const smtpHost = account.type === 'gmail' ? 'smtp.gmail.com' : 'smtp.qq.com'
    const smtpPort = account.type === 'gmail' ? 587 : 587
    transporter = nodemailer.createTransport({
      host: smtpHost, port: smtpPort, secure: false,
      auth: { user: account.email, pass: config.credential },
    })
  }

  await transporter.sendMail({
    from: account.email, to, bcc: bcc || undefined,
    subject, text: body, html: body,
  })

  res.json({ ok: true })
})

// GET /api/emails?accountId=&folder=inbox&page=1
router.get('/', (req, res) => {
  const { accountId, folder = 'inbox', page = 1 } = req.query
  const limit = 50
  const offset = (page - 1) * limit

  let rows
  if (accountId) {
    rows = db.prepare(`SELECT id, account_id, from_addr, from_name, subject, preview, date, read, starred, folder
      FROM emails WHERE account_id = ? AND folder = ? AND deleted = 0
      ORDER BY raw_date DESC LIMIT ? OFFSET ?`).all(accountId, folder, limit, offset)
  } else {
    rows = db.prepare(`SELECT id, account_id, from_addr, from_name, subject, preview, date, read, starred, folder
      FROM emails WHERE folder = ? AND deleted = 0
      ORDER BY raw_date DESC LIMIT ? OFFSET ?`).all(folder, limit, offset)
  }
  res.json(rows)
})

// GET /api/emails/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM emails WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'not found' })
  // auto mark read
  db.prepare('UPDATE emails SET read = 1 WHERE id = ?').run(req.params.id)
  res.json({ ...row, read: 1 })
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

// DELETE /api/emails/:id  (soft delete)
router.delete('/:id', (req, res) => {
  db.prepare('UPDATE emails SET deleted = 1 WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// POST /api/emails/sync/:accountId
router.post('/sync/:accountId', async (req, res) => {
  const account = accountsDb.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.accountId)
  if (!account) return res.status(404).json({ error: 'account not found' })

  const config = JSON.parse(account.config)

  if (account.type === 'outlook') {
    const token = await getAccessToken(account.id)
    const nodeFetch = (await import('node-fetch')).default
    let url = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=999&$orderby=receivedDateTime desc&$select=id,subject,from,bodyPreview,body,receivedDateTime,isRead'
    let count = 0
    while (url) {
      const resp = await nodeFetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const data = await resp.json()
      for (const msg of (data.value || [])) {
        const existing = db.prepare('SELECT id FROM emails WHERE account_id = ? AND uid = ?').get(account.id, msg.id)
        if (!existing) {
          db.prepare(`INSERT INTO emails (id, account_id, uid, folder, from_addr, from_name, subject, preview, body, date, read, raw_date)
            VALUES (?, ?, ?, 'inbox', ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(randomUUID(), account.id, msg.id,
              msg.from?.emailAddress?.address || '',
              msg.from?.emailAddress?.name || '',
              msg.subject || '(无主题)',
              (msg.bodyPreview || '').slice(0, 100),
              msg.body?.content ? toPlainText(msg.body.content) : '',
              msg.receivedDateTime || '',
              msg.isRead ? 1 : 0,
              msg.receivedDateTime ? new Date(msg.receivedDateTime).getTime() : 0,
            )
          count++
        }
      }
      url = data['@odata.nextLink'] || null
    }
    return res.json({ synced: count })
  }

  const count = await fetchEmails(account, config)
  res.json({ synced: count })
})

// Outlook OAuth2 flow
router.get('/oauth/outlook', async (req, res) => {
  const redirectUri = `${req.protocol}://${req.get('host')}/api/emails/oauth/outlook/callback`
  const url = await getAuthUrl(redirectUri)
  res.redirect(url)
})

router.get('/oauth/outlook/callback', async (req, res) => {
  const { code } = req.query
  const redirectUri = `${req.protocol}://${req.get('host')}/api/emails/oauth/outlook/callback`
  const result = await handleCallback(code, redirectUri)

  const email = result.account.username
  const existing = accountsDb.prepare('SELECT id FROM accounts WHERE email = ?').get(email)
  if (!existing) {
    const count = accountsDb.prepare('SELECT COUNT(*) as n FROM accounts').get().n
    const COLORS = ['#4A90D9','#E91E8C','#FF7043','#8BC34A','#9C27B0','#26A69A','#FF9800','#607D8B']
    accountsDb.prepare('INSERT INTO accounts (id, email, type, color, config) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), email, 'outlook', COLORS[count % COLORS.length],
        JSON.stringify({ refreshToken: result.account.homeAccountId }))
  }

  res.redirect('/?oauth=success')
})

module.exports = router
