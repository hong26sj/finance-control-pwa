'use client'

import { useEffect } from 'react'
import { MoneyCalendar } from './money-calendar'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
      navigator.serviceWorker.register(`${basePath}/sw.js`, { scope: `${basePath}/` }).catch(() => undefined)
    }

    const applyCurrentTime = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const button = target?.closest('button')
      if (!button || button.textContent?.trim() !== '직접 입력') return

      window.setTimeout(() => {
        const input = document.querySelector('.modal input[type="time"]') as HTMLInputElement | null
        if (!input) return
        const now = new Date()
        const value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }, 0)
    }

    document.addEventListener('click', applyCurrentTime)
    return () => document.removeEventListener('click', applyCurrentTime)
  }, [])
  return <MoneyCalendar />
}
