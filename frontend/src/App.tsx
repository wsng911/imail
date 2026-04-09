import { useState, useEffect, useCallback, useRef } from 'react'
import { Menu, Edit, Mail, MoreVertical, MailOpen, Trash2, ListFilter } from 'lucide-react'
import type { Account, Email, AccountType } from './types'
import EmailItem from './components/EmailItem'
import EmailDetail from './components/EmailDetail'
import ComposePanel from './components/ComposePanel'
import Drawer, { ALL_INBOXES, parseFolderId } from './components/Drawer'
import AddAccountModal from './components/AddAccountModal'
import SettingsPage from './components/SettingsPage'

type MobileView = 'list' | 'detail'
type SortKey = 'date' | 'subject' | 'from' | 'read' | 'starred'

const TYPE_ORDER: Record<string, number> = { gmail: 0, outlook: 1, qq: 2 }

function sortAccounts(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9))
}

function mapEmail(r: any): Email {
  return {
    id: r.id, accountId: r.account_id, from: r.from_addr, fromName: r.from_name,
    to: '', subject: r.subject, preview: r.preview, body: r.body ?? '',
    date: r.date, read: r.read === 1, starred: r.starred === 1, folder: r.folder,
  }
}

function getAccountById(accounts: Account[], id: string) {
  return accounts.find(a => a.id === id)
}

