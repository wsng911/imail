import { useState } from 'react'
import { ArrowLeft, Settings, Plus, ChevronDown, ChevronUp, Trash2, Upload, Download, KeyRound } from 'lucide-react'
import type { Account } from '../types'
import { useSettings } from '../SettingsContext'

function AccLogo({ type, email }: { type: string; email: string }) {
  const domain = email.toLowerCase().split('@')[1] || ''
  const isHotmail = domain.startsWith('hotmail.')
  const isLive = domain.startsWith('live.')
  const src = isLive ? '/live.png' : isHotmail ? '/hotmail.png'
    : type === 'gmail' ? '/gmail.png' : type === 'outlook' ? '/outlook.png'
    : type === 'qq' ? '/qq.png' : null
  if (!src) return <div className="w-5 h-5 rounded bg-gray-200 flex-shrink-0" />
  return <img src={src} alt={type} className="w-5 h-5 object-contain flex-shrink-0" />
}

interface Props {
  accounts: Account[]
  onBack: () => void
  onAddAccount: () => void
  onDeleteAccount: (id: string) => void
}

export default function SettingsPage({ accounts, onBack, onAddAccount, onDeleteAccount }: Props) {
  const [generalOpen, setGeneralOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const { theme, setTheme, fontSize, setFontSize } = useSettings()
  const [exportMsg, setExportMsg] = useState('')
  const [importMsg, setImportMsg] = useState('')

  async function handleChangePw() {
    if (newPw !== newPw2) { setPwMsg('两次密码不一致'); return }
    if (newPw.length < 4) { setPwMsg('新密码至少4位'); return }
    const res = await fetch('/api/auth/change-password', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
    })
    const d = await res.json()
    if (d.ok) { setPwMsg('✓ 修改成功'); setOldPw(''); setNewPw(''); setNewPw2('') }
    else setPwMsg(`✗ ${d.error}`)
  }

  async function handleExport() {
    const res = await fetch('/api/migrate/bundle', { credentials: 'include' })
    if (!res.ok) { setExportMsg('✗ 导出失败'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'imail_accounts.zip'
    a.click()
    URL.revokeObjectURL(url)
    setExportMsg('✓ 已下载')
  }

  async function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      if (!confirm('导入将合并账号数据，确认继续？')) return
      setImportMsg('导入中...')
      const res = await fetch('/api/migrate/bundle', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/zip' },
        body: file,
      })
      const d = await res.json()
      setImportMsg(d.ok ? `✓ 已导入 ${d.imported} 个账号` : `✗ ${d.error}`)
    }
    input.click()
  }

  return (
    <div className="flex flex-col h-full bg-gray-100 text-[0.8em]">
      <div onClick={onBack} className="flex items-center gap-3 px-4 py-3 bg-gray-100 border-b border-gray-200 cursor-pointer hover:bg-gray-200">
        <ArrowLeft size={22} className="text-gray-600" />
        <h1 className="text-[1.1em] font-semibold text-gray-900">设置</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* General */}
        <div className="bg-white mt-2">
          <button
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50"
            onClick={() => setGeneralOpen(o => !o)}
          >
            <Settings size={20} className="text-gray-500" />
            <span className="flex-1 text-left text-gray-800">常规设置</span>
            {generalOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </button>

          {generalOpen && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-4">
              {/* Font size */}
              <div className="flex items-center justify-between">
                <span className="text-[1em] text-gray-700">字体大小</span>
                <div className="flex gap-1">
                  {(['small', 'medium', 'large'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setFontSize(s)}
                      className={`px-3 py-1 rounded text-[0.85em] border ${fontSize === s ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                      {s === 'small' ? '小' : s === 'medium' ? '中' : '大'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme */}
              <div className="flex items-center justify-between">
                <span className="text-[1em] text-gray-700">主题</span>
                <div className="flex gap-1">
                  {(['light', 'dark'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`px-3 py-1 rounded text-[0.85em] border ${theme === t ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                      {t === 'light' ? '浅色' : '深色'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Change password */}
        <div className="bg-white mt-2">
          <button className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50" onClick={() => setPwOpen(o => !o)}>
            <KeyRound size={20} className="text-gray-500" />
            <span className="flex-1 text-left text-gray-800">修改密码</span>
            {pwOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </button>
          {pwOpen && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-3">
              {(['原密码', '新密码', '确认新密码'] as const).map((label, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[0.9em] text-gray-500 w-20 flex-shrink-0">{label}</span>
                  <input type="password" value={[oldPw, newPw, newPw2][i]}
                    onChange={e => [setOldPw, setNewPw, setNewPw2][i](e.target.value)}
                    className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-[0.9em] focus:outline-none focus:border-blue-400" />
                </div>
              ))}
              {pwMsg && <div className={`text-[0.85em] ${pwMsg.startsWith('✓') ? 'text-green-500' : 'text-red-500'}`}>{pwMsg}</div>}
              <button onClick={handleChangePw} className="w-full py-2 bg-blue-500 text-white rounded-lg text-[0.9em] hover:bg-blue-600">确认修改</button>
            </div>
          )}
        </div>

        {/* Accounts section */}
        <div className="mt-4">
          <div className="px-4 py-2 text-[1em] font-semibold text-blue-500">账号</div>
          <div className="bg-white">
            {[...accounts]
              .sort((a, b) => {
                const typeOrder: Record<string, number> = { gmail: 0, outlook: 1, qq: 2 }
                const td = (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9)
                if (td !== 0) return td
                if (a.type === 'outlook') {
                  const domainOrder = (e: string) => { const d = e.split('@')[1]?.toLowerCase() || ''; return d.startsWith('outlook.') ? 0 : d.startsWith('hotmail.') ? 1 : d.startsWith('live.') ? 2 : 3 }
                  const dd = domainOrder(a.email) - domainOrder(b.email)
                  if (dd !== 0) return dd
                }
                return a.email.localeCompare(b.email)
              })
              .map(acc => (
              <div key={acc.id} className="flex items-center gap-3 px-4 py-4 border-b border-gray-50">
                <AccLogo type={acc.type} email={acc.email} />
                <div className="flex-1 min-w-0">
                  <div className="text-[1em] font-medium text-gray-800 truncate">{acc.email}</div>
                  <div className="text-[0.85em] text-gray-400 truncate">{acc.type}</div>
                </div>
                <button
                  onClick={() => { if (confirm(`删除账号 ${acc.email}？`)) onDeleteAccount(acc.id) }}
                  className="p-1 text-gray-300 hover:text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              onClick={onAddAccount}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50"
            >
              <Plus size={20} className="text-gray-400" />
              <span className="text-gray-700">添加账号</span>
            </button>
          </div>
        </div>

        {/* Migration */}
        <div className="mt-4 mb-6">
          <div className="px-4 py-2 text-[1em] font-semibold text-blue-500">数据迁移</div>
          <div className="bg-white divide-y divide-gray-50">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-[0.95em] text-gray-700">导出账号</div>
                <div className="text-[0.8em] text-gray-400">打包账号配置为 zip 下载</div>
                {exportMsg && <div className="text-[0.8em] text-gray-500 mt-1">{exportMsg}</div>}
              </div>
              <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 text-white rounded-lg text-[0.9em] hover:bg-blue-600">
                <Download size={14} /> 导出
              </button>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-[0.95em] text-gray-700">导入账号</div>
                <div className="text-[0.8em] text-gray-400">选择 zip 文件恢复账号配置</div>
                {importMsg && <div className="text-[0.8em] text-gray-500 mt-1">{importMsg}</div>}
              </div>
              <button onClick={handleImport} className="flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white rounded-lg text-[0.9em] hover:bg-green-600">
                <Upload size={14} /> 导入
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
