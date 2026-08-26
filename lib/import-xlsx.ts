import { readSheet } from 'read-excel-file/browser'
import { classifyMerchant, Transaction } from './finance'

type Cell = string | number | boolean | Date | null
const dateText = (value: Cell) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').slice(0, 10).replaceAll('.', '-')
const timeText = (value: Cell) => {
  if (value instanceof Date) return value.toTimeString().slice(0, 5)
  if (typeof value === 'number') { const mins = Math.round(value * 1440); return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` }
  return String(value ?? '12:00').slice(0, 5)
}
const make = (base: Omit<Transaction, 'category' | 'living' | 'fixed' | 'cashFlow' | 'performanceIncluded' | 'memo'>, cashAdvance = false): Transaction => ({ ...base, ...classifyMerchant(base.merchant, cashAdvance), cashAdvance, performanceIncluded: true, memo: cashAdvance ? '현금서비스 · 생활비 반영' : '' })

export async function parseCardWorkbook(file: File): Promise<Transaction[]> {
  const rows = await readSheet(file) as unknown as Cell[][]
  const isHyundai = rows.some((row) => row.includes('승인일') && row.includes('가맹점명'))
  if (isHyundai) return rows.filter((row) => row[0] instanceof Date && !(row[10] === '취소' || row[9] instanceof Date)).map((row, index) => {
    const merchant = String(row[4] ?? '').trim(), cashAdvance = row[6] === '이체'
    return make({ id: `import-${Date.now()}-${index}`, date: dateText(row[0]), time: timeText(row[1]), card: String(row[3]).includes('362') ? '현대 Red' : '현대 네이버', merchant, amount: Number(row[5]), source: file.name }, cashAdvance)
  }).filter((row) => row.merchant && row.amount > 0)
  const shinhan = rows.filter((row) => /^20\d{2}[.-]/.test(String(row[0] ?? '')))
  if (shinhan.length) return shinhan.map((row, index) => {
    const raw = String(row[0] ?? '')
    return make({ id: `import-${Date.now()}-${index}`, date: raw.slice(0, 10).replaceAll('.', '-'), time: raw.slice(11, 16) || '12:00', card: '신한', merchant: String(row[3] ?? '').trim(), amount: Number(row[6]), source: file.name })
  }).filter((row) => row.merchant && row.amount > 0)
  throw new Error('지원되는 현대카드 또는 신한카드 내역 형식을 찾지 못했습니다.')
}
