import type { Account, Email } from './types'

export const MOCK_ACCOUNTS: Account[] = [
  { id: '1', email: 'idays.sky@gmail.com', type: 'gmail', color: '#4A90D9', unread: 0 },
  { id: '2', email: 'laughing.starsky@gmail.com', type: 'gmail', color: '#E91E8C', unread: 0 },
  { id: '3', email: '824559662@qq.com', type: 'qq', color: '#E91E63', unread: 0 },
  { id: '4', email: '799930253@qq.com', type: 'qq', color: '#8BC34A', unread: 2 },
  { id: '5', email: 'wsng911@live.com', type: 'outlook', color: '#FF7043', unread: 1 },
  { id: '6', email: 'wsng911@hotmail.com', type: 'outlook', color: '#26A69A', unread: 2 },
]

export const MOCK_EMAILS: Email[] = [
  {
    id: '1', accountId: '5', from: 'account-security-noreply@accountprotection.microsoft.com',
    fromName: 'Microsoft 帐户团队', to: 'wsng911@live.com',
    subject: '连接到 Microsoft 帐户的新应用',
    preview: 'OAuth2 for Outlook 已连接到 Microsoft 帐户 ws**1@hotmail.com。如果未授予此访问权限，请从帐户',
    body: 'OAuth2 for Outlook 已连接到 Microsoft 帐户 ws**1@hotmail.com。如果未授予此访问权限，请从帐户安全设置中撤销访问权限。',
    date: '17:08', read: false, starred: false, folder: 'inbox'
  },
  {
    id: '2', accountId: '1', from: 'support@ifast.com', fromName: 'iFAST Global Bank Support',
    to: 'idays.sky@gmail.com',
    subject: '🎉 iFAST Global Bank has been shortlisted for th...',
    preview: 'Dear Song, Support iFAST Global Bank at the British Bank Awards 2026 We\'re proud',
    body: 'Dear Song, Support iFAST Global Bank at the British Bank Awards 2026. We\'re proud to announce that iFAST Global Bank has been shortlisted.',
    date: '16:10', read: false, starred: false, folder: 'inbox'
  },
  {
    id: '3', accountId: '2', from: 'no-reply@cloudns.net', fromName: 'ClouDNS',
    to: 'laughing.starsky@gmail.com',
    subject: '30% OFF on DDoS Protected DNS | ClouDNS',
    preview: 'View this email in your browser <... Dear, mr lees! We have something special for you this month! Enjoy',
    body: 'Dear mr lees! We have something special for you this month! Enjoy 30% OFF on DDoS Protected DNS.',
    date: '12:58', read: true, starred: false, folder: 'inbox'
  },
  {
    id: '4', accountId: '1', from: 'noreply@github.com', fromName: 'GitHub',
    to: 'idays.sky@gmail.com',
    subject: '[GitHub] A new SSH authentication public key w...',
    preview: 'The following SSH key was added to your account: claw',
    body: 'The following SSH key was added to your account: claw. If you did not add this key, please remove it immediately.',
    date: '12:10', read: false, starred: false, folder: 'inbox'
  },
  {
    id: '5', accountId: '1', from: 'noreply@github.com', fromName: 'GitHub',
    to: 'idays.sky@gmail.com',
    subject: '[GitHub] Sudo email verification code',
    preview: 'Hey, wsng911! Here is your GitHub sudo authentication code: 43077876 This code is valid for 15',
    body: 'Hey, wsng911! Here is your GitHub sudo authentication code: 43077876. This code is valid for 15 minutes.',
    date: '12:09', read: true, starred: false, folder: 'inbox'
  },
  {
    id: '6', accountId: '3', from: 'honors@hilton.com', fromName: 'Hilton Honors',
    to: '824559662@qq.com',
    subject: '限时好礼:每次入住立享 2,000 奖励积分',
    preview: '限时惊喜:每次入住尊享 2,000 奖励积分。',
    body: '限时惊喜:每次入住尊享 2,000 奖励积分。立即预订，享受专属优惠。',
    date: '09:42', read: true, starred: false, folder: 'inbox'
  },
]

export function getInitials(email: string): string {
  const name = email.split('@')[0]
  return name.slice(0, 2).toUpperCase()
}


