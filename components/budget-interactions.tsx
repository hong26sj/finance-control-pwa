'use client'

import { useEffect, useState } from 'react'
import { Transaction, won } from '@/lib/finance'

type BudgetSelection = {
  category: string
  rows: Transaction[]
}

const todayText = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function readTransactions() {
  try {
    return JSON.parse(localStorage.getItem('flow-preview-transactions') || '[]') as Transaction[]
  } catch {
    return []
  }
}

function rowsForCategory(category: string) {
  const cutoff = todayText()
  const month = cutoff.slice(0, 7)
  return readTransactions()
    .filter((row) => row.living && row.category === category && row.date.startsWith(month) && row.date <= cutoff)
    .sort((a, b) => `${b.date}${b.time || ''}`.localeCompare(`${a.date}${a.time || ''}`))
}

export function BudgetInteractions() {
  const [selection, setSelection] = useState<BudgetSelection | null>(null)

  const openCategory = (category: string) => {
    setSelection({ category, rows: rowsForCategory(category) })
  }

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('.bottom-nav button, .sidebar nav button')) {
        window.setTimeout(() => window.scrollTo(0, 0), 0)
      }
      const categoryRow = target.closest('.budget-list > div') as HTMLElement | null
      if (!categoryRow || target.closest('.budget-detail-overlay')) return
      const category = categoryRow.querySelector(':scope > span')?.textContent?.trim()
      if (category) openCategory(category)
    }

    const refresh = () => {
      setSelection((value) => value ? { ...value, rows: rowsForCategory(value.category) } : value)
    }

    document.addEventListener('click', handleClick)
    window.addEventListener('flow-transactions-changed', refresh)
    return () => {
      document.removeEventListener('click', handleClick)
      window.removeEventListener('flow-transactions-changed', refresh)
    }
  }, [])

  if (!selection) return null

  return <div className="budget-detail-overlay" role="presentation" onMouseDown={() => setSelection(null)}>
    <section className="budget-detail-sheet" role="dialog" aria-modal="true" aria-label={`${selection.category} 거래 내역`} onMouseDown={(event) => event.stopPropagation()}>
      <header className="budget-detail-head">
        <div><span>카테고리 내역</span><h2>{selection.category}</h2><p>{selection.rows.length}건 · {won(selection.rows.reduce((sum, row) => sum + row.amount, 0))}</p></div>
        <button type="button" onClick={() => setSelection(null)} aria-label="닫기">×</button>
      </header>
      <div className="budget-detail-list">
        {selection.rows.length === 0 ? <p className="budget-detail-empty">이 카테고리에 포함된 거래가 없습니다.</p> : selection.rows.map((row) => <div className={`budget-detail-item${row.merchantCategoryAmbiguous ? ' budget-detail-item-ambiguous' : ''}${row.merchantCategoryConfirmed ? ' budget-detail-item-confirmed' : ''}`} key={row.id}>
          <button type="button" className="budget-detail-row" data-transaction-id={row.id}>
            <span><b>{row.date.replaceAll('-', '.')}</b><small>{row.merchant || row.card} · {row.card}{row.time ? ` · ${row.time}` : ''}</small></span>
            <span className="budget-detail-status">{row.fixed ? '고정비' : '생활비'} · {row.performanceIncluded ? '실적 포함' : '실적 제외'}</span>
            <strong>{won(row.amount)}</strong>
          </button>
        </div>)}
      </div>
    </section>
  </div>
}
