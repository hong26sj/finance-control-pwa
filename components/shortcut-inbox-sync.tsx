'use client'

import { useEffect } from 'react'
import { DEFAULT_APPS_SCRIPT_URL } from '@/lib/drive-api'
import { Transaction } from '@/lib/finance'

const TRANSACTIONS_KEY = 'flow-preview-transactions'
const NOTICE_KEY = 'flow-shortcut-sync-notice'
const STAGE_KEY = 'flow-shortcut-staged-transactions'

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

function readStage(): PendingShortcutTransaction[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STAGE_KEY) || '[]')
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
  return row.source === 'iOS 카드알림 OCR' && row.merchantCategoryConfirmed !== true
}

function asReviewRow(row: PendingShortcutTransaction): PendingShortcutTransaction {
  if (!needsShortcutReview(row)) return row
  return {
    ...row,
    category: '미분류',
    living: true,
    fixed: false,
    merchantCategoryAuto: row.merchantCategoryAuto === true,
  }
}

function mergeStage(items: PendingShortcutTransaction[]) {
  const existing = readStage()
  const merged = [...existing]
  items.forEach((item) => {
    if (!isDuplicate(merged, item)) merged.push(item)
  })
  localStorage.setItem(STAGE_KEY, JSON.stringify(merged))
  return merged
}

export function ShortcutInboxSync() {
  useEffect(() => {
    let syncing = false
    let stopped = false
    const inheritedSetItem = Storage.prototype.setItem

    // Recover any staged rows first. PrivacyRuntime keeps these rows merged into every
    // transaction write until FinanceApp has hydrated them, so a slow PWA startup can no
    // longer overwrite a shortcut import after the server inbox has been acknowledged.
    try {
      const staged = readStage().map(asReviewRow)
      if (staged.length) {
        const rows = readRows()
        const additions = staged.filter((item) => !isDuplicate(rows, item))
        if (additions.length) localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([...rows, ...additions]))
      }
    } catch { /* ignore malformed legacy storage */ }

    // Also recover older OCR rows that were already synced with an automatic category and
    // therefore disappeared from the transaction inbox.
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

        // Persist a durable staging copy BEFORE acknowledging the server. If FinanceApp
        // is still hydrating, PrivacyRuntime merges this staging copy into the later write.
        if (additions.length) {
          mergeStage(additions)
          localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([...rows, ...additions]))
        }

        await request(endpoint, token, { action: 'shortcut.pending.ack', ids: pending.map((item) => item.id) })
        if (additions.length) {
          const total = additions.reduce((sum, item) => sum + Number(item.amount || 0), 0)
          sessionStorage.setItem(NOTICE_KEY, `카드 알림 ${additions.length}건 동기화 완료\n${total.toLocaleString('ko-KR')}원\n거래 탭에서 카테고리를 확인하세요.`)
          window.setTimeout(() => window.location.reload(), 100)
        }
      } catch {
        // Keep the inbox on the server and retry the next time the installed PWA is opened.
      } finally {
        syncing = false
      }
    }

    showPendingNotice()
    const timer = window.setTimeout(() => void sync(), 1500)
    const onVisible = () => { if (document.visibilityState === 'visible') window.setTimeout(() => void sync(), 300) }
    const onPageShow = () => window.setTimeout(() => void sync(), 300)
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
