'use client'

import { useEffect, useState } from 'react'
import { CATEGORIES, Transaction, won } from '@/lib/finance'

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

export function BudgetInteractions() {
  const [selection, setSelection] = useState<BudgetSelection | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const openCategory = (category: string) => {
    const cutoff = todayText()
    const month = cutoff.slice(0, 7)
    const rows = readTransactions()
      .filter((row) => row.living && row.category === category && row.date.startsWith(month) && row.date <= cutoff)
      .sort((a, b) => `${b.date}${b.time || ''}`.localeCompare(`${a.date}${a.time || ''}`))
    setEditingId(null)
    setSelection({ category, rows })
  }

  const changeCategory = (rowId: string, category: string) => {
    const allRows = readTransactions()
    const nextRows = allRows.map((row) => row.id === rowId ? { ...row, category } : row)
    localStorage.setItem('flow-preview-transactions', JSON.stringify(nextRows))
    sessionStorage.setItem('flow-return-budget', '1')
    sessionStorage.setItem('flow-reopen-budget-category', selection?.category || '')
    window.location.reload()
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

    document.addEventListener('click', handleClick)

    if (sessionStorage.getItem('flow-return-budget') === '1') {
      sessionStorage.removeItem('flow-return-budget')
      const reopenCategory = sessionStorage.getItem('flow-reopen-budget-category') || ''
      sessionStorage.removeItem('flow-reopen-budget-category')
      let attempts = 0
      const restore = window.setInterval(() => {
        attempts += 1
        const budgetButton = Array.from(document.querySelectorAll('.bottom-nav button')).find((button) => button.textContent?.includes('예산')) as HTMLButtonElement | undefined
        if (budgetButton) {
          budgetButton.click()
          window.scrollTo(0, 0)
          window.clearInterval(restore)
          if (reopenCategory) window.setTimeout(() => openCategory(reopenCategory), 100)
        } else if (attempts > 20) {
          window.clearInterval(restore)
        }
      }, 100)
      return () => {
        document.removeEventListener('click', handleClick)
        window.clearInterval(restore)
      }
    }

    return () => document.removeEventListener('click', handleClick)
  }, [])

  if (!selection) return null

  return <div className="budget-detail-overlay" role="presentation" onMouseDown={() => setSelection(null)}>
    <section className="budget-detail-sheet" role="dialog" aria-modal="true" aria-label={`${selection.category} 거래 내역`} onMouseDown={(event) => event.stopPropagation()}>
      <header className="budget-detail-head">
        <div><span>카테고리 내역</span><h2>{selection.category}</h2><p>{selection.rows.length}건 · {won(selection.rows.reduce((sum, row) => sum + row.amount, 0))}</p></div>
        <button type="button" onClick={() => setSelection(null)} aria-label="닫기">×</button>
      </header>
      <div className="budget-detail-list">
        {selection.rows.length === 0 ? <p className="budget-detail-empty">이 카테고리에 포함된 거래가 없습니다.</p> : selection.rows.map((row) => <div className="budget-detail-item" key={row.id}>
          <button type="button" className="budget-detail-row" onClick={() => setEditingId(editingId === row.id ? null : row.id)}>
            <span><b>{row.merchant || '가맹점 정보 없음'}</b><small>{row.date.slice(5).replace('-', '.')} · {row.card}</small></span>
            <strong>{won(row.amount)}</strong>
          </button>
          {editingId === row.id && <label className="budget-category-editor">카테고리 변경
            <select value={row.category} onChange={(event) => changeCategory(row.id, event.target.value)}>
              {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>}
        </div>)}
      </div>
    </section>
  </div>
}
