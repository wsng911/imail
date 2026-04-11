/**
 * iMail OAuth Relay
 * 
 * Azure 回调地址：https://your-relay-domain.com/oauth/callback
 * 
 * 流程：
 * 1. 用户发起授权时，iMail 把 state=base64(用户实例回调地址) 传给 Azure
 * 2. Azure 授权后回调到本服务
 * 3. 本服务从 state 解析出用户实例地址，把 code 转发过去
 */

const express = require('express')
const app = express()

const PORT = process.env.PORT || 3100

// GET /oauth/callback?code=xxx&state=base64(callbackUrl)
app.get('/oauth/callback', (req, res) => {
  const { code, error, error_description, state } = req.query

  if (error) {
    return res.status(400).send(`
      <h2>授权失败</h2>
      <p>${error}: ${error_description}</p>
    `)
  }

  if (!state) {
    return res.status(400).send('缺少 state 参数')
  }

  let targetUrl
  try {
    targetUrl = Buffer.from(state, 'base64').toString('utf8')
    new URL(targetUrl) // 验证是合法 URL
  } catch {
    return res.status(400).send('无效的 state 参数')
  }

  // 把 code 转发到用户实例
  const redirect = new URL(targetUrl)
  redirect.searchParams.set('code', code)
  redirect.searchParams.set('state', state)

  res.redirect(redirect.toString())
})

// 健康检查
app.get('/health', (_, res) => res.json({ ok: true }))

app.listen(PORT, () => console.log(`OAuth Relay running on :${PORT}`))
