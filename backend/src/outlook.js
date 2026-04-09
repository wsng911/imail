const { ConfidentialClientApplication } = require('@azure/msal-node')
const db = require('./db')
const cfg = require('./config')
const fs = require('fs')
const path = require('path')

const SCOPES = ['https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.ReadWrite', 'https://graph.microsoft.com/Mail.Send', 'offline_access']

const TEMP_DIR = process.env.DATA_DIR || process.env.TEMP_DIR || path.resolve(process.cwd(), cfg.server.data_dir || './data')
fs.mkdirSync(TEMP_DIR, { recursive: true })

function tokenCachePath(accountId) {
  return path.join(TEMP_DIR, `msal_${accountId || 'shared'}.json`)
}

function buildClient(accountId) {
  const cachePath = tokenCachePath(accountId)
  return new ConfidentialClientApplication({
    auth: {
      clientId: cfg.outlook.client_id,
      clientSecret: cfg.outlook.client_secret,
      authority: 'https://login.microsoftonline.com/common',
    },
    cache: {
      cachePlugin: {
        beforeCacheAccess: async (ctx) => {
          if (fs.existsSync(cachePath)) {
            ctx.tokenCache.deserialize(fs.readFileSync(cachePath, 'utf8'))
          }
        },
        afterCacheAccess: async (ctx) => {
          if (ctx.cacheHasChanged) {
            fs.writeFileSync(cachePath, ctx.tokenCache.serialize())
          }
        },
      },
    },
  })
}

async function getAuthUrl(redirectUri) {
  return buildClient('shared').getAuthCodeUrl({ scopes: SCOPES, redirectUri })
}

async function handleCallback(code, redirectUri) {
  const client = buildClient('shared')
  const result = await client.acquireTokenByCode({ code, scopes: SCOPES, redirectUri })
  return { result, email: result.account.username }
}

async function getAccessToken(accountId) {
  const client = buildClient(accountId)
  const accounts = await client.getTokenCache().getAllAccounts()
  if (!accounts.length) throw new Error('no cached account, re-auth required')
  const result = await client.acquireTokenSilent({ scopes: SCOPES, account: accounts[0] })
  return result.accessToken
}

module.exports = { getAuthUrl, handleCallback, getAccessToken }
