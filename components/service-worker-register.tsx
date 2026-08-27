'use client'

import { useEffect } from 'react'
import { MoneyCalendar } from './money-calendar'

export function ServiceWorkerRegister() {
  useEffect(() => {
    let reloading = false
    let registration: ServiceWorkerRegistration | undefined

    const checkForUpdate = () => registration?.update().catch(() => undefined)
    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }
    const onPageShow = () => checkForUpdate()

    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
      navigator.serviceWorker
        .register(`${basePath}/sw.js`, {
          scope: `${basePath}/`,
          updateViaCache: 'none',
        })
        .then((value) => {
          registration = value
          return value.update()
        })
        .catch(() => undefined)

      document.addEventListener('visibilitychange', onVisibilityChange)
      window.addEventListener('pageshow', onPageShow)
    }

    const headerDate = document.querySelector<HTMLElement>('.current-date')
    if (headerDate) headerDate.textContent = headerDate.textContent?.replace(/\s*현재\s*$/, '') || ''

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
    return () => {
      document.removeEventListener('click', applyCurrentTime)
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])
  return <MoneyCalendar />
}
