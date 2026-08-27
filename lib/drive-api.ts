import { FinanceSettings, FixedPlan, Loan, MerchantRule, Transaction } from './finance'

export const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwmsy16Y7h9Js_4kY7qCscrQYuvWCm_DUAwOIO3-k9is1xWnOC72SHkWKPK8jOFc7bPDg/exec'

export type DriveTransaction = Pick<Transaction, 'id' | 'date' | 'card' | 'amount' | 'category' | 'living' | 'fixed' | 'performanceIncluded' | 'cashFlow' | 'merchantHash' | 'merchantCategoryAmbiguous'> & { merchant?: string }
export type FinanceSnapshot = { version?: number; privacyVersion?: number; updatedAt?: string; transactions: DriveTransaction[]; loans: Loan[]; fixedPlans: FixedPlan[]; settings: FinanceSettings; cashFlow: number }
export type MerchantResolution = { merchant: string; merchantHash: string; rule?: MerchantRule }
export type MerchantVaultItem = { id: string; merchant: string; merchantHash?: string; category?: string }

async function request(endpoint: string, authToken: string, body: Record<string, unknown>) {
  const target = endpoint.trim() || DEFAULT_APPS_SCRIPT_URL
  const response = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, auth_token: authToken }) })
  const result = await response.json().catch(() => null)
  if (!result) throw new Error('Apps Script 응답을 확인할 수 없습니다.')
  if (!result.ok) throw new Error(result.error === 'UNAUTHORIZED' ? '인증이 필요합니다.' : (result.message || result.error || 'Google Drive 연결에 실패했습니다.'))
  return result
}

export const privateTransactionsForDrive = (items: Transaction[]): DriveTransaction[] => items.map((item) => ({
  id: item.id,
  date: item.date,
  card: item.card,
  amount: item.amount,
  category: item.category,
  living: item.living,
  fixed: item.fixed,
  performanceIncluded: item.performanceIncluded,
  cashFlow: item.cashFlow,
  merchantHash: item.merchantHash,
  merchantCategoryAmbiguous: item.merchantCategoryAmbiguous,
  merchant: item.merchant || undefined,
}))

export const restoreDriveTransactions = (items: DriveTransaction[], localItems: Transaction[] = []): Transaction[] => {
  const localById = new Map(localItems.map((item) => [item.id, item]))
  return items.map((item) => {
    const local = localById.get(item.id)
    return {
      ...item,
      time: local?.time || '',
      merchant: item.merchant || local?.merchant || '',
      source: local?.source || 'Drive 요약',
      memo: local?.memo || '',
      cashAdvance: local?.cashAdvance,
    }
  })
}

export async function loginDrive(endpoint: string, password: string): Promise<{ authToken: string; expiresAt: string }> {
  const result = await request(endpoint, '', { action: 'login', password })
  return { authToken: result.auth_token, expiresAt: result.expires_at }
}

export async function checkDriveAuth(endpoint: string, authToken: string) {
  return request(endpoint, authToken, { action: 'auth.check' })
}

export async function loadDriveSnapshot(endpoint: string, authToken: string): Promise<FinanceSnapshot> {
  return (await request(endpoint, authToken, { action: 'snapshot.get' })).snapshot
}

export async function saveDriveSnapshot(endpoint: string, authToken: string, snapshot: FinanceSnapshot): Promise<FinanceSnapshot> {
  return (await request(endpoint, authToken, { action: 'snapshot.save', snapshot })).snapshot
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
