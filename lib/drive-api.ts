import { FinanceSettings, FixedPlan, Loan, MerchantRule, Transaction } from './finance'

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

type TransactionDetail = { id: string; time?: string; source?: string; memo?: string; cashAdvance?: boolean }

async function request(endpoint: string, authToken: string, body: Record<string, unknown>) {
  const target = endpoint.trim() || DEFAULT_APPS_SCRIPT_URL
  const response = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, auth_token: authToken }),
    keepalive: true,
  })
  const result = await response.json().catch(() => null)
  if (!result) throw new Error('Apps Script 응답을 확인할 수 없습니다.')
  if (!result.ok) throw new Error(result.error === 'UNAUTHORIZED' ? '인증이 필요합니다.' : (result.message || result.error || 'Google Drive 연결에 실패했습니다.'))
  return result
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

export const restoreDriveTransactions = (items: DriveTransaction[], _legacyLocalItems: Transaction[] = []): Transaction[] => items.map((item) => ({
  ...item,
  time: item.time || '',
  merchant: item.merchant || '',
  source: item.source || 'Drive',
  memo: item.memo || '',
  cashAdvance: item.cashAdvance,
}))

export async function loginDrive(endpoint: string, password: string): Promise<{ authToken: string; expiresAt: string }> {
  const result = await request(endpoint, '', { action: 'login', password })
  return { authToken: result.auth_token, expiresAt: result.expires_at }
}

export async function checkDriveAuth(endpoint: string, authToken: string) {
  return request(endpoint, authToken, { action: 'auth.check' })
}

export async function loadDriveSnapshot(endpoint: string, authToken: string): Promise<FinanceSnapshot> {
  const snapshot = (await request(endpoint, authToken, { action: 'snapshot.get' })).snapshot as FinanceSnapshot
  const ids = Array.isArray(snapshot?.transactions) ? snapshot.transactions.map((item) => item.id).filter(Boolean) : []
  if (!ids.length) return snapshot
  const detailResult = await request(endpoint, authToken, { action: 'transaction.details.get', ids })
  const details = (Array.isArray(detailResult.items) ? detailResult.items : []) as TransactionDetail[]
  const byId = new Map(details.map((item) => [item.id, item]))
  snapshot.transactions = snapshot.transactions.map((item) => ({ ...item, ...(byId.get(item.id) || {}) }))
  return snapshot
}

export async function upsertDriveTransactions(endpoint: string, authToken: string, items: Transaction[]) {
  if (!items.length) return
  await request(endpoint, authToken, { action: 'transaction.upsertMany', items })
}

export async function deleteDriveTransactions(endpoint: string, authToken: string, ids: string[]) {
  if (!ids.length) return
  await request(endpoint, authToken, { action: 'transaction.deleteMany', ids })
}

export async function saveDriveConfig(endpoint: string, authToken: string, input: { loans?: Loan[]; fixedPlans?: FixedPlan[]; settings?: FinanceSettings; cashFlow?: number }) {
  await request(endpoint, authToken, { action: 'config.save', ...input })
}

export async function saveDriveSnapshot(endpoint: string, authToken: string, snapshot: FinanceSnapshot): Promise<FinanceSnapshot> {
  const rows = restoreDriveTransactions(snapshot.transactions || [])
  await Promise.all([
    upsertDriveTransactions(endpoint, authToken, rows),
    saveDriveConfig(endpoint, authToken, { loans: snapshot.loans, fixedPlans: snapshot.fixedPlans, settings: snapshot.settings, cashFlow: snapshot.cashFlow }),
  ])
  return loadDriveSnapshot(endpoint, authToken)
}

export async function resolveMerchantRules(endpoint: string, authToken: string, merchants: string[]): Promise<MerchantResolution[]> {
  if (!merchants.length) return []
  const result = await request(endpoint, authToken, { action: 'merchant.resolve', merchants })
  return Array.isArray(result.items) ? result.items : []
}

export async function saveMerchantRule(endpoint: string, authToken: string, input: { transactionId: string; rawMerchant?: string; merchantHash?: string; category: string }): Promise<{ merchantHash: string; rule: MerchantRule }> {
  const result = await request(endpoint, authToken, { action: 'merchant.rule.save', ...input })
  return { merchantHash: result.merchantHash, rule: result.rule }
}

export async function saveTransactionMerchants(endpoint: string, authToken: string, items: MerchantVaultItem[]) {
  if (!items.length) return
  await request(endpoint, authToken, { action: 'transaction.merchant.saveMany', items })
}

export async function getTransactionMerchant(endpoint: string, authToken: string, transactionId: string): Promise<string> {
  const result = await request(endpoint, authToken, { action: 'transaction.merchant.get', transactionId })
  return String(result.merchant || '')
}

export async function deleteTransactionMerchant(endpoint: string, authToken: string, transactionId: string) {
  await request(endpoint, authToken, { action: 'transaction.merchant.delete', transactionId })
}
