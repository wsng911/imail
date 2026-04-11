const { ConfidentialClientApplication } = require('@azure/msal-node')
const cfg = require('./config')
const fs = require('fs')
const path = require('path')

const SCOPES = ['https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.ReadWrite', 'https://graph.microsoft.com/Mail.Send', 'offline_access']

const TEMP_DIR = process.env.DATA_DIR || process.env.TEMP_DIR || path.resolve(process.cwd(), cfg.server.data_dir || './data')
fs.mkdirSync(TEMP_DIR, { recursive: true })

function tokenCachePath(accountId) {
  return path.join(TEMP_DIR, `msal_${accountId || 'shared'}.json`)
}

function buildClient(cacheId) {
  const cachePath = tokenCachePath(cacheId)
  return new ConfidentialClientApplication({
    auth: {
      clientId: cfg.outlook.client_id,
      clientSecret: cfg.outlook.client_secret,
      authority: 'https://login.microsoftonline.com/common',
    },
    cache: {
      cachePlugin: {
        beforeCacheAccess: async (ctx) => {
          if (fs.existsSync(cachePath)) ctx.tokenCache.deserialize(fs.readFileSync(cachePath, 'utf8'))
        },
        afterCacheAccess: async (ctx) => {
          if (ctx.cacheHasChanged) fs.writeFileSync(cachePath, ctx.tokenCache.serialize())
        },
      },
    },
  })
}

async function getAuthUrl(redirectUri) {
  const params = { scopes: SCOPES, redirectUri, prompt: 'select_account' }
  return buildClient('shared').getAuthCodeUrl(params)
}

async function handleCallback(code, redirectUri) {
  const tmpId = `tmp_${Date.now()}`
  const client = buildClient(tmpId)
  const result = await client.acquireTokenByCode({ code, scopes: SCOPES, redirectUri })
  const email = result.account.username
  const tmpPath = tokenCachePath(tmpId)
  // afterCacheAccess 是异步回调，等待确保写入
  await new Promise(r => setTimeout(r, 200))
  return { result, email, tmpCachePath: tmpPath }
}

async function getAccessToken(accountId) {
  const db = require('./db')
  const acc = db.prepare('SELECT email, config FROM accounts WHERE id = ?').get(accountId)
  if (!acc) throw new Error('token_expired')
  const homeAccountId = JSON.parse(acc.config).refreshToken || null
  const client = buildClient(acc.email)
  const accounts = await client.getTokenCache().getAllAccounts()
  if (!accounts.length) throw new Error('token_expired')
  const account = homeAccountId
    ? accounts.find(a => a.homeAccountId === homeAccountId) || accounts[0]
    : accounts[0]
  try {
    const result = await client.acquireTokenSilent({ scopes: SCOPES, account })
    return result.accessToken
  } catch (e) {
    throw new Error('token_expired')
  }
}

module.exports = { getAuthUrl, handleCallback, getAccessToken }
