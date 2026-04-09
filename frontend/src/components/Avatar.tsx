interface AvatarProps {
  text: string
  color: string
  size?: 'sm' | 'md'
  emoji?: string
}

export default function Avatar({ text, color, size = 'md', emoji }: AvatarProps) {
  const sz = size === 'md' ? 'w-11 h-11 text-sm' : 'w-8 h-8 text-xs'
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ background: color }}
    >
      {emoji || text}
    </div>
  )
}
