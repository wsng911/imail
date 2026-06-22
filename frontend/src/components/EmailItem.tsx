import { memo, useRef, useState } from 'react'
import { Star, Trash2, Mail, MailOpen, Paperclip } from 'lucide-react'
import type { Email, Account } from '../types'
import { getInitials } from '../data'
import Avatar from './Avatar'

const CTX_KEYWORDS = /验证码|动态码|校验码|确认码|激活码|verification\s*code|security\s*code|login\s*code|access\s*code|one.time|passcode|auth\s*code|sign.in\s*code|your\s*code|\bOTP\b/i
const TRANSACTION_KEYWORDS = /transaction|payment|order|invoice|receipt|转账|账单|订单|付款/i
const YEAR_RE = /^(19|20)\d{2}/
const ALL_SAME_RE = /^(.)\1+$/

function extractCode(text: string): string | null {
  if (!text) return null
  const lines = text.split('\n')

  // 第一层：关键词同行，紧跟 4-8 位字母数字（必须含数字）
  for (const line of lines) {
    if (!CTX_KEYWORDS.test(line)) continue
    const candidates = line.match(/\b([A-Z0-9]{4,8})\b/gi) || []
    for (const c of candidates) {
      if (!/\d/.test(c)) continue
      if (YEAR_RE.test(c) && /^\d+$/.test(c)) continue
      if (ALL_SAME_RE.test(c)) continue
      return c
    }
  }

  // 第二层：关键词后多行扫描（最多5行）
  for (let i = 0; i < lines.length; i++) {
    if (!CTX_KEYWORDS.test(lines[i])) continue
    for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
      const candidates = lines[j].match(/\b([A-Z0-9]{4,8})\b/gi) || []
      for (const c of candidates) {
        if (!/\d/.test(c)) continue
        if (YEAR_RE.test(c) && /^\d+$/.test(c)) continue
        if (ALL_SAME_RE.test(c)) continue
        return c
      }
    }
  }

  // 第三层：XXXX-XXXX 字母数字混合格式（排除纯数字/纯字母）
  const hyphenMatch = text.match(/\b([A-Z0-9]{4,8}-[A-Z0-9]{4,8})\b/i)
  if (hyphenMatch) {
    const v = hyphenMatch[1]
    if (/[A-Z]/i.test(v) && /\d/.test(v)) return v
  }

  // 第四层：纯6位数字降级（需有关键词上下文，排除交易类/年份/全同）
  if (CTX_KEYWORDS.test(text) && !TRANSACTION_KEYWORDS.test(text)) {
    const m6 = text.match(/\b(\d{6})\b/)
    if (m6) {
      const v = m6[1]
      if (!YEAR_RE.test(v) && !ALL_SAME_RE.test(v)) return v
    }
  }

  return null
}

function formatDate(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0')
  return `${y}${m}${day}`
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

export default memo(function EmailItem({
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
              {!email.read && (() => { const code = extractCode(`${email.subject}\n${email.preview || ''}`); return code ? <span className="text-[0.8em] font-bold text-gray-900 flex-shrink-0">【{code}】</span> : null })()}
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
})
