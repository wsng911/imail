import { useState } from 'react'
import { RefreshCw, Plus, Settings, ChevronRight, ChevronLeft, Inbox, Send, FileText, Trash2, AlertCircle } from 'lucide-react'
import type { Account } from '../types'

export const ALL_INBOXES = '__all__'

export function parseFolderId(id: string | null) {
  if (!id || !id.includes('::')) return { accountId: id, folder: 'inbox' }
  const [accountId, folder] = id.split('::')
  return { accountId, folder }
}

const FOLDERS = [
  { key: 'inbox',  label: '收件箱',  icon: Inbox },
  { key: 'sent',   label: '已发送',  icon: Send },
  { key: 'draft',  label: '草稿箱',  icon: FileText },
  { key: 'spam',   label: '垃圾邮件', icon: AlertCircle },
  { key: 'trash',  label: '已删除',  icon: Trash2 },
]

const TYPE_LABELS: Record<string, string> = { gmail: 'Gmail', outlook: 'Outlook', qq: 'QQ 邮箱' }

function ProviderLogo({ type, email, size = 6 }: { type: string, email?: string, size?: number }) {
  const isHotmail = email?.toLowerCase().includes('hotmail')
  const isLive = email?.toLowerCase().endsWith('@live.com')

  const src = isLive ? '/live.png'
    : isHotmail ? '/hotmail.png'
    : type === 'gmail' ? '/gmail.png'
    : type === 'outlook' ? '/outlook.png'
    : type === 'qq' ? '/qq.png'
    : null

  const px = size * 4
  if (!src) return <div style={{ width: px, height: px }} className="rounded-lg bg-gray-200 flex-shrink-0" />
  return <img src={src} alt={type} style={{ width: px, height: px }} className="object-contain flex-shrink-0" />
}

function shortEmail(email: string) { return email.split('@')[0] }

type View = { level: 'root' } | { level: 'accounts'; type: string } | { level: 'folders'; account: Account }

interface Props {
  accounts: Account[]
  selectedAccountId: string | null
  onSelectAccount: (id: string | null) => void
  onAddAccount: () => void
  onSettings: () => void
  onSync: () => void
  onClose: () => void
  syncing?: boolean
}

