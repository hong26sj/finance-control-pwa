'use client'

import { readSheet } from 'read-excel-file/browser'
import { Transaction } from './finance'
import { DEFAULT_APPS_SCRIPT_URL, resolveMerchantRules, saveTransactionMerchants } from './drive-api'

type Cell = string | number | boolean | Date | null
const dateText = (value: Cell) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').slice(0, 10).replaceAll('.', '-')
const timeText = (value: Cell) => {
  if (value instanceof Date) return value.toTimeString().slice(0, 5)
  if (typeof value === 'number') { const mins = Math.round(value * 1440); return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` }
  return String(value ?? '12:00').slice(0, 5)
}

const make = (base: Omit<Transaction, 'category' | 'living' | 'fixed' | 'cashFlow' | 'performanceIncluded' | 'memo'>, cashAdvance = false): Transaction => ({
  ...base,
  category: cashAdvance ? '생활용품·잡비' : '미분류',
  living: true,
  fixed: false,
  cashFlow: cashAdvance,
  cashAdvance,
  performanceIncluded: true,
  memo: cashAdvance ? '현금서비스 · 생활비 반영' : '',
})

function applyCategory(row: Transaction, category: string) {
  return {
    ...row,
    category,
    living: category !== '고정비',
    fixed: category === '고정비',
  }
}

async function applyLearnedMerchantRules(rows: Transaction[]): Promise<Transaction[]> {
  if (typeof window === 'undefined' || !rows.length) return rows
  const token = localStorage.getItem('flow-drive-token') || ''
  if (!token) return rows
  const endpoint = localStorage.getItem('flow-drive-endpoint') || DEFAULT_APPS_SCRIPT_URL
  try {
    const resolutions = await resolveMerchantRules(endpoint, token, rows.map((row) => row.merchant))
    const resolvedRows = rows.map((row, index) => {
      if (row.cashAdvance) return { ...row, merchant: '현금서비스' }
      const resolved = resolutions[index]
      if (!resolved?.merchantHash) return row
      if (!resolved.rule?.category) return { ...row, merchantHash: resolved.merchantHash }
      return applyCategory({
        ...row,
        merchantHash: resolved.merchantHash,
        merchantCategoryAmbiguous: resolved.rule.ambiguous === true,
      }, resolved.rule.category)
    })
    await saveTransactionMerchants(endpoint, token, resolvedRows.map((row) => ({ id: row.id, merchant: row.merchant, merchantHash: row.merchantHash, category: row.category })))
    return resolvedRows
  } catch {
    return rows
  }
}

export async function parseCardWorkbook(file: File): Promise<Transaction[]> {
  const rows = await readSheet(file) as unknown as Cell[][]
  const isHyundai = rows.some((row) => row.includes('승인일') && row.includes('가맹점명'))
  let parsed: Transaction[] = []
  if (isHyundai) parsed = rows.filter((row) => row[0] instanceof Date && !(row[10] === '취소' || row[9] instanceof Date)).map((row, index) => {
    const merchant = String(row[4] ?? '').trim(), cashAdvance = row[6] === '이체'
    return make({ id: `import-${Date.now()}-${index}`, date: dateText(row[0]), time: timeText(row[1]), card: String(row[3]).includes('362') ? '현대 Red' : '현대 네이버', merchant, amount: Number(row[5]), source: file.name }, cashAdvance)
  }).filter((row) => row.merchant && row.amount > 0)
  else {
    const shinhan = rows.filter((row) => /^20\d{2}[.-]/.test(String(row[0] ?? '')))
    if (shinhan.length) parsed = shinhan.map((row, index) => {
      const raw = String(row[0] ?? '')
      return make({ id: `import-${Date.now()}-${index}`, date: raw.slice(0, 10).replaceAll('.', '-'), time: raw.slice(11, 16) || '12:00', card: '신한', merchant: String(row[3] ?? '').trim(), amount: Number(row[6]), source: file.name })
    }).filter((row) => row.merchant && row.amount > 0)
  }
  if (!parsed.length) throw new Error('지원되는 현대카드 또는 신한카드 내역 형식을 찾지 못했습니다.')
  return applyLearnedMerchantRules(parsed)
}
