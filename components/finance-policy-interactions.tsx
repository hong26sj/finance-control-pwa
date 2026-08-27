'use client'

import { useEffect } from 'react'
import { Transaction } from '@/lib/finance'

const TRANSACTIONS_KEY = 'flow-preview-transactions'
const SETTINGS_KEY = 'flow-preview-settings'
const CATEGORY_COLORS = ['#f1a64a', '#719b82', '#dc7c61', '#6592aa', '#9882ad', '#c7677a', '#89948e']
const CATEGORY_ORDER = ['평일 점심', '식비·장보기', '커피·간식', '교통·주차', '생활용품·잡비', '외식·여가·개인', '생활비 예비금']

const normalize = (value: string) => value.toLowerCase().replace(/\s|[-_()·]/g, '')

function readRows(): Transaction[] {
  try {
    const rows = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]') as Transaction[]
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function readSettings(): { livingCap?: number; cardTarget?: number } {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } catch { return {} }
}

function setNativeChecked(input: HTMLInputElement, checked: boolean) {
  if (input.checked === checked) return
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set
  setter?.call(input, checked)
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function enforceCategoryFlags() {
  const modal = document.querySelector<HTMLElement>('.modal')
  if (!modal) return
  const categorySelect = [...modal.querySelectorAll<HTMLSelectElement>('select')].find((select) => [...select.options].some((option) => option.value === '고정비'))
  if (!categorySelect) return
  const checkboxLabels = [...modal.querySelectorAll<HTMLLabelElement>('.checks label')]
  const living = checkboxLabels.find((label) => label.textContent?.includes('생활비 포함'))?.querySelector<HTMLInputElement>('input[type="checkbox"]')
  const fixed = checkboxLabels.find((label) => label.textContent?.trim() === '고정비')?.querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (!living || !fixed) return

  const isFixed = categorySelect.value === '고정비'
  setNativeChecked(fixed, isFixed)
  setNativeChecked(living, !isFixed)
  living.disabled = true
  fixed.disabled = true
  living.closest('label')?.classList.add('policy-managed-check')
  fixed.closest('label')?.classList.add('policy-managed-check')

  let note = modal.querySelector<HTMLElement>('.category-policy-note')
  if (!note) {
    note = document.createElement('small')
    note.className = 'category-policy-note'
    categorySelect.closest('label')?.appendChild(note)
  }
  note.textContent = isFixed ? '고정비로 분류되어 생활비에서는 제외됩니다.' : '생활비 카테고리로 분류되어 고정비에서는 제외됩니다.'
}

function syncCardRemaining(rows: Transaction[]) {
  const settings = readSettings()
  document.querySelectorAll<HTMLElement>('.pay-card').forEach((card) => {
    const name = card.querySelector('span')?.textContent?.trim() || ''
    if (!name) return
    const target = name.includes('Red') ? 0 : Number(settings.cardTarget || 0)
    const spent = rows.filter((row) => row.card === name && row.performanceIncluded).reduce((sum, row) => sum + Number(row.amount || 0), 0)
    let remaining = card.querySelector<HTMLElement>('.card-remaining')
    if (!remaining) {
      remaining = document.createElement('strong')
      remaining.className = 'card-remaining'
      const progress = card.querySelector('.progress')
      card.insertBefore(remaining, progress || null)
    }
    if (target <= 0) {
      remaining.textContent = '실적 목표 없음'
      remaining.classList.add('no-target')
    } else {
      const gap = target - spent
      remaining.textContent = gap > 0 ? `실적까지 ${gap.toLocaleString('ko-KR')}원 남음` : `목표 ${Math.abs(gap).toLocaleString('ko-KR')}원 초과`
      remaining.classList.toggle('achieved', gap <= 0)
      remaining.classList.remove('no-target')
    }
  })
}

function merchantMatchesPlan(planName: string, merchant: string) {
  const p = normalize(planName)
  const m = normalize(merchant)
  if (!p || !m) return false
  if (m.includes(p) || p.includes(m)) return true
  if (/(가스|도시가스)/.test(p) && /(가스|귀뚜라미에너지|예스코|서울도시가스|코원에너지)/.test(m)) return true
  if (/관리비/.test(p) && /(아파트관리비|관리비)/.test(m)) return true
  if (/(통신|휴대폰|핸드폰)/.test(p) && /(kt|skt|sk텔레콤|lg유플러스|통신요금)/.test(m)) return true
  if (/보험/.test(p) && /보험/.test(m)) return true
  if (/수도/.test(p) && /(수도|상하수도)/.test(m)) return true
  if (/전기/.test(p) && /(한전|한국전력|전기요금)/.test(m)) return true
  if (/청약/.test(p) && /청약/.test(m)) return true
  if (/연금/.test(p) && /연금/.test(m)) return true
  return false
}

function syncFixedActuals(rows: Transaction[]) {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const fixedRows = rows.filter((row) => row.fixed && row.date.startsWith(month))

  document.querySelectorAll<HTMLElement>('.fixed-detail-table').forEach((table) => {
    ;[...table.children].slice(1).forEach((node) => {
      const row = node as HTMLElement
      const cells = row.querySelectorAll<HTMLElement>('span')
      const inputs = row.querySelectorAll<HTMLInputElement>('input')
      if (cells.length < 2 || inputs.length < 2) return
      const name = cells[0].querySelector('b')?.textContent?.trim() || cells[0].textContent?.trim() || ''
      const planned = Number(String(inputs[0].value).replace(/,/g, '')) || 0
      const matches = fixedRows.filter((tx) => merchantMatchesPlan(name, tx.merchant || ''))
      const hasMatch = matches.length > 0
      const isVariable = Boolean(cells[0].querySelector('small'))
      if (!hasMatch && !isVariable) return
      const actual = hasMatch ? matches.reduce((sum, tx) => sum + Number(tx.amount || 0), 0) : planned
      const actualInput = inputs[1]
      const current = Number(String(actualInput.value).replace(/,/g, '')) || 0
      if (current === actual) return
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(actualInput, String(actual))
      actualInput.dispatchEvent(new Event('input', { bubbles: true }))
      actualInput.dispatchEvent(new Event('change', { bubbles: true }))
      row.classList.toggle('transaction-synced-fixed', hasMatch)
    })
  })
}

function syncBudgetRing(rows: Transaction[]) {
  const ring = document.querySelector<HTMLElement>('.budget-summary .ring')
  if (!ring) return
  const settings = readSettings()
  const cap = Number(settings.livingCap || 0)
  if (cap <= 0) {
    ring.style.background = 'conic-gradient(#e9ece8 0deg 360deg)'
    return
  }
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  let cursor = 0
  const segments: string[] = []
  CATEGORY_ORDER.forEach((category, index) => {
    const amount = rows.filter((row) => row.living && row.category === category && row.date.startsWith(month)).reduce((sum, row) => sum + Number(row.amount || 0), 0)
    if (amount <= 0 || cursor >= 360) return
    const degrees = Math.min(360 - cursor, amount / cap * 360)
    if (degrees <= 0) return
    segments.push(`${CATEGORY_COLORS[index]} ${cursor}deg ${cursor + degrees}deg`)
    cursor += degrees
  })
  if (cursor < 360) segments.push(`#e9ece8 ${cursor}deg 360deg`)
  ring.style.background = `conic-gradient(${segments.join(',')})`
}

export function FinancePolicyInteractions() {
  useEffect(() => {
    const sync = () => {
      const rows = readRows()
      enforceCategoryFlags()
      syncCardRemaining(rows)
      syncFixedActuals(rows)
      syncBudgetRing(rows)
    }

    const onChange = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.modal select')) window.setTimeout(enforceCategoryFlags, 0)
    }

    document.addEventListener('change', onChange)
    const timer = window.setInterval(sync, 450)
    sync()
    return () => {
      document.removeEventListener('change', onChange)
      window.clearInterval(timer)
    }
  }, [])
  return null
}
