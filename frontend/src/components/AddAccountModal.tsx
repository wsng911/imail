import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { AccountType } from '../types'

interface Props {
  onClose: () => void
  onAdd: (email: string, type: AccountType, credential: string) => void
}

const PROVIDERS = [
  { type: 'gmail' as AccountType, label: 'Gmail', hint: '16位应用专用密码', placeholder: 'xxxx xxxx xxxx xxxx', logo: '/gmail.png' },
  { type: 'outlook' as AccountType, label: 'Outlook / Hotmail / Live', hint: 'OAuth2 授权登录', placeholder: '', logo: '/outlook.png' },
  { type: 'qq' as AccountType, label: 'QQ 邮箱', hint: 'QQ 邮箱授权码', placeholder: '16位授权码', logo: '/qq.png' },
]

export default function AddAccountPage({ onClose, onAdd }: Props) {
  const [step, setStep] = useState<'pick' | 'form'>('pick')
  const [provider, setProvider] = useState<typeof PROVIDERS[0] | null>(null)
  const [email, setEmail] = useState('')
  const [credential, setCredential] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!provider) return
    onAdd(email, provider.type, credential)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* Header */}
      <div
        onClick={step === 'form' ? () => setStep('pick') : onClose}
        className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 cursor-pointer hover:bg-gray-50"
      >
        <ArrowLeft size={22} className="text-gray-600" />
        <h1 className="text-base font-semibold text-gray-900">
          {step === 'pick' ? '添加账号' : `添加 ${provider?.label}`}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">
        {step === 'pick' && (
          <div className="flex flex-col gap-3">
            {PROVIDERS.map(p => (
              <button
                key={p.type}
                onClick={() => { setProvider(p); setStep('form') }}
                className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                  <img src={p.logo} alt={p.label} className="w-6 h-6 object-contain" />
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
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder={`your@${provider.type === 'qq' ? 'qq.com' : provider.type === 'gmail' ? 'gmail.com' : 'outlook.com'}`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
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
                  <input
                    type="password" required value={credential} onChange={e => setCredential(e.target.value)}
                    placeholder={provider.placeholder}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium">
                  添加账号
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
