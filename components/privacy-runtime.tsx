'use client'

import { useLayoutEffect } from 'react'
import { normalizeMerchant, Transaction } from '@/lib/finance'
import { DEFAULT_APPS_SCRIPT_URL, saveMerchantRule } from '@/lib/drive-api'

type PendingRule = { rawMerchant?: string; merchantHash?: string; displayName: string; category: string }

export function PrivacyRuntime() {
  useLayoutEffect(() => {
    const originalSetItem = Storage.prototype.setItem
    const rawById = new Map<string, string>()
    const pendingRules = new Map<string, PendingRule>()

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
        if (rule.rawMerchant) rawById.delete(key)
      } catch {
        pendingRules.set(key, rule)
      }
    }

    const flushPending = () => {
      pendingRules.forEach((rule, key) => { void persistRule(key, rule) })
    }

    const sanitizeRows = (value: string) => {
      let rows: Transaction[]
      try { rows = JSON.parse(value) as Transaction[] } catch { return value }
      if (!Array.isArray(rows)) return value

      let previous: Transaction[] = []
      try { previous = JSON.parse(window.localStorage.getItem('flow-preview-transactions') || '[]') as Transaction[] } catch { /* ignore */ }
      const previousById = new Map(previous.map((row) => [row.id, row]))

      const sanitized = rows.map((row) => {
        if (row.category === '미분류') {
          if (row.merchant?.trim()) rawById.set(row.id, row.merchant.trim())
          return { ...row, merchant: '' }
        }

        const rawMerchant = rawById.get(row.id)
        const previousRow = previousById.get(row.id)
        let displayName = String(row.merchant || '').trim()

        if (rawMerchant) {
          if (!displayName || normalizeMerchant(displayName) === normalizeMerchant(rawMerchant)) displayName = row.category
          void persistRule(row.id, { rawMerchant, merchantHash: row.merchantHash, displayName, category: row.category })
        } else if (row.merchantHash && previousRow && (previousRow.merchant !== displayName || previousRow.category !== row.category)) {
          if (!displayName) displayName = row.category
          void persistRule(row.id, { merchantHash: row.merchantHash, displayName, category: row.category })
        }

        return { ...row, merchant: displayName }
      })
      return JSON.stringify(sanitized)
    }

    // 기존 버전에서 남아 있던 미분류 원문도 첫 실행 시 즉시 제거합니다.
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
