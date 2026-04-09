import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import LoginPage from './components/LoginPage.tsx'
import { SettingsProvider } from './SettingsContext.tsx'

function Root() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
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
      <App />
    </SettingsProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
