import { useEffect } from 'react'

interface Props {
  message: string
  onClose: () => void
  duration?: number
}

export default function Toast({ message, onClose, duration = 4000 }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [onClose, duration])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-800 dark:bg-gray-700 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg max-w-xs text-center">
      {message}
    </div>
  )
}