function applySortKey(emails: Email[], key: SortKey): Email[] {
  return [...emails].sort((a, b) => {
    switch (key) {
      case 'subject':  return a.subject.localeCompare(b.subject)
      case 'from':     return (a.fromName || a.from).localeCompare(b.fromName || b.from)
      case 'read':     return Number(a.read) - Number(b.read)
      case 'starred':  return Number(b.starred) - Number(a.starred)
      default:         return new Date(b.date).getTime() - new Date(a.date).getTime()
    }
  })
}

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [emails, setEmails] = useState<Email[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(ALL_INBOXES)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [mobileView, setMobileView] = useState<MobileView>('list')
  const [showSettings, setShowSettings] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [compose, setCompose] = useState<{ to?: string; subject?: string; body?: string } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  const fetchAccounts = useCallback(async () => {
    const res = await fetch('/api/accounts', { credentials: 'include' })
    setAccounts(await res.json())
  }, [])

  const fetchEmails = useCallback(async (accountId: string | null, p = 1, append = false) => {
    // ALL_INBOXES and null both fetch all
    const { accountId: accId, folder } = parseFolderId(accountId)
    const id = accId === ALL_INBOXES || accId === null ? null : accId
    const params = new URLSearchParams({ page: String(p), folder })
    if (id) params.set('accountId', id)
    const res = await fetch(`/api/emails?${params}`, { credentials: 'include' })
    const data = await res.json()
    const mapped = data.map(mapEmail)
    if (append) { setEmails(prev => [...prev, ...mapped]) } else { setEmails(mapped) }
    setHasMore(mapped.length >= 50)
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchAccounts(), fetchEmails(ALL_INBOXES)]).finally(() => setLoading(false))
  }, [])

  useEffect(() => { setPage(1); fetchEmails(selectedAccountId, 1) }, [selectedAccountId])

  const baseEmails = emails  // folder filtering done by backend
  const visibleEmails = applySortKey(baseEmails, sortKey)
  const sortedAccounts = sortAccounts(accounts)

  const FOLDER_LABELS: Record<string, string> = { inbox: '收件箱', sent: '已发送', draft: '草稿箱', spam: '垃圾邮件', trash: '已删除' }
  const { accountId: selAccId, folder: selFolder } = parseFolderId(selectedAccountId)
  const selectedAccount = selAccId && selAccId !== ALL_INBOXES ? accounts.find(a => a.id === selAccId) : null
  const listTitle = selectedAccountId === ALL_INBOXES ? '所有收件箱' : FOLDER_LABELS[selFolder] || '收件箱'
  const listSubtitle = selectedAccount?.email ?? null

  async function handleOpenEmail(email: Email) {
    setSelectedEmail(email)
    setMobileView('detail')
    // fetch full content (body not included in list)
    const res = await fetch(`/api/emails/${email.id}`, { credentials: 'include' })
    const full = await res.json()
    const mapped = mapEmail(full)
    setSelectedEmail(mapped)
    if (!email.read) {
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, read: true } : e))
    }
  }

  async function handleStar(emailId: string) {
    const email = emails.find(e => e.id === emailId)
    if (!email) return
    const starred = !email.starred
    await fetch(`/api/emails/${emailId}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ starred }) })
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, starred } : e))
    if (selectedEmail?.id === emailId) setSelectedEmail(e => e ? { ...e, starred } : e)
  }

  async function handleToggleRead(emailId: string) {
    const email = emails.find(e => e.id === emailId)
    if (!email) return
    const read = !email.read
    await fetch(`/api/emails/${emailId}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ read }) })
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, read } : e))
    if (selectedEmail?.id === emailId) setSelectedEmail(e => e ? { ...e, read } : e)
  }

  async function handleDelete(emailId: string) {
    await fetch(`/api/emails/${emailId}`, { method: 'DELETE', credentials: 'include' })
    setEmails(prev => prev.filter(e => e.id !== emailId))
    setSelectedEmail(null)
    setMobileView('list')
  }

  async function handleMarkRead(emailId: string, read: boolean) {
    await fetch(`/api/emails/${emailId}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ read }) })
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, read } : e))
    if (selectedEmail?.id === emailId) setSelectedEmail(e => e ? { ...e, read } : e)
  }

  async function handleAddAccount(email: string, type: AccountType, credential: string) {
    const res = await fetch('/api/accounts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, type, credential }) })
    if (res.ok) await fetchAccounts()
  }

  async function handleDeleteAccount(id: string) {
    await fetch(`/api/accounts/${id}`, { method: 'DELETE', credentials: 'include' })
    await fetchAccounts()
    if (selectedAccountId === id) setSelectedAccountId(ALL_INBOXES)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await Promise.all(accounts.map(a => fetch(`/api/emails/sync/${a.id}`, { method: 'POST', credentials: 'include' })))
      await fetchEmails(selectedAccountId)
    } finally {
      setSyncing(false)
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function selectAll() {
    setSelectedIds(new Set(visibleEmails.map(e => e.id)))
    setSelectMode(true)
    setMenuOpen(false)
  }

  async function deleteSelected() {
    await Promise.all([...selectedIds].map(id => fetch(`/api/emails/${id}`, { method: 'DELETE', credentials: 'include' })))
    setEmails(prev => prev.filter(e => !selectedIds.has(e.id)))
    setSelectedIds(new Set()); setSelectMode(false); setMenuOpen(false)
  }

  async function markSelected(read: boolean) {
    await Promise.all([...selectedIds].map(id =>
      fetch(`/api/emails/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ read }) })
    ))
    setEmails(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, read } : e))
    setSelectedIds(new Set()); setSelectMode(false)
  }

  if (loading) return (
    <div className="h-screen flex items-center justify-center text-gray-400">
      <div className="text-center"><div className="text-3xl mb-2">📬</div><div>加载中...</div></div>
    </div>
  )

  if (showSettings) return (
    <div className="h-screen bg-gray-100 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <SettingsPage accounts={accounts} onBack={() => setShowSettings(false)}
          onAddAccount={() => { setShowSettings(false); setShowAddAccount(true) }}
          onDeleteAccount={handleDeleteAccount} />
      </div>
    </div>
  )

  // ── Panels ────────────────────────────────────────────────

  const accountPanel = (
    <Drawer
      accounts={sortedAccounts}
      selectedAccountId={selectedAccountId}
      onSelectAccount={id => { setSelectedAccountId(id); setDrawerOpen(false) }}
      onAddAccount={() => { setDrawerOpen(false); setShowAddAccount(true) }}
      onSettings={() => { setDrawerOpen(false); setShowSettings(true) }}
      onSync={() => { handleSync(); setDrawerOpen(false) }}
      onClose={() => setDrawerOpen(false)}
      syncing={syncing}
    />
  )

  const SORT_LABELS: Record<SortKey, string> = { date: '日期', subject: '主题', from: '发件人', read: '已读/未读', starred: '星标' }

  const emailListPanel = (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <button className="md:hidden" onClick={() => setDrawerOpen(true)}>
          <Menu size={22} className="text-gray-700" />
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={handleSync}>
          <div className="text-sm font-semibold text-gray-900 truncate">
            {selectMode ? `已选 ${selectedIds.size} 封` : listTitle}
          </div>
          {!selectMode && listSubtitle && (
            <div className="text-xs text-gray-400 truncate">{listSubtitle}</div>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          {!selectMode ? (
            <>
              {/* Sort + sync on left area click */}
              <div className="relative flex items-center">
                {syncing && (
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-transparent animate-spin mr-1" />
                )}
                <button onClick={() => { setSortOpen(o => !o); setMenuOpen(false) }} className="p-1.5 text-gray-500 hover:text-blue-500">
                  <ListFilter size={17} />
                </button>
                {sortOpen && (
                  <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[120px]">
                    {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                      <button key={k} onClick={() => { setSortKey(k); setSortOpen(false) }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 ${sortKey === k ? 'text-blue-500 font-medium' : 'text-gray-700'}`}>
                        {SORT_LABELS[k]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Three-dot */}
              <div className="relative">
                <button onClick={() => { setMenuOpen(o => !o); setSortOpen(false) }} className="p-1.5 text-gray-500 hover:text-blue-500">
                  <MoreVertical size={17} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[120px]">
                    <button onClick={selectAll} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">全选</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Toggle read/unread: if any selected is unread → mark all read, else mark all unread */}
              <button
                onClick={() => {
                  const anyUnread = [...selectedIds].some(id => !emails.find(e => e.id === id)?.read)
                  markSelected(anyUnread)
                }}
                className="p-1.5 text-gray-500 hover:text-blue-500" title="切换已读/未读"
              >
                {[...selectedIds].some(id => emails.find(e => e.id === id)?.read)
                  ? <Mail size={17} />
                  : <MailOpen size={17} />}
              </button>
              <button onClick={deleteSelected} className="p-1.5 text-red-400 hover:text-red-600" title="删除">
                <Trash2 size={17} />
              </button>
              <button onClick={selectAll} className="p-1.5 text-gray-500 hover:text-blue-500" title="全选">
                <span className="text-sm font-medium">全选</span>
              </button>
              <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}
                className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700">取消</button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" ref={listRef} onScroll={e => {
        const el = e.currentTarget
        if (hasMore && !syncing && el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
          const next = page + 1
          setPage(next)
          fetchEmails(selectedAccountId, next, true)
        }
      }}>
        {visibleEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <div className="text-4xl mb-3">📭</div><div>暂无邮件</div>
          </div>
        ) : visibleEmails.map(email => (
          <EmailItem
            key={email.id} email={email}
            account={getAccountById(accounts, email.accountId)}
            onClick={() => handleOpenEmail(email)}
            onStar={() => handleStar(email.id)}
            onDelete={() => handleDelete(email.id)}
            onToggleRead={() => handleToggleRead(email.id)}
            selectMode={selectMode} selected={selectedIds.has(email.id)}
            onLongPress={() => { setSelectMode(true); setSelectedIds(new Set([email.id])) }}
            onToggleSelect={() => toggleSelect(email.id)}
          />
        ))}
        {hasMore && <div className="text-center py-3 text-xs text-gray-400">下滑加载更多...</div>}
        {!hasMore && visibleEmails.length > 0 && <div className="text-center py-3 text-xs text-gray-300">已加载全部</div>}
      </div>
    </div>
  )

  const detailPanel = compose ? (
    <ComposePanel
      accounts={accounts}
      initial={compose}
      onClose={() => setCompose(null)}
    />
  ) : selectedEmail ? (
    <EmailDetail
      email={selectedEmail}
      account={getAccountById(accounts, selectedEmail.accountId)}
      onBack={() => { setSelectedEmail(null); setMobileView('list') }}
      onDelete={() => handleDelete(selectedEmail.id)}
      onStar={() => handleStar(selectedEmail.id)}
      onMarkRead={read => handleMarkRead(selectedEmail.id, read)}
      onReply={() => setCompose({
        to: selectedEmail.from,
        subject: selectedEmail.subject.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`,
        body: `\n\n--- 原邮件 ---\n发件人：${selectedEmail.fromName} <${selectedEmail.from}>\n${selectedEmail.body?.replace(/<[^>]+>/g, '') ?? ''}`,
      })}
    />
  ) : (
    <div className="hidden md:flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50">
      <Mail size={48} className="mb-4 text-gray-300" />
      <div className="text-base">选择一封邮件查看详情</div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex h-screen overflow-hidden">
        <div className="w-64 flex-shrink-0 border-r border-gray-200 overflow-y-auto">{accountPanel}</div>
        <div className="flex-shrink-0 border-r border-gray-200 relative overflow-hidden" style={{ width: 400 }}>
          {emailListPanel}
          <button onClick={() => setCompose({})} className="absolute bottom-6 right-4 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
            <Edit size={20} className="text-white" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">{detailPanel}</div>
      </div>

      {/* Mobile */}
      <div className="md:hidden h-screen relative overflow-hidden">
        {drawerOpen && (
          <div className="fixed inset-0 z-40 flex">
            <div className="w-4/5 max-w-xs h-full shadow-xl">{accountPanel}</div>
            <div className="flex-1 bg-black/30" onClick={() => setDrawerOpen(false)} />
          </div>
        )}
        {mobileView === 'list' ? (
          <div className="h-full relative">
            {emailListPanel}
            <button onClick={() => setCompose({})} className="absolute bottom-6 right-4 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
              <Edit size={20} className="text-white" />
            </button>
          </div>
        ) : (
          <div className="h-full">{detailPanel}</div>
        )}
      </div>

      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} onAdd={handleAddAccount} />}
    </>
  )
}
