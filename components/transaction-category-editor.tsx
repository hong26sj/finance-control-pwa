'use client'

import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, Transaction, won } from '@/lib/finance'
import { DEFAULT_APPS_SCRIPT_URL, saveMerchantRule, upsertDriveTransactions } from '@/lib/drive-api'

const TRANSACTIONS_KEY = 'flow-preview-transactions'

type EditorState = { row: Transaction; sourceElement: HTMLElement | null }

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
  const merchant = item.querySelector('span:nth-child(2) b')?.textContent?.trim() || ''
  const meta = item.querySelector('span:nth-child(2) small')?.textContent?.trim() || ''
  const amount = amountFromText(item.querySelector('strong')?.textContent || '')
  const dateTitle = document.querySelector('.calendar-day-head h3')?.textContent || ''
  const yearTitle = document.querySelector('.calendar-toolbar h2')?.textContent || ''
  const year = Number(yearTitle.match(/(\d{4})년/)?.[1] || new Date().getFullYear())
  const dateMatch = dateTitle.match(/(\d{1,2})월\s*(\d{1,2})일/)
  if (!dateMatch) return null
  const date = `${year}-${String(Number(dateMatch[1])).padStart(2, '0')}-${String(Number(dateMatch[2])).padStart(2, '0')}`
  const parts = meta.split('·').map((part) => part.trim())
  const category = parts[0] || ''
  const card = parts[1] || ''
  const time = parts[2] || ''
  return rows.find((row) => row.date === date && row.amount === amount && row.category === category && row.card === card && (row.time || '') === time && (row.merchant || row.category) === merchant) || null
}

function resolveCardRow(target: HTMLElement, rows: Transaction[]) {
  const item = target.closest<HTMLElement>('.card-detail-row')
  if (!item) return null
  const id = item.dataset.transactionId
  if (id) return rows.find((row) => row.id === id) || null
  const date = item.querySelector('.card-detail-date b')?.textContent?.trim().replaceAll('.', '-') || ''
  const timeText = item.querySelector('.card-detail-date small')?.textContent?.trim() || ''
  const time = timeText === '시각 미저장' ? '' : timeText
  const merchant = item.querySelector('.card-detail-merchant b')?.textContent?.trim() || ''
  const category = item.querySelector('.card-detail-merchant small')?.textContent?.trim() || ''
  const amount = amountFromText(item.querySelector(':scope > strong')?.textContent || '')
  return rows.find((row) => row.date === date && (row.time || '') === time && row.amount === amount && row.category === category && (row.merchant || '가맹점 정보 없음') === merchant) || null
}

export function TransactionCategoryEditor() {
  const [editing, setEditing] = useState<EditorState | null>(null)
  const [category, setCategory] = useState('미분류')
  const [kind, setKind] = useState<'living' | 'fixed'>('living')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const row = editing?.row || null
  const title = useMemo(() => row ? `${row.merchant || '가맹점 정보 없음'} · ${won(row.amount)}` : '', [row])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || target.closest('.transaction-category-editor')) return
      if (!target.closest('.calendar-day-list > div,.card-detail-row')) return
      const rows = readRows()
      const resolved = resolveCalendarRow(target, rows) || resolveCardRow(target, rows)
      if (!resolved) return
      setEditing({ row: resolved, sourceElement: target.closest<HTMLElement>('.calendar-day-list > div,.card-detail-row') })
      setCategory(resolved.category || '미분류')
      setKind(resolved.fixed ? 'fixed' : 'living')
      setError('')
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const save = async () => {
    if (!row) return
    const token = localStorage.getItem('flow-drive-token') || ''
    const endpoint = localStorage.getItem('flow-drive-endpoint') || DEFAULT_APPS_SCRIPT_URL
    if (!token) { setError('Drive 인증이 필요합니다.'); return }
    const next: Transaction = {
      ...row,
      category,
      living: kind === 'living',
      fixed: kind === 'fixed',
      merchantCategoryAmbiguous: false,
    }
    setSaving(true)
    setError('')
    try {
      await upsertDriveTransactions(endpoint, token, [next])
      if (category !== '미분류') {
        await saveMerchantRule(endpoint, token, {
          transactionId: next.id,
          rawMerchant: next.merchant || undefined,
          merchantHash: next.merchantHash,
          category,
        }).catch(() => undefined)
      }
      const nextRows = readRows().map((item) => item.id === next.id ? next : item)
      localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(nextRows))
      const source = editing?.sourceElement
      if (source?.classList.contains('card-detail-row')) {
        const categoryEl = source.querySelector<HTMLElement>('.card-detail-merchant small')
        if (categoryEl) categoryEl.textContent = category
        const tags = source.querySelector<HTMLElement>('.card-detail-tags')
        if (tags) tags.innerHTML = `${kind === 'fixed' ? '<em>고정비</em>' : '<em>생활비</em>'}${next.performanceIncluded ? '' : '<em class="excluded">실적 제외</em>'}`
      } else if (source) {
        const small = source.querySelector<HTMLElement>('span:nth-child(2) small')
        if (small) small.textContent = `${category} · ${next.card}${next.time ? ` · ${next.time}` : ''}`
      }
      window.dispatchEvent(new CustomEvent('flow-transactions-changed', { detail: { id: next.id } }))
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '변경 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing || !row) return null
  return <div className="transaction-category-editor-backdrop" onMouseDown={() => setEditing(null)}>
    <section className="transaction-category-editor" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="eyebrow">TRANSACTION</span><h2>분류 수정</h2><p>{title}</p></div><button type="button" onClick={() => setEditing(null)} aria-label="닫기">×</button></header>
      <label>카테고리<select value={category} onChange={(event) => { const value = event.target.value; setCategory(value); if (value === '고정비') setKind('fixed') }}><option value="미분류">미분류</option>{CATEGORIES.filter((item) => item !== '미분류').map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <fieldset><legend>구분</legend><label><input type="radio" name="transaction-kind" checked={kind === 'living'} onChange={() => setKind('living')} />생활비</label><label><input type="radio" name="transaction-kind" checked={kind === 'fixed'} onChange={() => setKind('fixed')} />고정비</label></fieldset>
      <div className="transaction-editor-meta"><span>{row.date}{row.time ? ` ${row.time}` : ''}</span><span>{row.card}</span></div>
      {error && <p className="transaction-editor-error">{error}</p>}
      <button className="primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? '저장 중…' : '변경 저장'}</button>
    </section>
  </div>
}
