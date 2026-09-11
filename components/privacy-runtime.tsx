'use client'

import { useLayoutEffect } from 'react'
import { FinanceSettings, FixedPlan, Loan, Transaction } from '@/lib/finance'
import { DEFAULT_APPS_SCRIPT_URL, deleteDriveTransactions, saveDriveConfig, upsertDriveTransactions } from '@/lib/drive-api'

const TRANSACTIONS_KEY = 'flow-preview-transactions'
const LOANS_KEY = 'flow-preview-loans'
const FIXED_KEY = 'flow-preview-fixed'
const SETTINGS_KEY = 'flow-preview-settings'
const PENDING_KEY = 'flow-sync-pending-v2'
const FINANCE_KEYS = new Set([TRANSACTIONS_KEY, LOANS_KEY, FIXED_KEY, SETTINGS_KEY])

type PendingSync = { upsertIds: string[]; deletedIds: string[]; config: boolean }

const EMPTY_PENDING: PendingSync = { upsertIds: [], deletedIds: [], config: false }

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

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function reportProgress(progress: number, stage: string, state: 'saving' | 'done' | 'error' = 'saving') {
  window.dispatchEvent(new CustomEvent('flow-drive-save-progress', { detail: { progress, stage, state } }))
}

export function PrivacyRuntime() {
  useLayoutEffect(() => {
    const originalGetItem = Storage.prototype.getItem
    const originalSetItem = Storage.prototype.setItem
    const originalRemoveItem = Storage.prototype.removeItem
    let configTimer: number | undefined
    let flushTimer: number | undefined
    let flushing = false
    let suspendUntil = 0
    let explicitTransactionWriteUntil = 0

    const realGet = (key: string) => originalGetItem.call(window.localStorage, key)
    const realSet = (key: string, value: string) => originalSetItem.call(window.localStorage, key, value)
    const realRemove = (key: string) => originalRemoveItem.call(window.localStorage, key)
    const suspended = () => Date.now() < suspendUntil
    const explicitTransactionWrite = () => Date.now() < explicitTransactionWriteUntil
    const getAuth = () => ({
      token: realGet('flow-drive-token') || '',
      endpoint: realGet('flow-drive-endpoint') || DEFAULT_APPS_SCRIPT_URL,
    })

    const readPending = (): PendingSync => {
      try {
        const raw = JSON.parse(realGet(PENDING_KEY) || 'null') as Partial<PendingSync> | null
        if (!raw) return { ...EMPTY_PENDING }
        return {
          upsertIds: unique(Array.isArray(raw.upsertIds) ? raw.upsertIds.map(String) : []),
          deletedIds: unique(Array.isArray(raw.deletedIds) ? raw.deletedIds.map(String) : []),
          config: raw.config === true,
        }
      } catch {
        return { ...EMPTY_PENDING }
      }
    }

    const writePending = (pending: PendingSync) => {
      const normalized = {
        upsertIds: unique(pending.upsertIds),
        deletedIds: unique(pending.deletedIds),
        config: pending.config === true,
      }
      if (!normalized.upsertIds.length && !normalized.deletedIds.length && !normalized.config) {
        realRemove(PENDING_KEY)
      } else {
        realSet(PENDING_KEY, JSON.stringify(normalized))
      }
    }

    const mergePending = (incoming: Partial<PendingSync>) => {
      const current = readPending()
      const deleted = unique([...current.deletedIds, ...(incoming.deletedIds || [])])
      const deletedSet = new Set(deleted)
      const upserts = unique([...current.upsertIds, ...(incoming.upsertIds || [])]).filter((id) => !deletedSet.has(id))
      writePending({ upsertIds: upserts, deletedIds: deleted, config: current.config || incoming.config === true })
    }

    const scheduleFlush = (delay = 180) => {
      if (flushTimer !== undefined) window.clearTimeout(flushTimer)
      flushTimer = window.setTimeout(() => { void flushPending() }, delay)
    }

    const flushPending = async () => {
      if (flushing || suspended() || explicitTransactionWrite() || !navigator.onLine) return
      const { token, endpoint } = getAuth()
      if (!token) return
      const pending = readPending()
      if (!pending.upsertIds.length && !pending.deletedIds.length && !pending.config) return

      flushing = true
      writePending({ ...EMPTY_PENDING })
      reportProgress(38, 'Drive 동기화 중')

      try {
        const rows = parseRows(realGet(TRANSACTIONS_KEY))
        const wanted = new Set(pending.upsertIds)
        const upserts = rows.filter((row) => wanted.has(row.id))
        if (upserts.length) await upsertDriveTransactions(endpoint, token, upserts)
        if (pending.deletedIds.length) await deleteDriveTransactions(endpoint, token, pending.deletedIds)

        if (pending.config) {
          const settings = parseSettings(realGet(SETTINGS_KEY))
          if (settings) {
            await saveDriveConfig(endpoint, token, {
              loans: parseArray<Loan>(realGet(LOANS_KEY)),
              fixedPlans: parseArray<FixedPlan>(realGet(FIXED_KEY)),
              settings,
              cashFlow: 0,
            })
          }
        }

        reportProgress(100, 'Drive 동기화 완료', 'done')
        window.dispatchEvent(new CustomEvent('flow-drive-sync-complete', { detail: pending }))
        if (pending.upsertIds.length || pending.deletedIds.length) {
          window.setTimeout(() => window.dispatchEvent(new Event('pageshow')), 180)
        }
      } catch (error) {
        mergePending(pending)
        reportProgress(0, '동기화 대기 · 자동 재시도', 'error')
        scheduleFlush(2500)
      } finally {
        flushing = false
        const queued = readPending()
        if (queued.upsertIds.length || queued.deletedIds.length || queued.config) scheduleFlush(500)
      }
    }

    const persistTransactionDiff = (previousValue: string | null, nextValue: string) => {
      if (suspended() || explicitTransactionWrite()) return
      const previous = parseRows(previousValue)
      const next = parseRows(nextValue)
      const previousById = new Map(previous.map((row) => [row.id, row]))
      const nextById = new Map(next.map((row) => [row.id, row]))
      const upsertIds = next.filter((row) => {
        const before = previousById.get(row.id)
        return !before || !sameRow(before, row)
      }).map((row) => row.id)
      const deletedIds = previous.filter((row) => !nextById.has(row.id)).map((row) => row.id)
      if (!upsertIds.length && !deletedIds.length) return
      mergePending({ upsertIds, deletedIds })
      reportProgress(12, '기기에 저장됨')
      scheduleFlush()
    }

    const scheduleConfig = () => {
      if (suspended()) return
      if (configTimer !== undefined) window.clearTimeout(configTimer)
      configTimer = window.setTimeout(() => {
        mergePending({ config: true })
        reportProgress(12, '기기에 저장됨')
        scheduleFlush(120)
      }, 700)
    }

    // Local-first: finance values are persisted normally on-device. This
    // observer only builds a durable background Drive sync queue.
    Storage.prototype.getItem = function (key: string) {
      return originalGetItem.call(this, key)
    }

    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage && FINANCE_KEYS.has(key)) {
        const previous = originalGetItem.call(this, key)
        originalSetItem.call(this, key, value)
        if (previous === value) return
        if (key === TRANSACTIONS_KEY) persistTransactionDiff(previous, value)
        else scheduleConfig()
        return
      }
      originalSetItem.call(this, key, value)
    }

    Storage.prototype.removeItem = function (key: string) {
      if (this === window.localStorage && FINANCE_KEYS.has(key)) {
        const previous = originalGetItem.call(this, key)
        originalRemoveItem.call(this, key)
        if (key === TRANSACTIONS_KEY && previous && !suspended() && !explicitTransactionWrite()) {
          mergePending({ deletedIds: parseRows(previous).map((row) => row.id) })
          scheduleFlush()
        } else if (key !== TRANSACTIONS_KEY) {
          scheduleConfig()
        }
        return
      }
      originalRemoveItem.call(this, key)
    }

    const suspendForRemoteLoad = () => { suspendUntil = Date.now() + 1200 }
    const onExplicitTransactionWrite = () => { explicitTransactionWriteUntil = Date.now() + 5000 }
    const onClickCapture = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest('button')
      const text = button?.textContent?.trim() || ''
      if (text === 'Drive에서 불러오기' || text.includes('인증하고 Drive 불러오기')) suspendForRemoteLoad()
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      suspendForRemoteLoad()
      window.setTimeout(() => scheduleFlush(0), 1400)
    }
    const onPageShow = () => {
      suspendForRemoteLoad()
      window.setTimeout(() => scheduleFlush(0), 1400)
    }
    const onOnline = () => scheduleFlush(0)

    document.addEventListener('click', onClickCapture, true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('online', onOnline)
    window.addEventListener('flow-explicit-transaction-write', onExplicitTransactionWrite)

    const retryTimer = window.setInterval(() => {
      if (!suspended() && !explicitTransactionWrite()) scheduleFlush(0)
    }, 15000)
    scheduleFlush(1200)

    return () => {
      if (configTimer !== undefined) window.clearTimeout(configTimer)
      if (flushTimer !== undefined) window.clearTimeout(flushTimer)
      window.clearInterval(retryTimer)
      document.removeEventListener('click', onClickCapture, true)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('flow-explicit-transaction-write', onExplicitTransactionWrite)
      Storage.prototype.getItem = originalGetItem
      Storage.prototype.setItem = originalSetItem
      Storage.prototype.removeItem = originalRemoveItem
    }
  }, [])

  return null
}
