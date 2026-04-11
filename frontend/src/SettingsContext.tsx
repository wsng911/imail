import { createContext, useContext, useEffect, useState } from 'react'
import { LS } from './constants'

type Theme = 'light' | 'dark'
type FontSize = 'small' | 'medium' | 'large'

interface Settings {
  theme: Theme
  fontSize: FontSize
  setTheme: (v: Theme) => void
  setFontSize: (v: FontSize) => void
}

const SettingsContext = createContext<Settings>(null!)

const fontSizeMap: Record<FontSize, string> = { small: '13px', medium: '15px', large: '17px' }

async function saveSettings(patch: object) {
  await fetch('/api/settings', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(LS.THEME) as Theme) || 'light'
  )
  const [fontSize, setFontSizeState] = useState<FontSize>(
    () => (localStorage.getItem(LS.FONT_SIZE) as FontSize) || 'medium'
  )

  // Sync from backend (may override localStorage if changed on another device)
  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.theme) { setThemeState(data.theme); localStorage.setItem(LS.THEME, data.theme) }
        if (data.fontSize) { setFontSizeState(data.fontSize); localStorage.setItem(LS.FONT_SIZE, data.fontSize) }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    document.documentElement.style.fontSize = fontSizeMap[fontSize]
  }, [fontSize])

  const setTheme = (v: Theme) => { setThemeState(v); localStorage.setItem(LS.THEME, v); saveSettings({ theme: v }) }
  const setFontSize = (v: FontSize) => { setFontSizeState(v); localStorage.setItem(LS.FONT_SIZE, v); saveSettings({ fontSize: v }) }

  return (
    <SettingsContext.Provider value={{ theme, fontSize, setTheme, setFontSize }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)
