'use client'

import { useEffect } from 'react'
import { Transaction } from '@/lib/finance'

const TRANSACTIONS_KEY = 'flow-preview-transactions'

function readRows(): Transaction[] {
  try {
    const rows = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]') as Transaction[]
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function matchesCard(rowCard: string, selectedCard: string) {
  const row = (rowCard || '').trim()
  const selected = (selectedCard || '').trim()
  if (selected === '신한') return row === '신한' || row.startsWith('신한 ')
  if (selected === '현대 Red') return row === '현대 Red' || (/현대/.test(row) && /red/i.test(row))
  if (selected === '현대 네이버') return row === '현대 네이버' || (/현대/.test(row) && /네이버/.test(row))
  return row === selected
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function closeOverlay() {
  document.querySelector('.card-detail-backdrop')?.remove()
}

function showCardDetail(cardName: string) {
  closeOverlay()
  const month = currentMonth()
  const rows = readRows()
    .filter((row) => row.date.startsWith(month) && matchesCard(row.card, cardName))
    .sort((a, b) => `${b.date}${b.time || ''}`.localeCompare(`${a.date}${a.time || ''}`))
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const performanceTotal = rows.filter((row) => row.performanceIncluded).reduce((sum, row) => sum + Number(row.amount || 0), 0)

  const backdrop = document.createElement('div')
  backdrop.className = 'card-detail-backdrop'
  backdrop.innerHTML = `
    <section class="card-detail-sheet" role="dialog" aria-modal="true" aria-label="${cardName} 결제 내역">
      <div class="card-detail-head">
        <div>
          <span class="eyebrow">CARD TRANSACTIONS</span>
          <h2>${cardName}</h2>
          <p>${Number(month.slice(5, 7))}월 결제 ${rows.length}건 · 총 ${total.toLocaleString('ko-KR')}원</p>
          <small>카드 실적 반영 ${performanceTotal.toLocaleString('ko-KR')}원 · 거래를 누르면 분류 수정</small>
        </div>
        <button type="button" class="icon-btn card-detail-close" aria-label="닫기">×</button>
      </div>
      <div class="card-detail-list">
        ${rows.length ? rows.map((row) => `
          <div class="card-detail-row" data-transaction-id="${row.id}">
            <div class="card-detail-date"><b>${row.date.replaceAll('-', '.')}</b><small>${row.time || '시각 미저장'}</small></div>
            <div class="card-detail-merchant"><b>${row.merchant || '가맹점 정보 없음'}</b><small>${row.category || '미분류'}</small><div class="card-detail-tags">${row.fixed ? '<em>고정비</em>' : ''}${row.living ? '<em>생활비</em>' : ''}${!row.performanceIncluded ? '<em class="excluded">실적 제외</em>' : ''}</div></div>
            <strong>${Number(row.amount || 0).toLocaleString('ko-KR')}원</strong>
          </div>
        `).join('') : '<div class="card-detail-empty">이번 달 해당 카드 결제 내역이 없습니다.</div>'}
      </div>
    </section>
  `

  document.body.appendChild(backdrop)
  backdrop.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    if (target === backdrop || target.closest('.card-detail-close')) closeOverlay()
  })
}

export function CardDetailInteractions() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.card-detail-row')) return
      const card = target?.closest<HTMLElement>('.pay-card')
      if (!card) return
      const name = card.querySelector('span')?.textContent?.trim() || ''
      if (!name) return
      showCardDetail(name)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeOverlay()
    }

    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeyDown)
      closeOverlay()
    }
  }, [])

  return null
}
