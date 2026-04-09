import { ArrowLeft, Trash2, Star, MailOpen, MailCheck, Reply } from 'lucide-react'
import type { Email, Account } from '../types'
import { getInitials } from '../data'
import Avatar from './Avatar'

interface Props {
  email: Email
  account?: Account
  onBack: () => void
  onDelete: () => void
  onStar: () => void
  onMarkRead: (read: boolean) => void
  onReply: () => void
}

export default function EmailDetail({ email, account, onBack, onDelete, onStar, onMarkRead, onReply }: Props) {
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button onClick={onBack}><ArrowLeft size={22} className="text-gray-600" /></button>
        <div className="flex items-center gap-3">
          <button onClick={onReply} title="回复"><Reply size={20} className="text-gray-500 hover:text-blue-500" /></button>
          <button onClick={() => onMarkRead(!email.read)} title={email.read ? '标为未读' : '标为已读'}>
            {email.read
              ? <MailCheck size={20} className="text-gray-500 hover:text-blue-500" />
              : <MailOpen size={20} className="text-gray-500 hover:text-blue-500" />}
          </button>
          <button onClick={onDelete}><Trash2 size={20} className="text-gray-600 hover:text-red-500" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {account && (
          <div className="inline-block px-3 py-1 rounded-full text-white text-xs mb-3" style={{ background: account.color }}>
            {account.email}
          </div>
        )}

        <div className="flex items-start justify-between gap-2 mb-4">
          <h1 className="text-lg font-semibold text-gray-900 leading-snug">{email.subject}</h1>
          <button onClick={onStar} className="flex-shrink-0 mt-1">
            <Star size={20} className={email.starred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Avatar text={getInitials(email.fromName || email.from)} color={account?.color || '#888'} />
          <div>
            <div className="font-semibold text-sm text-gray-900">{email.fromName}</div>
            <div className="text-xs text-gray-500">到 我</div>
          </div>
          <span className="text-xs text-blue-500 ml-1">{email.date}</span>
        </div>

        {email.body && email.body.trim().startsWith('<') ? (
          <div className="text-sm text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: email.body }} />
        ) : (
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{email.body}</div>
        )}
      </div>
    </div>
  )
}
