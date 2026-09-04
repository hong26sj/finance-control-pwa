import { EMPTY_SETTINGS, FinanceSettings, FixedPlan, Loan, MerchantRule, Transaction } from './finance'

export const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwmsy16Y7h9Js_4kY7qCscrQYuvWCm_DUAwOIO3-k9is1xWnOC72SHkWKPK8jOFc7bPDg/exec'

export type DriveTransaction = Pick<Transaction, 'id' | 'date' | 'card' | 'amount' | 'category' | 'living' | 'fixed' | 'performanceIncluded' | 'cashFlow' | 'merchantHash' | 'merchantCategoryAmbiguous'> & {
  merchant?: string
  time?: string
  source?: string
  memo?: string
  cashAdvance?: boolean
}
export type FinanceSnapshot = { version?: number; privacyVersion?: number; updatedAt?: string; transactions: DriveTransaction[]; loans: Loan[]; fixedPlans: FixedPlan[]; settings: FinanceSettings; cashFlow: number }
export type MerchantResolution = { merchant: string; merchantHash: string; rule?: MerchantRule }
export type MerchantVaultItem = { id: string; merchant: string; merchantHash?: string; category?: string }
export type DriveTransactionDetail = { id: string; time?: string; source?: string; memo?: string; cashAdvance?: boolean }

let mutationTail: Promise<void> = Promise.resolve()
let recentSnapshot: { key: string; at: number; value: FinanceSnapshot } | null = null
const SNAPSHOT_CACHE_MS = 5000

function enqueueMutation<T>(task: () => Promise<T>): Promise<T> {
  const run = mutationTail.then(task, task)
  mutationTail = run.then(() => undefined, () => undefined)
  return run
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function isLockConflict(message: string) {
  const value = String(message || '').toLowerCase()
  return value.includes('잠금') || value.includes('lock') || value.includes('시간초과') || value.includes('timeout')
}

function normalizeSettings(value: unknown): FinanceSettings {
  const raw = value && typeof value === 'object' ? value as Partial<FinanceSettings> : {}
  const budgets = raw.categoryBudgets && typeof raw.categoryBudgets === 'object' ? raw.categoryBudgets : {}
  return {
    ...EMPTY_SETTINGS,
    ...raw,
    weeklyBase: Number(raw.weeklyBase || 0),
    livingCap: Number(raw.livingCap || 0),
    monthlyPaceTarget: Number(raw.monthlyPaceTarget || 0),
    salary: Number(raw.salary || 0),
    cardTarget: Number(raw.cardTarget || 0),
    categoryBudgets: { ...EMPTY_SETTINGS.categoryBudgets, ...budgets },
  }
}

function normalizeSnapshot(value: unknown): FinanceSnapshot {
  const raw = value && typeof value === 'object' ? value as Partial<FinanceSnapshot> : {}
  return {
    version: Number(raw.version || 0),
    privacyVersion: Number(raw.privacyVersion || 4),
    updatedAt: String(raw.updatedAt || ''),
    transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
    loans: Array.isArray(raw.loans) ? raw.loans : [],
    fixedPlans: Array.isArray(raw.fixedPlans) ? raw.fixedPlans : [],
    settings: normalizeSettings(raw.settings),
    cashFlow: Number(raw.cashFlow || 0),
  }
}

async function requestNow(endpoint: string, authToken: string, body: Record<string, unknown>) {
  const target = endpoint.trim() || DEFAULT_APPS_SCRIPT_URL
  let lastError: Error | null = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...body, auth_token: authToken }),
        keepalive: true,
      })
      const result = await response.json().catch(() => null)
      if (!result) throw new Error('Apps Script 응답을 확인할 수 없습니다.')
      if (!result.ok) {
        const message = result.error === 'UNAUTHORIZED' ? '인증이 필요합니다.' : (result.message || result.error || 'Google Drive 연결에 실패했습니다.')
        const error = new Error(message)
        if (attempt < 2 && isLockConflict(message)) {
          lastError = error
          await sleep(attempt === 0 ? 250 : 650)
          continue
        }
        throw error
      }
      return result
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error('Google Drive 연결에 실패했습니다.')
      if (attempt < 2 && isLockConflict(normalized.message)) {
        lastError = normalized
        await sleep(attempt === 0 ? 250 : 650)
        continue
      }
      throw normalized
    }
  }
  throw lastError || new Error('Google Drive 연결에 실패했습니다.')
}

function snapshotKey(endpoint: string, authToken: string) {
  return `${endpoint.trim() || DEFAULT_APPS_SCRIPT_URL}|${authToken}`
}

async function fetchSnapshot(endpoint: string, authToken: string): Promise<FinanceSnapshot> {
  const key = snapshotKey(endpoint, authToken)
  const now = Date.now()
  if (recentSnapshot && recentSnapshot.key === key && now - recentSnapshot.at < SNAPSHOT_CACHE_MS) return recentSnapshot.value
  const raw = (await requestNow(endpoint, authToken, { action: 'snapshot.get' })).snapshot
  const snapshot = normalizeSnapshot(raw)
  recentSnapshot = { key, at: now, value: snapshot }
  return snapshot
}

function invalidateSnapshotCache() {
  recentSnapshot = null
}

export const privateTransactionsForDrive = (items: Transaction[]): DriveTransaction[] => items.map((item) => ({
  id: item.id,
  date: item.date,
  time: item.time,
  card: item.card,
  merchant: item.merchant || undefined,
  amount: item.amount,
  category: item.category,
  living: item.living,
  fixed: item.fixed,
  performanceIncluded: item.performanceIncluded,
  cashFlow: item.cashFlow,
  merchantHash: item.merchantHash,
  merchantCategoryAmbiguous: item.merchantCategoryAmbiguous,
  source: item.source,
  memo: item.memo,
  cashAdvance: item.cashAdvance,
}))

