import { FinanceSettings, FixedPlan, Loan, Transaction } from './finance'

export type FinanceSnapshot = { version?: number; updatedAt?: string; transactions: Transaction[]; loans: Loan[]; fixedPlans: FixedPlan[]; settings: FinanceSettings; cashFlow: number }

async function request(endpoint: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, token }) })
  const result = await response.json()
  if (!result.ok) throw new Error(result.error || 'Google Drive 연결에 실패했습니다.')
  return result
}

export async function loadDriveSnapshot(endpoint: string, token: string): Promise<FinanceSnapshot> {
  return (await request(endpoint, token, { action: 'snapshot.get' })).snapshot
}
export async function saveDriveSnapshot(endpoint: string, token: string, snapshot: FinanceSnapshot): Promise<FinanceSnapshot> {
  return (await request(endpoint, token, { action: 'snapshot.save', snapshot })).snapshot
}
