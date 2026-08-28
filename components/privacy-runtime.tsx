'use client'

import { useLayoutEffect } from 'react'
import { Transaction } from '@/lib/finance'
import { DEFAULT_APPS_SCRIPT_URL, saveMerchantRule, saveTransactionMerchants } from '@/lib/drive-api'

type PendingRule = { transactionId: string; rawMerchant?: string; merchantHash?: string; category: string }
type PendingMerchant = { id: string; merchant: string; merchantHash?: string; category?: string }

const SHORTCUT_STAGE_KEY = 'flow-shortcut-staged-transactions'
const TRANSACTIONS_KEY = 'flow-preview-transactions'

function sameTransaction(a: Transaction, b: Transaction) {
  return a.id === b.id || (
    a.date === b.date &&
    a.time === b.time &&
    a.card === b.card &&
    Number(a.amount) === Number(b.amount) &&
    String(a.merchant || '').trim() === String(b.merchant || '').trim()
  )
}

export function PrivacyRuntime() {
  useLayoutEffect(() => {
    const originalSetItem = Storage.prototype.setItem
    const pendingRules = new Map<string, PendingRule>()
    const pendingMerchants = new Map<string, PendingMerchant>()

    const getAuth = () => ({
      token: window.localStorage.getItem('flow-drive-token') || '',
      endpoint: window.localStorage.getItem('flow-drive-endpoint') || DEFAULT_APPS_SCRIPT_URL,
    })

    const persistRule = async (key: string, rule: PendingRule) => {
      const { token, endpoint } = getAuth()
      if (!token) { pendingRules.set(key, rule); return }
      try {
        await saveMerchantRule(endpoint, token, rule)
        pendingRules.delete(key)
      } catch {
        pendingRules.set(key, rule)
      }
    }

    const persistMerchants = async () => {
      const { token, endpoint } = getAuth()
      if (!token || pendingMerchants.size === 0) return
      const items = [...pendingMerchants.values()]
      try {
        await saveTransactionMerchants(endpoint, token, items)
        items.forEach((item) => pendingMerchants.delete(item.id))
      } catch { /* keep pending in memory */ }
    }

    const flushPending = () => {
      pendingRules.forEach((rule, key) => { void persistRule(key, rule) })
      void persistMerchants()
    }

    const processRows = (value: string) => {
      let rows: Transaction[]
      try { rows = JSON.parse(value) as Transaction[] } catch { return value }
      if (!Array.isArray(rows)) return value

      // Shortcut sync can finish while FinanceApp is still hydrating. In that race the
      // old React state used to overwrite the newly imported transaction immediately
      // after the server inbox had already been acknowledged. Keep a separate staged
      // copy and merge it into every transaction write until FinanceApp has hydrated it.
      try {
        const staged = JSON.parse(window.localStorage.getItem(SHORTCUT_STAGE_KEY) || '[]') as Transaction[]
        if (Array.isArray(staged) && staged.length) {
          const allAlreadyPresent = staged.every((item) => rows.some((row) => sameTransaction(row, item)))
          if (allAlreadyPresent) {
            window.localStorage.removeItem(SHORTCUT_STAGE_KEY)
          } else {
            staged.forEach((item) => {
              if (!rows.some((row) => sameTransaction(row, item))) rows.push(item)
            })
          }
        }
      } catch { /* keep normal transaction persistence working */ }

      let previous: Transaction[] = []
      try { previous = JSON.parse(window.localStorage.getItem(TRANSACTIONS_KEY) || '[]') as Transaction[] } catch { /* ignore */ }
      const previousById = new Map(previous.map((row) => [row.id, row]))

      rows.forEach((row) => {
        const merchant = String(row.merchant || '').trim()
        if (merchant) {
          pendingMerchants.set(row.id, {
            id: row.id,
            merchant,
            merchantHash: row.merchantHash,
            category: row.category,
          })
        }

        const previousRow = previousById.get(row.id)
        if (row.category !== '미분류' && (merchant || row.merchantHash) && (!previousRow || previousRow.category !== row.category)) {
          void persistRule(row.id, {
            transactionId: row.id,
            rawMerchant: merchant || undefined,
            merchantHash: row.merchantHash,
            category: row.category,
          })
        }
      })

      window.setTimeout(() => void persistMerchants(), 0)
      return JSON.stringify(rows)
    }

    const existing = window.localStorage.getItem(TRANSACTIONS_KEY)
    if (existing) originalSetItem.call(window.localStorage, TRANSACTIONS_KEY, processRows(existing))

    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage && key === TRANSACTIONS_KEY) value = processRows(value)
      const result = originalSetItem.call(this, key, value)
      if (this === window.localStorage && key === 'flow-drive-token' && value) window.setTimeout(flushPending, 0)
      return result
    }

    return () => { Storage.prototype.setItem = originalSetItem }
  }, [])

  return null
}
