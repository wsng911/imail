export type AccountType = 'gmail' | 'outlook' | 'qq' | '163' | '126' | 'yeah' | '189' | 'sina' | '139' | 'sohu' | 'aliyun'

export type Account = {
  id: string
  email: string
  type: AccountType
  color: string
  avatar?: string
  unread: number
  folderCounts?: Record<string, number>
}

export type Email = {
  id: string
  accountId: string
  from: string
  fromName: string
  to: string
  subject: string
  preview: string
  body: string
  date: string
  rawDate?: number
  read: boolean
  starred: boolean
  folder: 'inbox' | 'sent' | 'draft' | 'trash'
  hasAttachment?: boolean
}
