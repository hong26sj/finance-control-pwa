'use client'

import { useEffect } from 'react'
import { MoneyCalendar } from './money-calendar'

const PENDING_MERCHANTS_KEY = 'flow-pending-merchants'
const TRANSACTIONS_KEY = 'flow-preview-transactions'

export function ServiceWorkerRegister() {
  useEffect(() => {
    let reloading = false
    let registration: ServiceWorkerRegistration | undefined

    const rememberPendingMerchants = () => {
      try {
        const rows = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]') as Array<{ id?: string; category?: string; merchant?: string }>
        const saved = JSON.parse(localStorage.getItem(PENDING_MERCHANTS_KEY) || '{}') as Record<string, string>
        rows.forEach((row) => {
          if (!row.id) return
          if (row.category === '미분류') {
            // Never erase an already remembered merchant merely because a Drive/privacy
            // restore temporarily produced a blank merchant field. The name should remain
            // available until this transaction is actually classified.
            if (row.merchant) saved[row.id] = row.merchant
          } else {
            delete saved[row.id]
          }
        })
        localStorage.setItem(PENDING_MERCHANTS_KEY, JSON.stringify(saved))
      } catch {
        // Keep the app usable even when local storage contains an older malformed value.
      }
    }

    const restorePendingMerchants = () => {
      try {
        const rows = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]') as Array<Record<string, unknown> & { id?: string; category?: string; merchant?: string }>
        const saved = JSON.parse(localStorage.getItem(PENDING_MERCHANTS_KEY) || '{}') as Record<string, string>
        let changed = false
        const restored = rows.map((row) => {
          if (row.category !== '미분류' || row.merchant || !row.id || !saved[row.id]) return row
          changed = true
          return { ...row, merchant: saved[row.id] }
        })
        if (changed) localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(restored))
        return changed
      } catch {
        return false
      }
    }

    const restoreAndReloadOnce = () => {
      if (!restorePendingMerchants()) return
      if (sessionStorage.getItem('flow-pending-merchant-restored') === '1') return
      sessionStorage.setItem('flow-pending-merchant-restored', '1')
      window.setTimeout(() => window.location.reload(), 0)
    }

    restoreAndReloadOnce()

    const checkForUpdate = () => registration?.update().catch(() => undefined)
    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        restoreAndReloadOnce()
        checkForUpdate()
      } else {
        rememberPendingMerchants()
      }
    }
    const onPageShow = () => {
      restoreAndReloadOnce()
      checkForUpdate()
    }
    const onPageHide = () => rememberPendingMerchants()

    // Keep a live copy while the classification inbox is open. This avoids relying on
    // iOS Safari/PWA pagehide timing when the app is terminated from the app switcher.
    const merchantBackupTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') rememberPendingMerchants()
    }, 500)

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
      window.addEventListener('pagehide', onPageHide)
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
      rememberPendingMerchants()
      window.clearInterval(merchantBackupTimer)
      document.removeEventListener('click', applyCurrentTime)
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])
  return <MoneyCalendar />
}
