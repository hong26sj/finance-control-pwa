'use client'

import { useEffect } from 'react'
import type { Transaction } from '@/lib/finance'

const TRANSACTIONS_KEY = 'flow-preview-transactions'

function readRows(): Transaction[] {
  try {
    const rows = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]') as Transaction[]
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function syncIndicators() {
  const page = document.querySelector('.money-calendar-page')
  if (!page) return

  const title = page.querySelector('.calendar-toolbar h2')?.textContent || ''
  const match = title.match(/(\d{4})년\s*(\d{1,2})월/)
  if (!match) return

  const year = Number(match[1])
  const month = Number(match[2])
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  const unclassifiedDates = new Set(
    readRows()
      .filter((row) => row.category === '미분류' && row.date.startsWith(prefix))
      .map((row) => row.date),
  )

  page.querySelectorAll<HTMLElement>('.calendar-cell').forEach((cell) => {
    cell.classList.remove('has-unclassified')
    if (cell.classList.contains('empty')) return
    const dayText = cell.querySelector('.calendar-day-number')?.textContent?.trim() || ''
    const day = Number(dayText)
    if (!day) return
    const key = `${prefix}${String(day).padStart(2, '0')}`
    if (unclassifiedDates.has(key)) cell.classList.add('has-unclassified')
  })
}

export function CalendarUnclassifiedIndicator() {
  useEffect(() => {
    let timer = 0
    const schedule = (delay = 0) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(syncIndicators, delay)
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-money-calendar-tab],.calendar-arrow,.calendar-today,.calendar-filters select,.calendar-cell')) {
        schedule(40)
      }
    }
    const onChanged = () => schedule(40)
    const onPageShow = () => schedule(80)

    document.addEventListener('click', onClick)
    window.addEventListener('flow-transactions-changed', onChanged)
    window.addEventListener('pageshow', onPageShow)
    schedule(120)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('click', onClick)
      window.removeEventListener('flow-transactions-changed', onChanged)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  return null
}
