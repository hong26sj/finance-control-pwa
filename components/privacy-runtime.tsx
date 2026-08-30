'use client'

import { useLayoutEffect } from 'react'
import { FinanceSettings, FixedPlan, Loan, Transaction } from '@/lib/finance'
import { DEFAULT_APPS_SCRIPT_URL, deleteDriveTransactions, saveDriveConfig, upsertDriveTransactions } from '@/lib/drive-api'

const TRANSACTIONS_KEY = 'flow-preview-transactions'
const LOANS_KEY = 'flow-preview-loans'
const FIXED_KEY = 'flow-preview-fixed'
const SETTINGS_KEY = 'flow-preview-settings'
const FINANCE_KEYS = new Set([TRANSACTIONS_KEY, LOANS_KEY, FIXED_KEY, SETTINGS_KEY])

function parseRows(value: string | null): Transaction[] {
  try {
    const rows = JSON.parse(value || '[]') as Transaction[]
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function parseArray<T>(value: string | null): T[] {
  try {
    const items = JSON.parse(value || '[]') as T[]
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

function parseSettings(value: string | null): FinanceSettings | undefined {
  try {
    const settings = JSON.parse(value || 'null') as FinanceSettings | null
    return settings && typeof settings === 'object' ? settings : undefined
  } catch {
    return undefined
  }
}

function sameRow(a: Transaction, b: Transaction) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function reportProgress(progress: number, stage: string, state: 'saving' | 'done' | 'error' = 'saving') {
  window.dispatchEvent(new CustomEvent('flow-drive-save-progress', { detail: { progress, stage, state } }))
}

export function PrivacyRuntime() {
  useLayoutEffect(() => {
    const originalGetItem = Storage.prototype.getItem
    const originalSetItem = Storage.prototype.setItem
    const originalRemoveItem = Storage.prototype.removeItem
    const memory = new Map<string, string>()
    let serverReady = false
    let authSeen = false
    let hydrationTimer: number | undefined
    let configTimer: number | undefined
    let suspendUntil = 0
    let explicitTransactionWriteUntil = 0

    const realLocalGet = (key: string) => originalGetItem.call(window.localStorage, key)
    const getAuth = () => ({
      token: realLocalGet('flow-drive-token') || '',
      endpoint: realLocalGet('flow-drive-endpoint') || DEFAULT_APPS_SCRIPT_URL,
    })

    const purgeLegacyFinanceData = () => {
      FINANCE_KEYS.forEach((key) => originalRemoveItem.call(window.localStorage, key))
      originalRemoveItem.call(window.localStorage, 'flow-shortcut-staged-transactions')
      originalRemoveItem.call(window.localStorage, 'flow-shortcut-sync-notice')
    }

    const suspended = () => Date.now() < suspendUntil
    const explicitTransactionWrite = () => Date.now() < explicitTransactionWriteUntil

    const persistTransactionDiff = (previousValue: string | null, nextValue: string) => {
      if (!serverReady || suspended() || explicitTransactionWrite()) return
      const { token, endpoint } = getAuth()
      if (!token) return
      const previous = parseRows(previousValue)
      const next = parseRows(nextValue)
      const previousById = new Map(previous.map((row) => [row.id, row]))
      const nextById = new Map(next.map((row) => [row.id, row]))
      const upserts = next.filter((row) => {
        const before = previousById.get(row.id)
        return !before || !sameRow(before, row)
      })
      const deletedIds = previous.filter((row) => !nextById.has(row.id)).map((row) => row.id)
      if (!upserts.length && !deletedIds.length) return

      reportProgress(12, '변경사항 준비 중')
      window.setTimeout(() => reportProgress(36, 'Drive 전송 중'), 80)
      const tasks: Promise<unknown>[] = []
      if (upserts.length) tasks.push(upsertDriveTransactions(endpoint, token, upserts))
      if (deletedIds.length) tasks.push(deleteDriveTransactions(endpoint, token, deletedIds))
      window.setTimeout(() => reportProgress(72, '거래내역 저장 중'), 220)
      Promise.all(tasks).then(() => {
        reportProgress(100, '저장 완료', 'done')
      }).catch((error) => {
        reportProgress(0, error instanceof Error ? error.message : '저장 실패', 'error')
      })
    }

    const persistConfig = () => {
      if (!serverReady || suspended()) return
      const { token, endpoint } = getAuth()
      if (!token) return
      const loans = parseArray<Loan>(memory.get(LOANS_KEY) || null)
      const fixedPlans = parseArray<FixedPlan>(memory.get(FIXED_KEY) || null)
      const settings = parseSettings(memory.get(SETTINGS_KEY) || null)
      if (!settings) return
      void saveDriveConfig(endpoint, token, { loans, fixedPlans, settings, cashFlow: 0 }).catch(() => undefined)
    }

    const scheduleConfig = () => {
      if (!serverReady || suspended()) return
      if (configTimer !== undefined) window.clearTimeout(configTimer)
      configTimer = window.setTimeout(persistConfig, 650)
    }

    const armServerReadyAfterHydration = () => {
      if (serverReady || !authSeen || hydrationTimer !== undefined) return
      hydrationTimer = window.setTimeout(() => {
        serverReady = true
        hydrationTimer = undefined
        purgeLegacyFinanceData()
      }, 900)
    }

    Storage.prototype.getItem = function (key: string) {
      if (this === window.localStorage && FINANCE_KEYS.has(key)) return memory.get(key) ?? null
      return originalGetItem.call(this, key)
    }

    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage && FINANCE_KEYS.has(key)) {
        const previous = memory.get(key) ?? null
        memory.set(key, value)
        if (!serverReady) {
          armServerReadyAfterHydration()
          return
        }
        if (key === TRANSACTIONS_KEY) persistTransactionDiff(previous, value)
        else scheduleConfig()
        return
      }
      return originalSetItem.call(this, key, value)
    }

    Storage.prototype.removeItem = function (key: string) {
      if (this === window.localStorage && FINANCE_KEYS.has(key)) {
        const previous = memory.get(key) ?? null
        memory.delete(key)
        if (key === TRANSACTIONS_KEY && previous && serverReady && !suspended() && !explicitTransactionWrite()) {
          const { token, endpoint } = getAuth()
          const ids = parseRows(previous).map((row) => row.id)
          if (token && ids.length) void deleteDriveTransactions(endpoint, token, ids).catch(() => undefined)
        }
        return
      }
      return originalRemoveItem.call(this, key)
    }

    const suspendForRemoteLoad = () => { suspendUntil = Date.now() + 3500 }
    const onExplicitTransactionWrite = () => { explicitTransactionWriteUntil = Date.now() + 6000 }
    const onClickCapture = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest('button')
      const text = button?.textContent?.trim() || ''
      if (text === 'Drive에서 불러오기' || text.includes('인증하고 Drive 불러오기')) suspendForRemoteLoad()
    }
    const onVisible = () => { if (document.visibilityState === 'visible') suspendForRemoteLoad() }
    const onPageShow = () => suspendForRemoteLoad()

    document.addEventListener('click', onClickCapture, true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('flow-explicit-transaction-write', onExplicitTransactionWrite)

    const authWatcher = window.setInterval(() => {
      const state = document.querySelector<HTMLElement>('.sidebar .sync b')?.textContent?.trim() || ''
      if (state.includes('인증됨')) authSeen = true
    }, 200)

    return () => {
      if (hydrationTimer !== undefined) window.clearTimeout(hydrationTimer)
      if (configTimer !== undefined) window.clearTimeout(configTimer)
      window.clearInterval(authWatcher)
      document.removeEventListener('click', onClickCapture, true)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('flow-explicit-transaction-write', onExplicitTransactionWrite)
      Storage.prototype.getItem = originalGetItem
      Storage.prototype.setItem = originalSetItem
      Storage.prototype.removeItem = originalRemoveItem
    }
  }, [])

  return null
}
