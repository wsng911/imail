import { useState } from 'react'
import { X, Send, ChevronDown } from 'lucide-react'
import type { Account } from '../types'

interface ComposeData {
  to?: string
  subject?: string
  body?: string
}

interface Props {
  accounts: Account[]
  initial?: ComposeData
  onClose: () => void
}

export default function ComposePanel({ accounts, initial = {}, onClose }: Props) {
  const [fromId, setFromId] = useState(accounts[0]?.id ?? '')
  const [to, setTo] = useState(initial.to ?? '')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState(initial.subject ?? '')
  const [body, setBody] = useState(initial.body ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSend() {
    if (!to || !subject) { setError('收件人和主题不能为空'); return }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromAccountId: fromId, to, bcc: bcc || undefined, subject, body }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || '发送失败')
      } else {
        onClose()
      }
    } catch {
      setError('网络错误')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">新邮件</span>
        <button onClick={onClose}><X size={20} className="text-gray-500" /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* From */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
          <span className="text-xs text-gray-400 w-10 flex-shrink-0">发件人</span>
          <div className="relative flex-1">
            <select
              value={fromId}
              onChange={e => setFromId(e.target.value)}
              className="w-full text-sm text-gray-800 bg-transparent appearance-none pr-6 focus:outline-none"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.email}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* To */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
          <span className="text-xs text-gray-400 w-10 flex-shrink-0">收件人</span>
          <input
            type="text" value={to} onChange={e => setTo(e.target.value)}
            placeholder="example@email.com"
            className="flex-1 text-sm text-gray-800 focus:outline-none"
          />
        </div>

        {/* BCC */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
          <span className="text-xs text-gray-400 w-10 flex-shrink-0">密送</span>
          <input
            type="text" value={bcc} onChange={e => setBcc(e.target.value)}
            placeholder="example@email.com"
            className="flex-1 text-sm text-gray-800 focus:outline-none"
          />
        </div>

        {/* Subject */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
          <span className="text-xs text-gray-400 w-10 flex-shrink-0">主题</span>
          <input
            type="text" value={subject} onChange={e => setSubject(e.target.value)}
            placeholder="邮件主题"
            className="flex-1 text-sm text-gray-800 focus:outline-none"
          />
        </div>

        {/* Body */}
        <textarea
          value={body} onChange={e => setBody(e.target.value)}
          placeholder="正文..."
          className="w-full flex-1 px-4 py-3 text-sm text-gray-800 focus:outline-none resize-none"
          style={{ minHeight: 300 }}
        />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        {error ? <span className="text-xs text-red-500">{error}</span> : <span />}
        <button
          onClick={handleSend} disabled={sending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <Send size={15} />
          {sending ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  )
}
