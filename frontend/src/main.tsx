import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import LoginPage from './components/LoginPage.tsx'
import { SettingsProvider } from './SettingsContext.tsx'

function Root() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const params = new URLSearchParams(window.location.search)
  const oauthError = params.get('oauth') === 'error' ? (params.get('reason') || '授权失败') : null
  const oauthEmail = params.get('oauth') === 'success' ? params.get('email') : null

  useEffect(() => {
    if (params.get('oauth')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setAuthenticated(d.authenticated))
      .catch(() => setAuthenticated(false))
  }, [])

  if (authenticated === null) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">
      <div className="text-2xl">📬</div>
    </div>
  )

  if (!authenticated) return <LoginPage onLogin={() => setAuthenticated(true)} />

  return (
    <SettingsProvider>
      {oauthError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          授权失败：{oauthError}
        </div>
      )}
      {oauthEmail && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          授权成功：{oauthEmail}
        </div>
      )}
      <App />
    </SettingsProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
