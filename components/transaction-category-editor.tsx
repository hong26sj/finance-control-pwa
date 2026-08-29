'use client'

import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, Transaction, won } from '@/lib/finance'
import { DEFAULT_APPS_SCRIPT_URL, deleteDriveTransactions, deleteTransactionMerchant, saveMerchantRule, upsertDriveTransactions } from '@/lib/drive-api'

const TRANSACTIONS_KEY = 'flow-preview-transactions'

type EditorState = { row: Transaction; sourceElement: HTMLElement | null }
type Kind = 'living' | 'fixed'

function readRows(): Transaction[] {
  try {
    const rows = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]') as Transaction[]
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function amountFromText(value: string) {
  return Number(String(value || '').replace(/[^0-9]/g, '')) || 0
}

function resolveCalendarRow(target: HTMLElement, rows: Transaction[]) {
  const item = target.closest<HTMLElement>('.calendar-day-list > div')
  if (!item) return null
  const id = item.dataset.transactionId
  if (id) return rows.find((row) => row.id === id) || null
  const amount = amountFromText(item.querySelector('strong')?.textContent || '')
  return rows.find((row) => row.amount === amount) || null
}

function resolveCardRow(target: HTMLElement, rows: Transaction[]) {
  const item = target.closest<HTMLElement>('.card-detail-row')
  if (!item) return null
  const id = item.dataset.transactionId
  return id ? rows.find((row) => row.id === id) || null : null
}

function resolveBudgetRow(target: HTMLElement, rows: Transaction[]) {
  const item = target.closest<HTMLElement>('.budget-detail-row')
  if (!item) return null
  const id = item.dataset.transactionId
  return id ? rows.find((row) => row.id === id) || null : null
}

export function TransactionCategoryEditor() {
  const [editing, setEditing] = useState<EditorState | null>(null)
  const [draft, setDraft] = useState<Transaction | null>(null)
  const [kind, setKind] = useState<Kind>('living')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const row = editing?.row || null
  const title = useMemo(() => draft ? `${draft.merchant || '가맹점 정보 없음'} · ${won(draft.amount)}` : '', [draft])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || target.closest('.transaction-category-editor')) return
      if (!target.closest('.calendar-day-list > div,.card-detail-row,.budget-detail-row')) return
      const rows = readRows()
      const resolved = resolveCalendarRow(target, rows) || resolveCardRow(target, rows) || resolveBudgetRow(target, rows)
      if (!resolved) return
      setEditing({ row: resolved, sourceElement: target.closest<HTMLElement>('.calendar-day-list > div,.card-detail-row,.budget-detail-row') })
      setDraft({ ...resolved })
      setKind(resolved.fixed ? 'fixed' : 'living')
      setError('')
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const close = () => {
    if (saving || deleting) return
    setEditing(null)
    setDraft(null)
    setError('')
  }

  const save = async () => {
    if (!row || !draft) return
    if (!draft.merchant.trim()) { setError('가맹점명을 입력하세요.'); return }
    if (!draft.amount || draft.amount <= 0) { setError('금액을 확인하세요.'); return }
    const token = localStorage.getItem('flow-drive-token') || ''
    const endpoint = localStorage.getItem('flow-drive-endpoint') || DEFAULT_APPS_SCRIPT_URL
    if (!token) { setError('Drive 인증이 필요합니다.'); return }

    const next: Transaction = {
      ...draft,
      id: row.id,
      living: kind === 'living',
      fixed: kind === 'fixed',
      merchantCategoryAmbiguous: false,
    }

    setSaving(true)
    setError('')
    try {
      await upsertDriveTransactions(endpoint, token, [next])
      if (next.category !== '미분류') {
        await saveMerchantRule(endpoint, token, {
          transactionId: next.id,
          rawMerchant: next.merchant || undefined,
          merchantHash: next.merchantHash,
          category: next.category,
        }).catch(() => undefined)
      }
      const nextRows = readRows().map((item) => item.id === next.id ? next : item)
      localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(nextRows))
      window.dispatchEvent(new CustomEvent('flow-transactions-changed', { detail: { id: next.id, row: next } }))
      setEditing(null)
      setDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '변경 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const deleteRow = async () => {
    if (!row || !draft) return
    if (!confirm(`${draft.date.slice(5).replace('-', '.')} · ${won(draft.amount)} 거래를 삭제할까요?`)) return
    const token = localStorage.getItem('flow-drive-token') || ''
    const endpoint = localStorage.getItem('flow-drive-endpoint') || DEFAULT_APPS_SCRIPT_URL
    if (!token) { setError('Drive 인증이 필요합니다.'); return }
    setDeleting(true)
    setError('')
    try {
      await deleteDriveTransactions(endpoint, token, [row.id])
      await deleteTransactionMerchant(endpoint, token, row.id).catch(() => undefined)
      localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(readRows().filter((item) => item.id !== row.id)))
      window.dispatchEvent(new CustomEvent('flow-transactions-changed', { detail: { id: row.id, deleted: true } }))
      setEditing(null)
      setDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    } finally {
      setDeleting(false)
    }
  }

  if (!editing || !row || !draft) return null
  const cardOptions = Array.from(new Set([draft.card, '현대 Red', '현대 네이버', '신한', '현금', '계좌이체'].filter(Boolean)))

  return <div className="transaction-category-editor-backdrop" onMouseDown={close}>
    <section className="transaction-category-editor" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="eyebrow">TRANSACTION</span><h2>거래 수정</h2><p>{title}</p></div><button type="button" onClick={close} aria-label="닫기">×</button></header>

      <div className="transaction-editor-grid two">
        <label>날짜<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
        <label>시간<input type="time" value={draft.time || ''} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></label>
      </div>
      <label>가맹점<input value={draft.merchant || ''} onChange={(e) => setDraft({ ...draft, merchant: e.target.value })} placeholder="가맹점명" /></label>
      <div className="transaction-editor-grid two">
        <label>금액<input inputMode="numeric" value={draft.amount ? draft.amount.toLocaleString('ko-KR') : ''} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} /></label>
        <label>결제수단<select value={draft.card} onChange={(e) => setDraft({ ...draft, card: e.target.value })}>{cardOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <label>카테고리<select value={draft.category} onChange={(event) => { const value = event.target.value; setDraft({ ...draft, category: value }); if (value === '고정비') setKind('fixed') }}><option value="미분류">미분류</option>{CATEGORIES.filter((item) => item !== '미분류').map((item) => <option key={item} value={item}>{item}</option>)}</select></label>

      <fieldset><legend>구분</legend><label><input type="radio" name="transaction-kind" checked={kind === 'living'} onChange={() => setKind('living')} />생활비</label><label><input type="radio" name="transaction-kind" checked={kind === 'fixed'} onChange={() => setKind('fixed')} />고정비</label></fieldset>

      <div className="transaction-editor-checks">
        <label><input type="checkbox" checked={draft.performanceIncluded} onChange={(e) => setDraft({ ...draft, performanceIncluded: e.target.checked })} />카드 실적 포함</label>
        <label><input type="checkbox" checked={draft.cashFlow} onChange={(e) => setDraft({ ...draft, cashFlow: e.target.checked })} />현금흐름 반영</label>
      </div>

      <label>메모<input value={draft.memo || ''} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} placeholder="선택 사항" /></label>

      {error && <p className="transaction-editor-error">{error}</p>}
      <div className="transaction-editor-actions">
        <button className="transaction-editor-delete" type="button" disabled={saving || deleting} onClick={() => void deleteRow()}>{deleting ? '삭제 중…' : '삭제'}</button>
        <button className="primary" type="button" disabled={saving || deleting} onClick={() => void save()}>{saving ? '저장 중…' : '변경 저장'}</button>
      </div>
    </section>
  </div>
}
