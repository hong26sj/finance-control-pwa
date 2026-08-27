'use client'

import { useEffect, useState } from 'react'
import { CATEGORIES, Transaction, won } from '@/lib/finance'
import { DEFAULT_APPS_SCRIPT_URL, deleteTransactionMerchant, getTransactionMerchant, saveMerchantRule } from '@/lib/drive-api'

type BudgetSelection = {
  category: string
  rows: Transaction[]
}

type DraftRow = {
  category: string
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

function driveAuth() {
  return {
    token: localStorage.getItem('flow-drive-token') || '',
    endpoint: localStorage.getItem('flow-drive-endpoint') || DEFAULT_APPS_SCRIPT_URL,
  }
}

export function BudgetInteractions() {
  const [selection, setSelection] = useState<BudgetSelection | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftRow | null>(null)
  const [merchantDetail, setMerchantDetail] = useState('')
  const [merchantLoading, setMerchantLoading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const openCategory = (category: string) => {
    const cutoff = todayText()
    const month = cutoff.slice(0, 7)
    const rows = readTransactions()
      .filter((row) => row.living && row.category === category && row.date.startsWith(month) && row.date <= cutoff)
      .sort((a, b) => `${b.date}${b.time || ''}`.localeCompare(`${a.date}${a.time || ''}`))
    setEditingId(null)
    setDraft(null)
    setMerchantDetail('')
    setSelection({ category, rows })
  }

  const returnToCategory = (category = selection?.category || '') => {
    sessionStorage.setItem('flow-return-budget', '1')
    sessionStorage.setItem('flow-reopen-budget-category', category)
    window.location.reload()
  }

  const startEditing = async (row: Transaction) => {
    if (editingId === row.id) {
      setEditingId(null)
      setDraft(null)
      setMerchantDetail('')
      return
    }
    setEditingId(row.id)
    setDraft({ category: row.category })
    setMerchantDetail('')
    const { token, endpoint } = driveAuth()
    if (!token) {
      setMerchantDetail('Drive 인증 후 가맹점 정보를 확인할 수 있습니다.')
      return
    }
    setMerchantLoading(true)
    try {
      const merchant = await getTransactionMerchant(endpoint, token, row.id)
      setMerchantDetail(merchant || '저장된 가맹점 정보가 없습니다.')
    } catch {
      setMerchantDetail('가맹점 정보를 불러오지 못했습니다.')
    } finally {
      setMerchantLoading(false)
    }
  }

  const saveRow = async (rowId: string) => {
    if (!draft) return
    const allRows = readTransactions()
    const current = allRows.find((row) => row.id === rowId)
    if (!current) return
    const nextRows = allRows.map((row) => row.id === rowId ? {
      ...row,
      category: draft.category,
      living: draft.category !== '고정비',
      fixed: draft.category === '고정비',
      merchantCategoryAmbiguous: false,
    } : row)
    localStorage.setItem('flow-preview-transactions', JSON.stringify(nextRows))

    const { token, endpoint } = driveAuth()
    if (token && draft.category !== '미분류') {
      try {
        await saveMerchantRule(endpoint, token, {
          transactionId: current.id,
          rawMerchant: current.merchant || merchantDetail || undefined,
          merchantHash: current.merchantHash,
          category: draft.category,
        })
      } catch {
        // Local category edit remains valid even if rule sync is temporarily unavailable.
      }
    }
    returnToCategory(draft.category)
  }

  const confirmAutoCategory = async (row: Transaction) => {
    const { token, endpoint } = driveAuth()
    if (!token) {
      alert('Drive 인증 후 자동분류를 확정할 수 있습니다.')
      return
    }
    setConfirmingId(row.id)
    try {
      await saveMerchantRule(endpoint, token, {
        transactionId: row.id,
        rawMerchant: row.merchant || merchantDetail || undefined,
        merchantHash: row.merchantHash,
        category: row.category,
      })
      const nextRows = readTransactions().map((item) => item.id === row.id ? {
        ...item,
        merchantCategoryAmbiguous: false,
        merchantCategoryConfirmed: true,
      } : item)
      localStorage.setItem('flow-preview-transactions', JSON.stringify(nextRows))
      returnToCategory(row.category)
    } catch {
      alert('분류 확정에 실패했습니다. Drive 연결 상태를 확인해주세요.')
    } finally {
      setConfirmingId(null)
    }
  }

  const deleteRow = (row: Transaction) => {
    if (!confirm(`${row.date.slice(5).replace('-', '.')} · ${won(row.amount)} 거래를 삭제할까요?`)) return
    const nextRows = readTransactions().filter((item) => item.id !== row.id)
    localStorage.setItem('flow-preview-transactions', JSON.stringify(nextRows))
    const { token, endpoint } = driveAuth()
    if (token) void deleteTransactionMerchant(endpoint, token, row.id).catch(() => undefined)
    returnToCategory()
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
        {selection.rows.length === 0 ? <p className="budget-detail-empty">이 카테고리에 포함된 거래가 없습니다.</p> : selection.rows.map((row) => <div className={`budget-detail-item${row.merchantCategoryAmbiguous ? ' budget-detail-item-ambiguous' : ''}${row.merchantCategoryConfirmed ? ' budget-detail-item-confirmed' : ''}`} key={row.id}>
          <button type="button" className="budget-detail-row" onClick={() => void startEditing(row)}>
            <span><b>{row.date.replaceAll('-', '.')}</b><small>{row.card}{row.merchantCategoryAmbiguous && <em>자동분류 확인필요</em>}{row.merchantCategoryConfirmed && <em className="confirmed">분류 확정</em>}</small></span>
            <strong>{won(row.amount)}</strong>
          </button>
          {editingId === row.id && draft && <div className="budget-row-editor">
            <div className="budget-merchant-detail"><span>가맹점</span><b>{merchantLoading ? '불러오는 중…' : merchantDetail}</b></div>
            <label>카테고리
              <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            {row.merchantCategoryAmbiguous && <button type="button" className="budget-confirm-button" disabled={confirmingId === row.id} onClick={() => void confirmAutoCategory(row)}>
              {confirmingId === row.id ? '확정 중…' : `현재 분류(${row.category}) 확정`}
            </button>}
            <div className="budget-row-actions">
              <button type="button" className="budget-delete-button" onClick={() => deleteRow(row)}>삭제</button>
              <button type="button" className="budget-save-button" onClick={() => void saveRow(row.id)}>변경 저장</button>
            </div>
          </div>}
        </div>)}
      </div>
    </section>
  </div>
}
