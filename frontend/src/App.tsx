import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Menu, Edit, Mail, MailOpen, Trash2, ListFilter, Search, CheckSquare, Square, SquareMinus } from 'lucide-react'
import type { Account, Email, AccountType } from './types'
import EmailItem from './components/EmailItem'
import EmailDetail from './components/EmailDetail'
import ComposePanel, { type ComposeData } from './components/ComposePanel'
import Drawer, { ALL_INBOXES, VIRTUAL_UNREAD, VIRTUAL_STARRED, parseFolderId } from './components/Drawer'
import AddAccountModal from './components/AddAccountModal'
import SettingsPage from './components/SettingsPage'
import Toast from './components/Toast'
import { LS } from './constants'

type MobileView = 'list' | 'detail'
type SortKey = 'date' | 'subject' | 'from' | 'read' | 'starred'

const TYPE_ORDER: Record<string, number> = { gmail: 0, outlook: 1, qq: 2 }

function sortAccounts(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9))
}

function mapEmail(r: any): Email {
  return {
    id: r.id || r.uid, accountId: r.account_id, from: r.from_addr, fromName: r.from_name,
    to: '', subject: r.subject, preview: r.preview, body: r.body ?? '',
    date: r.date, rawDate: r.raw_date ?? 0, read: r.read === 1, starred: r.starred === 1, folder: r.folder,
    hasAttachment: r.has_attachment === 1,
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
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    () => localStorage.getItem(LS.SELECTED_ACCOUNT) ?? VIRTUAL_UNREAD
  )
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [mobileView, setMobileView] = useState<MobileView>(
    () => (localStorage.getItem(LS.MOBILE_VIEW) as MobileView) || 'list'
  )
  const [showSettings, setShowSettings] = useState(
    () => localStorage.getItem(LS.APP_VIEW) === 'settings'
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(
    () => localStorage.getItem(LS.APP_VIEW) === 'addAccount'
  )
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortOpen, setSortOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [compose, setCompose] = useState<ComposeData | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [invalidAccounts, setInvalidAccounts] = useState<{ id: string; email: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('imail_invalid_accounts') || '[]') } catch { return [] }
  })
  const [noMoreOlder, setNoMoreOlder] = useState(false)
  const [page, setPage] = useState(() => parseInt(localStorage.getItem(LS.LIST_PAGE) || '1'))
  const [hasMore, setHasMore] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const scrollPos = useRef(parseInt(localStorage.getItem(LS.LIST_SCROLL) || '0'))

  // 手机返回键多级返回
  // 用 ref 保存最新状态，避免 popstate 闭包过期
  const mobileViewRef = useRef(mobileView)
  const drawerOpenRef = useRef(drawerOpen)
  const showSettingsRef = useRef(showSettings)
  const showAddAccountRef = useRef(showAddAccount)
  useEffect(() => { mobileViewRef.current = mobileView }, [mobileView])
  useEffect(() => { drawerOpenRef.current = drawerOpen }, [drawerOpen])
  useEffect(() => { showSettingsRef.current = showSettings }, [showSettings])
  useEffect(() => { showAddAccountRef.current = showAddAccount }, [showAddAccount])

  useEffect(() => {
    history.pushState({ page: 'app' }, '')
    const onPopState = () => {
      if (mobileViewRef.current === 'detail') {
        setSelectedEmail(null)
        setMobileView('list')
        localStorage.removeItem(LS.MOBILE_VIEW)
        localStorage.removeItem(LS.SELECTED_EMAIL_ID)
        requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = scrollPos.current })
      } else if (drawerOpenRef.current) {
        setDrawerOpen(false)
      } else if (showSettingsRef.current) {
        setShowSettings(false)
      } else if (showAddAccountRef.current) {
        setShowAddAccount(false)
      } else {
        // 没有可关闭的层，补回一个状态防止退出
        history.pushState({ page: 'app' }, '')
        return
      }
      history.pushState({ page: 'app' }, '')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, []) // 只注册一次

  const fetchAccounts = useCallback(async () => {
    const res = await fetch('/api/accounts', { credentials: 'include' })
    setAccounts(await res.json())
  }, [])

  const checkStatus = useCallback(() => {
    fetch('/api/accounts/status', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const invalid = Array.isArray(data) ? data.filter((a: { valid: boolean }) => !a.valid) : []
        setInvalidAccounts(invalid)
        localStorage.setItem('imail_last_status_check', String(Date.now()))
        localStorage.setItem('imail_invalid_accounts', JSON.stringify(invalid))
      })
      .catch(() => {})
  }, [])

  const handleOpenEmail = useCallback(async (email: Email) => {
    scrollPos.current = listRef.current?.scrollTop ?? 0
    setSelectedEmail(email)
    setMobileView('detail')
    localStorage.setItem(LS.MOBILE_VIEW, 'detail')
    localStorage.setItem(LS.SELECTED_EMAIL_ID, email.id)
    const res = await fetch(`/api/emails/${email.id}`, { credentials: 'include' })
    const full = await res.json()
    const mapped = mapEmail(full)
    setSelectedEmail(mapped)
    if (!email.read) {
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, read: true } : e))
      fetchAccounts()
    }
  }, [fetchAccounts])

  const fetchEmails = useCallback(async (accountId: string | null, p = 1, append = false) => {
    const { accountId: accId, folder } = parseFolderId(accountId)
    const isVirtual = accId === VIRTUAL_UNREAD || accId === VIRTUAL_STARRED
    const id = (accId === ALL_INBOXES || accId === null || isVirtual) ? null : accId
    const params = new URLSearchParams({ page: String(p), folder })
    if (id) params.set('accountId', id)
    const res = await fetch(`/api/emails?${params}`, { credentials: 'include' })
    const data = await res.json()
    const mapped = data.map(mapEmail)
    if (append) { setEmails(prev => [...prev, ...mapped]) } else {
      setEmails(mapped)
      // 刷新后恢复 selectedEmail
      const savedId = localStorage.getItem(LS.SELECTED_EMAIL_ID)
      if (savedId && localStorage.getItem(LS.MOBILE_VIEW) === 'detail') {
        const found = mapped.find((e: Email) => e.id === savedId)
        if (found) {
          handleOpenEmail(found)
        } else {
          // 不在当前列表，直接从后端拉取
          fetch(`/api/emails/${savedId}`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(full => {
              if (full) { setSelectedEmail(mapEmail(full)); setMobileView('detail') }
              else { localStorage.removeItem(LS.MOBILE_VIEW); localStorage.removeItem(LS.SELECTED_EMAIL_ID) }
            })
            .catch(() => { localStorage.removeItem(LS.MOBILE_VIEW); localStorage.removeItem(LS.SELECTED_EMAIL_ID) })
        }
      }
    }
    setHasMore(mapped.length >= 50)
  }, [handleOpenEmail])

  useEffect(() => {
    setLoading(true)
    const savedPage = parseInt(localStorage.getItem(LS.LIST_PAGE) || '1')
    const savedScroll = parseInt(localStorage.getItem(LS.LIST_SCROLL) || '0')
    // 加载所有已翻页的数据
    const loadAll = async () => {
      await fetchAccounts()
      // 先读 db 显示，同步在后台进行不阻塞
      if (savedPage > 1) {
        const { accountId: accId, folder } = parseFolderId(selectedAccountId)
        const id = (accId === ALL_INBOXES || accId === null || accId === VIRTUAL_UNREAD || accId === VIRTUAL_STARRED) ? null : accId
        const pages = Array.from({ length: savedPage }, (_, i) => i + 1)
        const results = await Promise.all(pages.map(p => {
          const params = new URLSearchParams({ page: String(p), folder })
          if (id) params.set('accountId', id)
          return fetch(`/api/emails?${params}`, { credentials: 'include' }).then(r => r.json())
        }))
        const merged = Array.from(new Map(results.flat().map(e => [e.id, e])).values())
        setEmails(merged.map(mapEmail))
        setHasMore(results[results.length - 1]?.length >= 50)
        setPage(savedPage)
      } else {
        await fetchEmails(selectedAccountId, 1)
      }
      // 恢复滚动位置
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = savedScroll
      })
    }
    loadAll().finally(() => {
      setLoading(false)
    })
    // 初次或每天自动检测账号有效性
    const last = parseInt(localStorage.getItem('imail_last_status_check') || '0')
    if (Date.now() - last > 24 * 60 * 60 * 1000) checkStatus()
    // 每90秒自动刷新第1页新邮件
    const autoRefresh = setInterval(async () => {
      const { accountId: accId, folder } = parseFolderId(selectedAccountId)
      const p = new URLSearchParams({ page: '1', folder })
      if (accId && accId !== ALL_INBOXES && accId !== VIRTUAL_UNREAD && accId !== VIRTUAL_STARRED) p.set('accountId', accId)
      const res = await fetch(`/api/emails?${p}`, { credentials: 'include' })
      const newData = await res.json()
      if (Array.isArray(newData) && newData.length > 0) {
        setEmails(prev => {
          const existingIds = new Set(prev.map(e => e.id))
          const fresh = newData.map(mapEmail).filter(e => !existingIds.has(e.id))
          return fresh.length > 0 ? [...fresh, ...prev] : prev
        })
        fetchAccounts()
      }
    }, 90000)
    return () => clearInterval(autoRefresh)
  }, [])

  useEffect(() => {
    setPage(1)
    localStorage.setItem(LS.LIST_PAGE, '1')
    localStorage.setItem(LS.LIST_SCROLL, '0')
    localStorage.removeItem(LS.MOBILE_VIEW)
    localStorage.removeItem(LS.SELECTED_EMAIL_ID)
    setSelectedEmail(null)
    setMobileView('list')
    setNoMoreOlder(false)
    fetchEmails(selectedAccountId, 1)
  }, [selectedAccountId])
  useEffect(() => { localStorage.setItem(LS.SELECTED_ACCOUNT, selectedAccountId ?? ALL_INBOXES) }, [selectedAccountId])
  useEffect(() => {
    const view = showSettings ? 'settings' : showAddAccount ? 'addAccount' : 'inbox'
    localStorage.setItem(LS.APP_VIEW, view)
  }, [showSettings, showAddAccount])

  const q = searchQuery.trim().toLowerCase()
  const filteredEmails = useMemo(() => q ? emails.filter(e =>
    e.subject.toLowerCase().includes(q) ||
    e.fromName.toLowerCase().includes(q) ||
    e.from.toLowerCase().includes(q)
  ) : emails, [emails, q])
  const visibleEmails = useMemo(() => applySortKey(filteredEmails, sortKey), [filteredEmails, sortKey])
  const sortedAccounts = sortAccounts(accounts)

  const FOLDER_LABELS: Record<string, string> = { inbox: '收件箱', sent: '已发送', draft: '草稿箱', spam: '垃圾邮件', trash: '已删除', unread: '未读邮件', starred: '收藏夹' }
  const { accountId: selAccId, folder: selFolder } = parseFolderId(selectedAccountId)
  const selectedAccount = selAccId && selAccId !== ALL_INBOXES && selAccId !== VIRTUAL_UNREAD && selAccId !== VIRTUAL_STARRED ? accounts.find(a => a.id === selAccId) : null
  const listTitle = selectedAccountId === ALL_INBOXES ? '所有收件箱' : FOLDER_LABELS[selFolder] || '收件箱'
  const listSubtitle = selectedAccount?.email ?? null

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
    if (res.ok) {
      const account = await res.json()
      await fetchAccounts()
      checkStatus()
      // 自动同步新账号
      fetch(`/api/emails/sync/${account.id}`, { method: 'POST', credentials: 'include' })
        .then(() => fetchEmails(selectedAccountId, 1))
        .catch(() => {})
    }
  }

  async function handleDeleteAccount(id: string) {
    await fetch(`/api/accounts/${id}`, { method: 'DELETE', credentials: 'include' })
    await fetchAccounts()
    checkStatus()
    if (selectedAccountId === id) setSelectedAccountId(ALL_INBOXES)
  }

  async function handleSyncCurrent() {
    const { accountId: accId } = parseFolderId(selectedAccountId)
    const targets = (accId && accId !== ALL_INBOXES && accId !== VIRTUAL_UNREAD && accId !== VIRTUAL_STARRED)
      ? accounts.filter(a => a.id === accId)
      : accounts
    if (!targets.length) return
    setSyncing(true)
    try {
      await Promise.all(targets.map(a => fetch(`/api/emails/sync/${a.id}`, { method: 'POST', credentials: 'include' })))
      const res = await fetch(`/api/emails?${(() => { const { accountId: ai, folder } = parseFolderId(selectedAccountId); const p = new URLSearchParams({ page: '1', folder }); if (ai && ai !== ALL_INBOXES && ai !== VIRTUAL_UNREAD && ai !== VIRTUAL_STARRED) p.set('accountId', ai); return p })()}`, { credentials: 'include' })
      const newData = await res.json()
      if (Array.isArray(newData) && newData.length > 0) {
        setEmails(prev => {
          const existingIds = new Set(prev.map(e => e.id))
          const fresh = newData.map(mapEmail).filter(e => !existingIds.has(e.id))
          return fresh.length > 0 ? [...fresh, ...prev] : prev
        })
      }
    } finally { setSyncing(false) }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const results = await Promise.all(accounts.map(a =>
        fetch(`/api/emails/sync/${a.id}`, { method: 'POST', credentials: 'include' })
          .then(r => r.json().then(d => ({ ...d, email: a.email })))
      ))
      const expired = results.filter(r => r.error === 'token_expired')
      const failed = results.filter(r => r.error === 'sync_failed')
      const msgs = [
        expired.length ? `授权已过期：${expired.map(r => r.email).join('、')}` : '',
        failed.length ? `同步失败：${failed.map(r => r.email).join('、')}` : '',
      ].filter(Boolean)
      if (msgs.length) setToast(msgs.join(' | '))
      // 只拉第1页新邮件，插入到列表顶部，不重置整个列表
      const res = await fetch(`/api/emails?${(() => { const { accountId: accId, folder } = parseFolderId(selectedAccountId); const p = new URLSearchParams({ page: '1', folder }); if (accId && accId !== ALL_INBOXES && accId !== VIRTUAL_UNREAD && accId !== VIRTUAL_STARRED) p.set('accountId', accId); return p })()}`, { credentials: 'include' })
      const newData = await res.json()
      if (Array.isArray(newData) && newData.length > 0) {
        setEmails(prev => {
          const existingIds = new Set(prev.map(e => e.id))
          const fresh = newData.map(mapEmail).filter(e => !existingIds.has(e.id))
          return fresh.length > 0 ? [...fresh, ...prev] : prev
        })
      }
    } finally {
      setSyncing(false)
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      if (n.size === 0) setSelectMode(false)
      return n
    })
  }

  function selectAll() {
    const allSelected = visibleEmails.every(e => selectedIds.has(e.id))
    if (allSelected) {
      setSelectedIds(new Set())
      setSelectMode(false)
    } else {
      setSelectedIds(new Set(visibleEmails.map(e => e.id)))
      setSelectMode(true)
    }
  }

  async function deleteSelected() {
    const ids = [...selectedIds]
    for (let i = 0; i < ids.length; i += 10)
      await Promise.all(ids.slice(i, i + 10).map(id => fetch(`/api/emails/${id}`, { method: 'DELETE', credentials: 'include' })))
    setEmails(prev => prev.filter(e => !selectedIds.has(e.id)))
    setSelectedIds(new Set()); setSelectMode(false)
  }

  async function markSelected(read: boolean) {
    const ids = [...selectedIds]
    await fetch('/api/emails/batch', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, read }) })
    setEmails(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, read } : e))
    setSelectedIds(new Set()); setSelectMode(false)
    fetchAccounts()
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
      invalidAccounts={invalidAccounts}
      onCheckStatus={checkStatus}
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
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleSyncCurrent()}>
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
              {selectedAccountId === VIRTUAL_UNREAD && visibleEmails.length > 0 && (
                <button
                  disabled={markingAll}
                  onClick={async () => {
                    const ids = visibleEmails.filter(e => !e.read).map(e => e.id)
                    if (!ids.length) return
                    setMarkingAll(true)
                    await fetch('/api/emails/batch', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, read: true }) })
                    setEmails(prev => prev.map(e => ids.includes(e.id) ? { ...e, read: true } : e))
                    setMarkingAll(false)
                  }}
                  className="p-1.5 text-gray-700 hover:text-blue-500 disabled:opacity-40" title="全部标已读"
                >
                  <MailOpen size={17} className={markingAll ? 'animate-pulse text-blue-400' : ''} />
                </button>
              )}
              <div className="relative flex items-center">
                <button onClick={() => { setSearchOpen(o => !o); setSortOpen(false) }} className="p-1.5 text-gray-700 hover:text-blue-500">
                  <Search size={17} />
                </button>
                {searchOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSearchOpen(false)} />
                    <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-56 px-3 py-2">
                      <input
                        autoFocus
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Escape' && setSearchOpen(false)}
                        placeholder="搜索主题、发件人..."
                        className="w-full text-sm px-2 py-1.5 rounded border border-gray-200 focus:outline-none focus:border-blue-400 bg-gray-50"
                      />
                    </div>
                  </>
                )}
              </div>
              {/* Sort */}
              <div className="relative flex items-center">
                {syncing && (
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-transparent animate-spin mr-1" />
                )}
                <button onClick={() => { setSortOpen(o => !o); setSearchOpen(false) }} className="p-1.5 text-gray-700 hover:text-blue-500">
                  <ListFilter size={17} />
                </button>
                {sortOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                    <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[120px]">
                      {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                        <button key={k} onClick={() => { setSortKey(k); setSortOpen(false) }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 ${sortKey === k ? 'text-blue-500 font-medium' : 'text-gray-700'}`}>
                          {SORT_LABELS[k]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {/* 全选 */}
              <button onClick={selectAll} className="p-1.5 text-gray-700 hover:text-blue-500" title="全选">
                <Square size={17} />
              </button>
            </>
          ) : (
            <>
              <button onClick={deleteSelected} className="p-1.5 text-gray-800 hover:text-red-500" title="删除">
                <Trash2 size={17} />
              </button>
              <button
                onClick={() => {
                  const anyUnread = [...selectedIds].some(id => !emails.find(e => e.id === id)?.read)
                  markSelected(anyUnread)
                }}
                className="p-1.5 text-gray-700 hover:text-blue-500" title="切换已读/未读"
              >
                {[...selectedIds].some(id => emails.find(e => e.id === id)?.read)
                  ? <Mail size={17} />
                  : <MailOpen size={17} />}
              </button>
              <button onClick={selectAll} className="p-1.5 text-gray-700 hover:text-blue-500" title="全选">
                {visibleEmails.every(e => selectedIds.has(e.id))
                  ? <CheckSquare size={17} className="text-blue-500" />
                  : <SquareMinus size={17} className="text-gray-400" />}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" ref={listRef} onScroll={e => {
        const el = e.currentTarget
        localStorage.setItem(LS.LIST_SCROLL, String(Math.round(el.scrollTop)))
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
          if (hasMore && !syncing) {
            const next = page + 1
            setPage(next)
            localStorage.setItem(LS.LIST_PAGE, String(next))
            fetchEmails(selectedAccountId, next, true)
          } else if (!hasMore && !noMoreOlder) {
            setNoMoreOlder(true)
          }
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
        {noMoreOlder && <div className="text-center py-3 text-xs text-gray-300">已加载全部</div>}
        {!hasMore && !noMoreOlder && visibleEmails.length > 0 && <div className="text-center py-3 text-xs text-gray-300">已加载全部</div>}
        {hasMore && <div className="text-center py-3 text-xs text-gray-400">下滑加载更多...</div>}
      </div>
    </div>
  )

  const detailPanel = compose ? (
    <ComposePanel
      accounts={accounts}
      initial={compose}
      onClose={() => { setCompose(null); if (!selectedEmail) setMobileView('list') }}
    />
  ) : selectedEmail ? (
    <EmailDetail
      email={selectedEmail}
      account={getAccountById(accounts, selectedEmail.accountId)}
      onBack={() => { setSelectedEmail(null); setMobileView('list'); localStorage.removeItem(LS.MOBILE_VIEW); localStorage.removeItem(LS.SELECTED_EMAIL_ID); requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = scrollPos.current }) }}
      onDelete={() => handleDelete(selectedEmail.id)}
      onStar={() => handleStar(selectedEmail.id)}
      onMarkRead={read => handleMarkRead(selectedEmail.id, read)}
      onReply={() => setCompose({
        to: selectedEmail.from,
        subject: selectedEmail.subject.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`,
        body: `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;color:#666;margin-top:8px"><p style="margin:0 0 4px"><b>发件人：</b>${selectedEmail.fromName} &lt;${selectedEmail.from}&gt;<br><b>时间：</b>${selectedEmail.date}<br><b>主题：</b>${selectedEmail.subject}</p>${selectedEmail.body ?? ''}</div>`,
        isReply: true,
      })}
      onEdit={() => setCompose({ to: selectedEmail.from, subject: selectedEmail.subject, body: selectedEmail.body, draftId: selectedEmail.id })}
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
          <button onClick={() => { setCompose({}); setMobileView('detail') }} className="absolute bottom-6 right-4 z-10 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">            <Edit size={20} className="text-white" />
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
            <button onClick={() => { setCompose({}); setMobileView('detail') }} className="absolute bottom-6 right-4 z-10 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">              <Edit size={20} className="text-white" />
            </button>
          </div>
        ) : (
          <div className="h-full">{detailPanel}</div>
        )}
      </div>

      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} onAdd={handleAddAccount} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  )
}
