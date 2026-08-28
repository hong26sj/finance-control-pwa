'use client'

import { useEffect } from 'react'
import { DEFAULT_APPS_SCRIPT_URL } from '@/lib/drive-api'
import { Transaction } from '@/lib/finance'

const TRANSACTIONS_KEY = 'flow-preview-transactions'
const NOTICE_KEY = 'flow-shortcut-sync-notice'

type PendingShortcutTransaction = Transaction & { createdAt?: string }

async function request(endpoint: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(endpoint || DEFAULT_APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, auth_token: token }),
  })
  const result = await response.json().catch(() => null)
  if (!result?.ok) throw new Error(result?.message || result?.error || 'shortcut sync failed')
  return result
}

function readRows(): Transaction[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function isDuplicate(rows: Transaction[], candidate: PendingShortcutTransaction) {
  return rows.some((row) =>
    row.id === candidate.id ||
    (row.date === candidate.date &&
      row.time === candidate.time &&
      row.card === candidate.card &&
      row.amount === candidate.amount &&
      String(row.merchant || '').trim() === String(candidate.merchant || '').trim())
  )
}

function needsShortcutReview(row: Transaction) {
  return row.source === 'iOS 카드알림 OCR' && row.merchantCategoryAuto === true && row.merchantCategoryConfirmed !== true
}

function asReviewRow(row: PendingShortcutTransaction): PendingShortcutTransaction {
  if (!needsShortcutReview(row)) return row
  return {
    ...row,
    category: '미분류',
    living: true,
    fixed: false,
  }
}

export function ShortcutInboxSync() {
  useEffect(() => {
    let syncing = false
    let stopped = false
    const inheritedSetItem = Storage.prototype.setItem

    // A shortcut transaction may already have been auto-classified on the server.
    // Keep it in the transaction inbox as '미분류' until the user explicitly saves
    // a category in the installed PWA. This also recovers shortcut rows that were
    // previously synced but invisible because the transaction tab only showed 미분류.
    try {
      const rows = readRows()
      let changed = false
      const reviewed = rows.map((row) => {
        const next = asReviewRow(row)
        if (next !== row) changed = true
        return next
      })
      if (changed) inheritedSetItem.call(localStorage, TRANSACTIONS_KEY, JSON.stringify(reviewed))
    } catch { /* ignore malformed legacy storage */ }

    // Mark an OCR transaction confirmed when the user changes it from 미분류 to a
    // concrete category. Otherwise a later app launch would put it back in the inbox.
    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage && key === TRANSACTIONS_KEY) {
        try {
          const previous = readRows()
          const previousById = new Map(previous.map((row) => [row.id, row]))
          const next = JSON.parse(value) as Transaction[]
          if (Array.isArray(next)) {
            value = JSON.stringify(next.map((row) => {
              const before = previousById.get(row.id)
              if (
                row.source === 'iOS 카드알림 OCR' &&
                before?.category === '미분류' &&
                row.category !== '미분류'
              ) {
                return { ...row, merchantCategoryAuto: false, merchantCategoryConfirmed: true }
              }
              return row
            }))
          }
        } catch { /* keep original value */ }
      }
      return inheritedSetItem.call(this, key, value)
    }

    const showPendingNotice = () => {
      const notice = sessionStorage.getItem(NOTICE_KEY)
      if (!notice) return
      sessionStorage.removeItem(NOTICE_KEY)
      window.setTimeout(() => window.alert(notice), 250)
    }

    const sync = async () => {
      if (syncing || stopped || document.visibilityState === 'hidden') return
      const token = localStorage.getItem('flow-drive-token') || ''
      if (!token) return
      const endpoint = localStorage.getItem('flow-drive-endpoint') || DEFAULT_APPS_SCRIPT_URL
      syncing = true
      try {
        const result = await request(endpoint, token, { action: 'shortcut.pending.get' })
        const pending = (Array.isArray(result.items) ? result.items : []) as PendingShortcutTransaction[]
        if (!pending.length) return

        const rows = readRows()
        const additions = pending
          .filter((item) => !isDuplicate(rows, item))
          .map(asReviewRow)

        if (additions.length) {
          localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([...rows, ...additions]))
        }

        await request(endpoint, token, { action: 'shortcut.pending.ack', ids: pending.map((item) => item.id) })
        if (additions.length) {
          const total = additions.reduce((sum, item) => sum + Number(item.amount || 0), 0)
          sessionStorage.setItem(NOTICE_KEY, `카드 알림 ${additions.length}건 동기화 완료\n${total.toLocaleString('ko-KR')}원\n거래 탭에서 카테고리를 확인하세요.`)
          window.location.reload()
        }
      } catch {
        // Keep the inbox on the server and retry the next time the installed PWA is opened.
      } finally {
        syncing = false
      }
    }

    showPendingNotice()
    const timer = window.setTimeout(() => void sync(), 700)
    const onVisible = () => { if (document.visibilityState === 'visible') void sync() }
    const onPageShow = () => void sync()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)

    return () => {
      stopped = true
      window.clearTimeout(timer)
      Storage.prototype.setItem = inheritedSetItem
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  return null
}