export default function Drawer({ accounts, selectedAccountId, onSelectAccount, onAddAccount, onSettings, onSync, onClose, syncing }: Props) {
  const [view, setView] = useState<View>({ level: 'root' })
  const { accountId: selAccountId } = parseFolderId(selectedAccountId)

  const types = (['gmail', 'outlook', 'qq'] as const).filter(t => accounts.some(a => a.type === t))

  return (
    <div className="flex flex-col bg-white" style={{ height: '100dvh' }}>
      {/* Header */}
      <div
        className={`flex items-center gap-2 px-4 py-4 border-b border-gray-100 ${view.level !== 'root' ? 'cursor-pointer hover:bg-gray-50' : ''}`}
        onClick={() => {
          if (view.level === 'folders') setView({ level: 'accounts', type: view.account.type })
          else if (view.level === 'accounts') setView({ level: 'root' })
        }}
      >
        {view.level !== 'root' && <ChevronLeft size={20} className="text-gray-500 flex-shrink-0" />}
        <span className="font-normal text-gray-600">
          {view.level === 'root' ? <span>@iMail <span className="text-gray-400 text-[0.85em]">by mrlees</span></span>
            : view.level === 'accounts' ? TYPE_LABELS[view.type]
            : shortEmail(view.account.email)}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Root: all inboxes + type groups */}
        {view.level === 'root' && (
          <>
            <button
              onClick={() => { onSelectAccount(ALL_INBOXES); onClose() }}
              className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${selectedAccountId === ALL_INBOXES ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${selectedAccountId === ALL_INBOXES ? 'bg-blue-500' : 'bg-gray-200'}`}>
                <Inbox size={14} className="text-white" />
              </div>
              <span className={`flex-1 text-left text-[0.9em] font-medium ${selectedAccountId === ALL_INBOXES ? 'text-blue-500' : 'text-gray-800'}`}>所有收件箱</span>
            </button>

            {types.map(type => {
              const bgColor = { gmail: 'rgba(234,67,53,0.08)', outlook: 'rgba(0,120,212,0.08)', qq: 'rgba(18,183,245,0.08)' }[type]
              const textColor = { gmail: '#c0392b', outlook: '#0063b1', qq: '#0891b2' }[type]
              return (
                <button key={type} onClick={() => setView({ level: 'accounts', type })}
                  className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:brightness-95"
                  style={{ backgroundColor: bgColor }}>
                  <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                    <ProviderLogo type={type} size={6} />
                  </div>
                  <span className="flex-1 text-left text-[0.9em] font-medium" style={{ color: textColor }}>{TYPE_LABELS[type]}</span>
                  <ChevronRight size={16} className="text-gray-400" />
                </button>
              )
            })}
          </>
        )}

        {/* Accounts under a type */}
        {view.level === 'accounts' && accounts.filter(a => a.type === view.type).map(acc => (
          <button key={acc.id} onClick={() => setView({ level: 'folders', account: acc })}
            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${selAccountId === acc.id ? 'bg-blue-50' : ''}`}>
            <ProviderLogo type={acc.type} email={acc.email} />
            <span className={`flex-1 text-left text-[0.9em] truncate ${selAccountId === acc.id ? 'text-blue-500 font-medium' : 'text-gray-700'}`}>
              {shortEmail(acc.email)}
            </span>
            {acc.unread > 0 && <span className="text-[0.78em] font-medium text-gray-400">{acc.unread}</span>}
            <ChevronRight size={16} className="text-gray-400" />
          </button>
        ))}

        {/* Folders under an account */}
        {view.level === 'folders' && (() => {
          const baseColor = { gmail: '234,67,53', outlook: '0,120,212', qq: '18,183,245' }[view.account.type] || '99,102,241'
          return FOLDERS.map((f, i) => {
            const folderId = `${view.account.id}::${f.key}`
            const isSelected = selectedAccountId === folderId
            const Icon = f.icon
            const alpha = (0.12 - i * 0.02).toFixed(2)
            const unread = f.key === 'inbox' ? (view.account.unread || 0) : 0
            const total = f.key === 'inbox' ? (view.account.folderCounts?.['inbox_total'] || 0) : 0
            return (
              <button key={f.key} onClick={() => { onSelectAccount(folderId); onClose() }}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${isSelected ? 'text-blue-500' : 'text-gray-600 hover:brightness-95'}`}
                style={{ backgroundColor: isSelected ? `rgba(${baseColor},0.18)` : `rgba(${baseColor},${alpha})` }}>
                <Icon size={16} className="flex-shrink-0" />
                <span className="flex-1 text-left text-[0.9em]">{f.label}</span>
                {f.key === 'inbox' && (
                  <span className="text-[0.75em] text-gray-400">
                    {total > 0 ? `${unread}/${total}` : unread > 0 ? unread : ''}
                  </span>
                )}
              </button>
            )
          })
        })()}
      </div>

      <div className="border-t border-gray-100 pb-4">
        <button onClick={onSync} disabled={syncing} className="w-full flex items-center gap-3 px-6 py-3 hover:bg-gray-50 text-gray-800">
          <RefreshCw size={14} className={syncing ? 'spinning' : ''} /> <span className="text-[0.7em]">同步全部账号</span>
        </button>
        <button onClick={onAddAccount} className="w-full flex items-center gap-3 px-6 py-3 hover:bg-gray-50 text-gray-800">
          <Plus size={14} /> <span className="text-[0.7em]">添加账号</span>
        </button>
        <button onClick={onSettings} className="w-full flex items-center gap-3 px-6 py-3 hover:bg-gray-50 text-gray-800">
          <Settings size={14} /> <span className="text-[0.7em]">设置</span>
        </button>
      </div>
    </div>
  )
}