export const restoreDriveTransactions = (items: DriveTransaction[], _legacyLocalItems: Transaction[] = []): Transaction[] => (Array.isArray(items) ? items : []).map((item) => ({
  ...item,
  id: String(item?.id || ''),
  date: String(item?.date || ''),
  time: String(item?.time || ''),
  card: String(item?.card || '기타'),
  merchant: String(item?.merchant || ''),
  amount: Number(item?.amount || 0),
  category: String(item?.category || '미분류'),
  living: item?.living !== false,
  fixed: item?.fixed === true,
  performanceIncluded: item?.performanceIncluded !== false,
  cashFlow: item?.cashFlow === true,
  source: String(item?.source || 'Drive'),
  memo: String(item?.memo || ''),
  cashAdvance: item?.cashAdvance === true,
}))

export async function loginDrive(endpoint: string, password: string): Promise<{ authToken: string; expiresAt: string }> {
  const result = await requestNow(endpoint, '', { action: 'login', password })
  return { authToken: result.auth_token, expiresAt: result.expires_at }
}

export async function checkDriveAuth(endpoint: string, authToken: string) {
  await fetchSnapshot(endpoint, authToken)
  return { ok: true }
}

export async function loadDriveSnapshot(endpoint: string, authToken: string): Promise<FinanceSnapshot> {
  return fetchSnapshot(endpoint, authToken)
}

export async function getDriveTransactionDetails(endpoint: string, authToken: string, ids: string[]): Promise<DriveTransactionDetail[]> {
  if (!ids.length) return []
  const result = await requestNow(endpoint, authToken, { action: 'transaction.details.get', ids: ids.slice(0, 200) })
  return Array.isArray(result.items) ? result.items : []
}

export async function patchDriveTransaction(endpoint: string, authToken: string, item: Transaction, options: { writeVault?: boolean; writeDetails?: boolean } = {}) {
  return enqueueMutation(async () => {
    const result = await requestNow(endpoint, authToken, {
      action: 'transaction.patchOne',
      item,
      writeVault: options.writeVault === true,
      writeDetails: options.writeDetails === true,
    })
    invalidateSnapshotCache()
    return result.result as { saved: number; version?: number; updatedAt?: string; writes?: number }
  })
}

export async function upsertDriveTransactions(endpoint: string, authToken: string, items: Transaction[]) {
  if (!items.length) return
  await enqueueMutation(async () => {
    await requestNow(endpoint, authToken, { action: 'transaction.upsertMany', items })
    invalidateSnapshotCache()
  })
}

export async function deleteDriveTransactions(endpoint: string, authToken: string, ids: string[]) {
  if (!ids.length) return
  await enqueueMutation(async () => {
    await requestNow(endpoint, authToken, { action: 'transaction.deleteMany', ids })
    invalidateSnapshotCache()
  })
}

export async function saveDriveConfig(endpoint: string, authToken: string, input: { loans?: Loan[]; fixedPlans?: FixedPlan[]; settings?: FinanceSettings; cashFlow?: number }) {
  await enqueueMutation(async () => {
    await requestNow(endpoint, authToken, { action: 'config.save', ...input })
    invalidateSnapshotCache()
  })
}

export async function saveDriveSnapshot(endpoint: string, authToken: string, snapshot: FinanceSnapshot): Promise<FinanceSnapshot> {
  const rows = restoreDriveTransactions(snapshot.transactions || [])
  await upsertDriveTransactions(endpoint, authToken, rows)
  await saveDriveConfig(endpoint, authToken, { loans: snapshot.loans, fixedPlans: snapshot.fixedPlans, settings: snapshot.settings, cashFlow: snapshot.cashFlow })
  return loadDriveSnapshot(endpoint, authToken)
}

export async function resolveMerchantRules(endpoint: string, authToken: string, merchants: string[]): Promise<MerchantResolution[]> {
  if (!merchants.length) return []
  const result = await requestNow(endpoint, authToken, { action: 'merchant.resolve', merchants })
  return Array.isArray(result.items) ? result.items : []
}

export async function saveMerchantRule(endpoint: string, authToken: string, input: { transactionId: string; rawMerchant?: string; merchantHash?: string; category: string }): Promise<{ merchantHash: string; rule: MerchantRule }> {
  return enqueueMutation(async () => {
    const result = await requestNow(endpoint, authToken, { action: 'merchant.rule.save', ...input })
    invalidateSnapshotCache()
    return { merchantHash: result.merchantHash, rule: result.rule }
  })
}

export async function saveTransactionMerchants(endpoint: string, authToken: string, items: MerchantVaultItem[]) {
  if (!items.length) return
  await enqueueMutation(async () => {
    await requestNow(endpoint, authToken, { action: 'transaction.merchant.saveMany', items })
    invalidateSnapshotCache()
  })
}

export async function getTransactionMerchant(endpoint: string, authToken: string, transactionId: string): Promise<string> {
  const result = await requestNow(endpoint, authToken, { action: 'transaction.merchant.get', transactionId })
  return String(result.merchant || '')
}

export async function deleteTransactionMerchant(endpoint: string, authToken: string, transactionId: string) {
  await enqueueMutation(async () => {
    await requestNow(endpoint, authToken, { action: 'transaction.merchant.delete', transactionId })
    invalidateSnapshotCache()
  })
}
