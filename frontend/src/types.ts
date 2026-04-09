export type AccountType = 'gmail' | 'outlook' | 'qq'

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
  read: boolean
  starred: boolean
  folder: 'inbox' | 'sent' | 'draft' | 'trash'
}
