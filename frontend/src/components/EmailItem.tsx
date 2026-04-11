import { useRef, useState } from 'react'
import { Star, Trash2, Mail, MailOpen, Paperclip } from 'lucide-react'
import type { Email, Account } from '../types'
import { getInitials } from '../data'
import Avatar from './Avatar'

function formatDate(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const isThisYear = d.getFullYear() === now.getFullYear()
  if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (isThisYear) return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

interface Props {
  email: Email
  account?: Account
  onClick: () => void
  onStar: () => void
  onDelete: () => void
  onToggleRead: () => void
  selectMode: boolean
  selected: boolean
  onLongPress: () => void
  onToggleSelect: () => void
}

export default function EmailItem({
  email, account, onClick, onStar, onDelete, onToggleRead,
  selectMode, selected, onLongPress, onToggleSelect,
}: Props) {
  const [hovered, setHovered] = useState(false)
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const SWIPE_THRESHOLD = 80

  // ── Touch handlers (mobile) ──────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    swipeStartX.current = swipeX
    didLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      onLongPress()
    }, 500)
  }

  const swipeStartX = useRef(0) // touch 开始时的 swipeX 基准

  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current
    if (Math.abs(dy) > Math.abs(dx) && swipeX === 0) { clearTimeout(longPressTimer.current!); return }
    if (dx !== 0) {
      clearTimeout(longPressTimer.current!)
      setSwiping(true)
      setSwipeX(Math.max(Math.min(swipeStartX.current + dx, 0), -SWIPE_THRESHOLD))
    }
  }

  function onTouchEnd() {
    clearTimeout(longPressTimer.current!)
    setSwiping(false)
    setSwipeX(swipeX <= -SWIPE_THRESHOLD / 2 ? -SWIPE_THRESHOLD : 0)
  }

  function handleClick() {
    if (swipeX !== 0) { setSwipeX(0); return }
    if (didLongPress.current) return
    if (selectMode) { onToggleSelect(); return }
    onClick()
  }

  // ── Checkbox (desktop hover or selectMode) ───────────────
  const showCheckbox = selectMode || hovered

  return (
    <div
      className="relative overflow-hidden border-b border-gray-100"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Swipe delete bg (mobile) */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end bg-red-500 px-5">
        <Trash2 size={18} className="text-white" />
      </div>

      {/* Main row */}
      <div
        className={`flex items-center gap-3 px-4 py-3 bg-white cursor-pointer select-none transition-colors
          ${selected ? 'bg-blue-50' : hovered ? 'bg-gray-50' : ''}`}
        style={{ transform: `translateX(${swipeX}px)`, transition: swiping ? 'none' : 'transform 0.2s ease' }}
        onClick={handleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Checkbox (desktop hover / selectMode) or Avatar */}
        <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
          {showCheckbox ? (
            <button
              onClick={e => { e.stopPropagation(); selectMode ? onToggleSelect() : onLongPress() }}
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors
                ${selected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-400'}`}
            >
              {selected && <span className="w-2 h-2 rounded-full bg-white block" />}
            </button>
          ) : (
            <Avatar text={getInitials(email.fromName || email.from)} color={account?.color || '#888'} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              {!email.read && <span className="w-1 h-1 rounded-full bg-blue-500 flex-shrink-0" />}
              {!email.read && (() => { const m = (email.preview || '').match(/\b(\d{4,8})\b/); return m ? <span className="text-[0.8em] font-bold text-gray-900 flex-shrink-0">【{m[1]}】</span> : null })()}
              <span className={`truncate text-[0.8em] ${!email.read ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                {email.subject}
              </span>
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(email.date)}</span>
          </div>
          <div className="text-[11px] text-gray-400 truncate mt-0.5">
            <span className="font-normal text-gray-400">{email.fromName}</span>
            {email.from && email.from !== email.fromName && (
              <span className="text-gray-300 ml-1">{email.from}</span>
            )}
            {' – '}{email.preview}
          </div>
        </div>

        {!selectMode && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {hovered && (
              <button onClick={e => { e.stopPropagation(); onToggleRead() }} className="p-0.5 text-gray-400 hover:text-blue-500 transition-colors">
                {email.read ? <Mail size={15} /> : <MailOpen size={15} />}
              </button>
            )}
          {email.hasAttachment && <Paperclip size={13} className="text-gray-400 flex-shrink-0" />}
            <button onClick={e => { e.stopPropagation(); onStar() }}>
              <Star size={16} className={email.starred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} />
            </button>
          </div>
        )}
      </div>

      {/* Swipe delete button */}
      {swipeX <= -SWIPE_THRESHOLD && (
        <button
          className="absolute inset-y-0 right-0 w-20 bg-red-500 flex items-center justify-center"
          onClick={e => { e.stopPropagation(); setSwipeX(0); onDelete() }}
        >
          <Trash2 size={18} className="text-white" />
        </button>
      )}
    </div>
  )
}
