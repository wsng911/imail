import { ArrowLeft, Trash2, Star, MailOpen, MailCheck, Reply, Pencil } from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { Email, Account } from '../types'
import { getInitials } from '../data'
import Avatar from './Avatar'
import { Paperclip, Download } from 'lucide-react'
import { useSettings } from '../SettingsContext'

interface Attachment { id: string; filename: string; content_type: string; size: number }

interface Props {
  email: Email
  account?: Account
  onBack: () => void
  onDelete: () => void
  onStar: () => void
  onMarkRead: (read: boolean) => void
  onReply: () => void
  onEdit?: () => void
}

export default function EmailDetail({ email, account, onBack, onDelete, onStar, onMarkRead, onReply, onEdit }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { theme } = useSettings()

  const iframeStyle = `
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      html,body{margin:0;padding:0;}
      img{max-width:100%;}
      ${theme === 'dark' ? `
        body{background:#1e1e1e;color:#e0e0e0;}
        a{color:#7ab4f5;}
      ` : ''}
    </style>`

  const [bodyContent, setBodyContent] = useState(email.body || '')
  const [loadingBody, setLoadingBody] = useState(false)

  useEffect(() => {
    setBodyContent(email.body || '')
    // body 为空时自动从服务器拉取
    if (!email.body) {
      setLoadingBody(true)
      fetch(`/api/emails/${email.id}/body`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => { if (d.body) setBodyContent(d.body) })
        .catch(() => {})
        .finally(() => setLoadingBody(false))
    }
  }, [email.id, email.body])

  useEffect(() => {
    // 切换邮件时重置高度
    if (iframeRef.current) iframeRef.current.style.height = '300px'
    const msgId = email.id
    const handler = (e: MessageEvent) => {
      if (e.data?.iframeHeight && e.data?.emailId === msgId && iframeRef.current)
        iframeRef.current.style.height = e.data.iframeHeight + 'px'
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [email.id])

  const loadAttachments = useCallback(() => {
    fetch(`/api/emails/${email.id}/attachments`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setAttachments(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [email.id])

  useEffect(() => { loadAttachments() }, [loadAttachments])
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center border-b border-gray-100">
        {/* 左侧大区域点击返回 */}
        <div className="flex-1 flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={onBack}>
          <ArrowLeft size={22} className="text-gray-600 flex-shrink-0" />
          <span className="text-sm text-gray-500 truncate">{email.subject}</span>
        </div>
        {/* 右侧操作按钮 */}
        <div className="flex items-center gap-1 px-3 py-3">
          <button onClick={onDelete}><Trash2 size={20} className="text-gray-800 hover:text-red-500" /></button>
          {email.folder === 'draft' ? (
            <button onClick={onEdit} title="继续编辑"><Pencil size={20} className="text-gray-700 hover:text-blue-500" /></button>
          ) : (
            <button onClick={onReply} title="回复"><Reply size={20} className="text-gray-700 hover:text-blue-500" /></button>
          )}
          <button onClick={() => onMarkRead(!email.read)} title={email.read ? '标为未读' : '标为已读'}>
            {email.read
              ? <MailCheck size={20} className="text-gray-700 hover:text-blue-500" />
              : <MailOpen size={20} className="text-gray-700 hover:text-blue-500" />}
          </button>
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
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900">{email.fromName || email.from}</div>
            {email.fromName && email.from && (
              <div className="text-xs text-gray-400 truncate">{email.from}</div>
            )}
            <div className="text-xs text-gray-400">到 我</div>
          </div>
          <span className="text-xs text-blue-500 flex-shrink-0">{(() => { const d = new Date(email.date); return isNaN(d.getTime()) ? email.date : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) })()}</span>
        </div>

        {loadingBody ? (
          <div className="flex items-center justify-center py-10 text-gray-400 text-sm">加载中...</div>
        ) : bodyContent && /<[a-z][\s\S]*>/i.test(bodyContent) ? (
          <iframe
            ref={iframeRef}
            srcDoc={`${iframeStyle}${bodyContent}<script>
              var eid=${JSON.stringify(email.id)},last=0,max=20,count=0
              function report(){
                if(count>=max)return
                var h=document.documentElement.scrollHeight
                if(h===last)return
                last=h;count++
                parent.postMessage({iframeHeight:h,emailId:eid},'*')
              }
              report()
              new ResizeObserver(function(){clearTimeout(window._rt);window._rt=setTimeout(report,100)}).observe(document.documentElement)
              window.addEventListener('load',function(){setTimeout(report,300);setTimeout(report,1000)})
            <\/script>`}
            sandbox="allow-popups allow-scripts allow-same-origin"
            className="w-full border-0 overflow-x-auto"
            style={{ minHeight: 300 }}
          />
        ) : (
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{bodyContent}</div>
        )}

        {attachments.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
              <Paperclip size={13} />
              <span>{attachments.length} 个附件</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {attachments.map(att => (
                <a
                  key={att.id}
                  href={`/api/emails/${email.id}/attachments/${att.id}`}
                  download={att.filename}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-100"
                >
                  <Download size={12} className="text-gray-400" />
                  <span className="max-w-[160px] truncate">{att.filename}</span>
                  <span className="text-gray-400">({Math.round(att.size / 1024)}KB)</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
