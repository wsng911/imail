import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { AccountType } from '../types'

interface Props {
  onClose: () => void
  onAdd: (email: string, type: AccountType, credential: string) => void
}

const INTL_PROVIDERS = [
  { type: 'gmail' as AccountType, label: 'Gmail', hint: '16位应用专用密码', placeholder: 'xxxx xxxx xxxx xxxx', logo: '/gmail.png' },
  { type: 'outlook' as AccountType, label: 'Outlook / Hotmail / Live', hint: 'OAuth2 授权登录', placeholder: '', logo: '/outlook.png' },
  { type: 'qq' as AccountType, label: 'QQ 邮箱 / Foxmail', hint: 'QQ 邮箱授权码（@qq.com / @foxmail.com）', placeholder: '16位授权码', logo: '/qq.png' },
]

const CN_PROVIDERS = [
  { type: '163' as AccountType, label: '163 邮箱', hint: '163邮箱授权码', placeholder: '授权码', logo: '/163.png', domain: '163.com' },
  { type: '126' as AccountType, label: '126 邮箱', hint: '126邮箱授权码', placeholder: '授权码', logo: '/126.png', domain: '126.com' },
  { type: 'yeah' as AccountType, label: 'yeah.net', hint: '网易邮箱授权码', placeholder: '授权码', logo: '/yeah.png', domain: 'yeah.net' },
  { type: '189' as AccountType, label: '189 邮箱', hint: '189邮箱授权码', placeholder: '授权码', logo: '/189.png', domain: '189.cn' },
  { type: 'sina' as AccountType, label: '新浪邮箱', hint: '新浪邮箱授权码', placeholder: '授权码', logo: '/sina.png', domain: 'sina.com' },
  { type: '139' as AccountType, label: '139 邮箱', hint: '139邮箱授权码', placeholder: '授权码', logo: '', domain: '139.com' },
  { type: 'sohu' as AccountType, label: '搜狐邮箱', hint: '搜狐邮箱授权码', placeholder: '授权码', logo: '', domain: 'sohu.com' },
  { type: 'aliyun' as AccountType, label: '阿里云邮箱', hint: '阿里云邮箱授权码', placeholder: '授权码', logo: '', domain: 'aliyun.com' },
]

const ALL_PROVIDERS = [...INTL_PROVIDERS, ...CN_PROVIDERS]

function LogoPlaceholder({ label, color }: { label: string; color: string }) {
  return (
    <div className="w-6 h-6 rounded text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: color }}>
      {label.slice(0, 2)}
    </div>
  )
}

const PLACEHOLDER_COLORS: Record<string, string> = {
  '139': '#00B050', sohu: '#E50B0B', aliyun: '#FF6A00',
}

export default function AddAccountPage({ onClose, onAdd }: Props) {
  const [step, setStep] = useState<'pick' | 'cn' | 'form'>('pick')
  const [provider, setProvider] = useState<typeof ALL_PROVIDERS[0] | null>(null)
  const [email, setEmail] = useState('')
  const [credential, setCredential] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!provider) return
    onAdd(email, provider.type, credential)
    onClose()
  }

  function selectProvider(p: typeof ALL_PROVIDERS[0]) {
    setProvider(p); setStep('form')
  }

  const emailPlaceholder = provider
    ? `your@${'domain' in provider ? (provider as any).domain : provider.type === 'qq' ? 'qq.com' : provider.type === 'gmail' ? 'gmail.com' : 'outlook.com'}`
    : ''

  const backAction = step === 'form' ? () => setStep(CN_PROVIDERS.some(p => p.type === provider?.type) ? 'cn' : 'pick') : step === 'cn' ? () => setStep('pick') : onClose

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      <div onClick={backAction} className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 cursor-pointer hover:bg-gray-50">
        <ArrowLeft size={22} className="text-gray-600" />
        <h1 className="text-base font-semibold text-gray-900">
          {step === 'pick' ? '添加账号' : step === 'cn' ? 'Others Mail' : `添加 ${provider?.label}`}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">
        {step === 'pick' && (
          <div className="flex flex-col gap-3">
            {INTL_PROVIDERS.map(p => (
              <button key={p.type} onClick={() => selectProvider(p)}
                className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-left">
                <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                  <img src={p.logo} alt={p.label} className="w-6 h-6 object-contain" />
                </div>
                <div>
                  <div className="font-medium text-gray-800">{p.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{p.hint}</div>
                </div>
              </button>
            ))}
            {/* Others Mail分组入口 */}
            <button onClick={() => setStep('cn')}
              className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-left">
              <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
                <span className="text-red-500 text-lg">📮</span>
              </div>
              <div>
                <div className="font-medium text-gray-800">Others Mail</div>
                <div className="text-xs text-gray-500 mt-0.5">163 / 126 / 189 / 新浪 / 搜狐 等</div>
              </div>
            </button>
          </div>
        )}

        {step === 'cn' && (
          <div className="flex flex-col gap-3">
            {CN_PROVIDERS.map(p => (
              <button key={p.type} onClick={() => selectProvider(p)}
                className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-left">
                <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                  {p.logo
                    ? <img src={p.logo} alt={p.label} className="w-6 h-6 object-contain" />
                    : <LogoPlaceholder label={p.label} color={PLACEHOLDER_COLORS[p.type] || '#888'} />}
                </div>
                <div>
                  <div className="font-medium text-gray-800">{p.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{p.hint}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 'form' && provider && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="text-sm text-gray-600 mb-1.5 block">邮箱地址</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder={emailPlaceholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            {provider.type === 'outlook' ? (
              <button type="button" className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium"
                onClick={() => { window.location.href = '/api/emails/oauth/outlook' }}>
                使用 Microsoft 授权登录
              </button>
            ) : (
              <>
                <div>
                  <label className="text-sm text-gray-600 mb-1.5 block">{provider.hint}</label>
                  <input type="password" required value={credential} onChange={e => setCredential(e.target.value)}
                    placeholder={provider.placeholder}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium">添加账号</button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
