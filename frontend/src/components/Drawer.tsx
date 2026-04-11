import { useState, useEffect } from 'react'
import { RefreshCw, Plus, Settings, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Inbox, Send, FileText, Trash2, AlertCircle, Mail, Star, AlertTriangle } from 'lucide-react'
import type { Account } from '../types'

export const ALL_INBOXES = '__all__'
export const VIRTUAL_UNREAD = '__unread__'
export const VIRTUAL_STARRED = '__starred__'

export function parseFolderId(id: string | null) {
  if (!id || !id.includes('::')) {
    if (id === VIRTUAL_UNREAD) return { accountId: id, folder: 'unread' }
    if (id === VIRTUAL_STARRED) return { accountId: id, folder: 'starred' }
    return { accountId: id, folder: 'inbox' }
  }
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
  const domain = email?.toLowerCase().split('@')[1] || ''
  const isHotmail = domain.startsWith('hotmail.')
  const isLive = domain.startsWith('live.')

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
  invalidAccounts: { id: string; email: string }[]
  onCheckStatus: () => void
}

export default function Drawer({ accounts, selectedAccountId, onSelectAccount, onAddAccount, onSettings, onSync, onClose, syncing, invalidAccounts, onCheckStatus }: Props) {
  const { accountId: selAccountId } = parseFolderId(selectedAccountId)
  const [stats, setStats] = useState<{total:number,unread:number,starred:number,listOnly:number,withBody:number}|null>(null)
  const fetchStats = () => fetch('/api/emails/stats', { credentials: 'include' }).then(r => r.json()).then(setStats).catch(() => {})
  useEffect(() => {
    fetchStats()
    const t = setInterval(fetchStats, 3000)
    return () => clearInterval(t)
  }, [])

  // 初始化 view：如果当前选中的是某账号的文件夹，直接停在该账号的 folders 视图
  const initView = (): View => {
    if (selAccountId && selAccountId !== ALL_INBOXES && selAccountId !== VIRTUAL_UNREAD && selAccountId !== VIRTUAL_STARRED) {
      const acc = accounts.find(a => a.id === selAccountId)
      if (acc) return { level: 'folders', account: acc }
    }
    return { level: 'root' }
  }
  const [view, setView] = useState<View>(initView)

  // 当 selectedAccountId 变化时同步 view
  useEffect(() => {
    if (!selAccountId || selAccountId === ALL_INBOXES || selAccountId === VIRTUAL_UNREAD || selAccountId === VIRTUAL_STARRED) {
      setView({ level: 'root' })
    } else {
      const acc = accounts.find(a => a.id === selAccountId)
      if (acc) setView({ level: 'folders', account: acc })
    }
  }, [selectedAccountId, accounts.length])

  const isVirtual = selectedAccountId === ALL_INBOXES || selectedAccountId === VIRTUAL_UNREAD || selectedAccountId === VIRTUAL_STARRED
  const [allOpen, setAllOpen] = useState(isVirtual)
  const types = (['gmail', 'outlook', 'qq'] as const).filter(t => accounts.some(a => a.type === t))
  const totalUnread = accounts.reduce((s, a) => s + a.unread, 0)

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
        <span className="font-normal text-gray-600 flex-1">
          {view.level === 'root' ? <span>@iMail <span className="text-gray-400 text-[0.85em]">by mrlees</span></span>
            : view.level === 'accounts' ? TYPE_LABELS[view.type]
            : shortEmail(view.account.email)}
        </span>
        {view.level === 'root' && <span className="text-[0.7em] text-gray-300">v5.1.10</span>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Root: all inboxes + type groups */}
        {view.level === 'root' && (
          <>
            {/* 所有邮件折叠组 */}
            <button
              onClick={() => setAllOpen(o => !o)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isVirtual ? 'bg-blue-500' : 'bg-gray-200'}`}>
                <Inbox size={14} className="text-white" />
              </div>
              <span className={`flex-1 text-left text-[0.9em] font-medium ${isVirtual ? 'text-blue-500' : 'text-gray-800'}`}>所有邮件</span>
              {totalUnread > 0 && !allOpen && <span className="w-2 h-2 rounded-full bg-red-500 mr-1 flex-shrink-0" />}
              {allOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </button>

            {allOpen && (
              <div className="pl-4">
                <button
                  onClick={() => { onSelectAccount(VIRTUAL_UNREAD); onClose() }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${selectedAccountId === VIRTUAL_UNREAD ? 'text-blue-500' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <Mail size={14} className="flex-shrink-0" />
                  <span className="flex-1 text-left text-[0.85em]">未读邮件</span>
                  {totalUnread > 0 && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                </button>
                <button
                  onClick={() => { onSelectAccount(ALL_INBOXES); onClose() }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${selectedAccountId === ALL_INBOXES ? 'text-blue-500' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <Inbox size={14} className="flex-shrink-0" />
                  <span className="flex-1 text-left text-[0.85em]">收件箱</span>
                </button>
                <button
                  onClick={() => { onSelectAccount(VIRTUAL_STARRED); onClose() }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${selectedAccountId === VIRTUAL_STARRED ? 'text-blue-500' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <Star size={14} className="flex-shrink-0" />
                  <span className="flex-1 text-left text-[0.85em]">收藏夹</span>
                </button>
              </div>
            )}
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
        {view.level === 'accounts' && [...accounts].filter(a => a.type === view.type).sort((a, b) => {
          if (view.type === 'outlook') {
            const domainOrder = (e: string) => { const d = e.split('@')[1]?.toLowerCase() || ''; return d.startsWith('outlook.') ? 0 : d.startsWith('hotmail.') ? 1 : d.startsWith('live.') ? 2 : 3 }
            const dd = domainOrder(a.email) - domainOrder(b.email)
            return dd !== 0 ? dd : a.email.localeCompare(b.email)
          }
          return a.email.localeCompare(b.email)
        }).map(acc => {
          const isInvalid = invalidAccounts.some(x => x.id === acc.id)
          return (
          <button key={acc.id} onClick={() => setView({ level: 'folders', account: acc })}
            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${selAccountId === acc.id ? 'bg-blue-50' : ''} ${isInvalid ? 'opacity-40' : ''}`}>
            <ProviderLogo type={acc.type} email={acc.email} />
            <span className={`flex-1 text-left text-[0.9em] truncate ${selAccountId === acc.id ? 'text-blue-500 font-medium' : 'text-gray-700'}`}>
              {shortEmail(acc.email)}
            </span>
            {acc.unread > 0 && !isInvalid && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
            <ChevronRight size={16} className="text-gray-400" />
          </button>
          )
        })}

        {/* Folders under an account */}
        {view.level === 'folders' && (() => {
          const baseColor = { gmail: '234,67,53', outlook: '0,120,212', qq: '18,183,245' }[view.account.type] || '99,102,241'
          return FOLDERS.map((f, i) => {
            const folderId = `${view.account.id}::${f.key}`
            const isSelected = selectedAccountId === folderId
            const Icon = f.icon
            const alpha = (0.12 - i * 0.02).toFixed(2)
            const unread = f.key === 'inbox' ? (view.account.unread || 0) : 0
            return (
              <button key={f.key} onClick={() => { onSelectAccount(folderId); onClose() }}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${isSelected ? 'text-blue-500' : 'text-gray-600 hover:brightness-95'}`}
                style={{ backgroundColor: isSelected ? `rgba(${baseColor},0.18)` : `rgba(${baseColor},${alpha})` }}>
                <Icon size={16} className="flex-shrink-0" />
                <span className="flex-1 text-left text-[0.9em]">{f.label}</span>
                {f.key === 'inbox' && unread > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                )}
              </button>
            )
          })
        })()}
      </div>

      <div className="border-t border-gray-100 pb-4">
        {(() => {
          const total = accounts.length
          // 按 Gmail → Outlook → QQ 顺序排列失效账号
          const typeOrder = ['gmail', 'outlook', 'qq']
          const sortedInvalid = [...invalidAccounts].sort((a, b) => {
            const accA = accounts.find(x => x.id === a.id)
            const accB = accounts.find(x => x.id === b.id)
            return typeOrder.indexOf(accA?.type || '') - typeOrder.indexOf(accB?.type || '')
          })
          return (
            <div className="mx-3 mt-3 mb-1 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-[0.7em]">
              {stats && (
                <div className="mb-2 pb-2 border-b border-gray-100">
                  <div className="text-gray-500 mb-1">本地邮件</div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-gray-500">
                    <span>未读 <span className="text-blue-500 font-medium">{stats.unread}</span></span>
                    <span>星标 <span className="text-yellow-500 font-medium">{stats.starred}</span></span>
                    <span>含正文 <span className="text-green-600 font-medium">{stats.withBody}</span></span>
                    <span>仅列表 <span className="text-gray-400 font-medium">{stats.listOnly}</span></span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-gray-500 mb-1">
                <span>账号</span>
                <span>
                  <span className="text-green-600 font-medium">{total - invalidAccounts.length}</span>
                  <span className="text-gray-400">/{total}</span>
                  {invalidAccounts.length > 0 && <span className="text-red-400 ml-1">({invalidAccounts.length}失效)</span>}
                </span>
              </div>
              {sortedInvalid.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  <div className="flex items-center gap-1 text-gray-400 mb-0.5">
                    <AlertTriangle size={10} /><span>授权失效</span>
                  </div>
                  {sortedInvalid.map(a => {
                    const acc = accounts.find(x => x.id === a.id)
                    return (
                      <div key={a.id} className="flex items-center gap-1.5 text-gray-400 truncate">
                        <ProviderLogo type={acc?.type || ''} email={a.email} size={3} />
                        <span className="truncate">{a.email}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}
        <button onClick={() => { onSync(); setTimeout(onCheckStatus, 3000) }} disabled={syncing} className="w-full flex items-center gap-3 px-6 py-3 hover:bg-gray-50 text-gray-800">
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
