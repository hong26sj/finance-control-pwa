'use client'

import { useEffect } from 'react'
import { classifyMerchant, normalizeMerchant, Transaction } from '@/lib/finance'

const TRANSACTIONS_KEY = 'flow-preview-transactions'

function normalizeDate(value: string) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return ''
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function normalizeTime(value: string) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return ''
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function normalizeCard(company: string, card: string) {
  const raw = `${company} ${card}`.trim()
  if (/신한/i.test(raw)) return '신한'
  if (/red/i.test(raw)) return '현대 Red'
  if (/네이버/i.test(raw)) return '현대 네이버'
  if (/현대/i.test(raw)) return card.replace(/^현대\s*/i, '').trim() ? `현대 ${card.replace(/^현대\s*/i, '').trim()}` : '현대 Red'
  return card || company || '기타'
}

function readRows(): Transaction[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function ShortcutCardImport() {
  useEffect(() => {
    const prefix = '#cardImport='
    if (!window.location.hash.startsWith(prefix)) return

    try {
      const encoded = window.location.hash.slice(prefix.length)
      const payload = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>
      const merchant = String(payload.merchant || '').trim().replace(/\s*누적[\d,]+원\s*$/i, '').trim()
      const amount = Number(payload.amount || 0)
      const date = normalizeDate(String(payload.date || ''))
      const time = normalizeTime(String(payload.time || ''))
      const company = String(payload.cardCompany || '')
      const card = normalizeCard(company, String(payload.card || ''))

      if (!merchant || !amount || !date || !time) throw new Error('필수 거래정보가 부족합니다.')

      const rows = readRows()
      const duplicate = rows.some((row) =>
        row.date === date &&
        row.time === time &&
        row.card === card &&
        row.amount === amount
      )

      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)

      if (duplicate) {
        window.alert(`이미 등록된 거래입니다.\n${merchant} · ${amount.toLocaleString('ko-KR')}원`)
        return
      }

      const classified = classifyMerchant(merchant)
      const idSeed = `${date}|${time}|${card}|${amount}|${normalizeMerchant(merchant)}`
      const id = `shortcut-${date.replace(/-/g, '')}-${time.replace(':', '')}-${Math.abs([...idSeed].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 0))}`
      const transaction: Transaction = {
        id,
        date,
        time,
        card,
        merchant,
        amount,
        category: classified.category,
        living: classified.living,
        fixed: classified.fixed,
        performanceIncluded: true,
        cashFlow: classified.cashFlow,
        source: 'iOS 카드알림 OCR',
        memo: '',
      }

      localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([...rows, transaction]))
      window.alert(`Flow 등록 완료\n${merchant}\n${amount.toLocaleString('ko-KR')}원 · ${date} ${time}`)
      window.location.reload()
    } catch (error) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      window.alert(error instanceof Error ? `카드 알림 등록 실패\n${error.message}` : '카드 알림 등록에 실패했습니다.')
    }
  }, [])

  return null
}
