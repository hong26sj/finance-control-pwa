'use client'

import { useLayoutEffect } from 'react'
import { Transaction } from '@/lib/finance'
import { DEFAULT_APPS_SCRIPT_URL, saveMerchantRule, saveTransactionMerchants } from '@/lib/drive-api'

type PendingRule = { transactionId: string; rawMerchant?: string; merchantHash?: string; category: string }
type PendingMerchant = { id: string; merchant: string; merchantHash?: string; category?: string }

export function PrivacyRuntime() {
  useLayoutEffect(() => {
    const originalSetItem = Storage.prototype.setItem
    const rawById = new Map<string, string>()
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

    const sanitizeRows = (value: string) => {
      let rows: Transaction[]
      try { rows = JSON.parse(value) as Transaction[] } catch { return value }
      if (!Array.isArray(rows)) return value

      let previous: Transaction[] = []
      try { previous = JSON.parse(window.localStorage.getItem('flow-preview-transactions') || '[]') as Transaction[] } catch { /* ignore */ }
      const previousById = new Map(previous.map((row) => [row.id, row]))

      const sanitized = rows.map((row) => {
        const rawMerchant = String(row.merchant || rawById.get(row.id) || '').trim()
        if (rawMerchant) {
          rawById.set(row.id, rawMerchant)
          pendingMerchants.set(row.id, { id: row.id, merchant: rawMerchant, merchantHash: row.merchantHash, category: row.category })
        }

        const previousRow = previousById.get(row.id)
        if (row.category !== '미분류' && (rawMerchant || row.merchantHash) && (!previousRow || previousRow.category !== row.category)) {
          void persistRule(row.id, { transactionId: row.id, rawMerchant: rawMerchant || undefined, merchantHash: row.merchantHash, category: row.category })
        }

        return { ...row, merchant: '' }
      })
      window.setTimeout(() => void persistMerchants(), 0)
      return JSON.stringify(sanitized)
    }

    const existing = window.localStorage.getItem('flow-preview-transactions')
    if (existing) originalSetItem.call(window.localStorage, 'flow-preview-transactions', sanitizeRows(existing))

    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage && key === 'flow-preview-transactions') value = sanitizeRows(value)
      const result = originalSetItem.call(this, key, value)
      if (this === window.localStorage && key === 'flow-drive-token' && value) window.setTimeout(flushPending, 0)
      return result
    }

    return () => { Storage.prototype.setItem = originalSetItem }
  }, [])

  return null
}
