'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Transaction, won } from '@/lib/finance'

const CATEGORY_COLORS: Record<string, string> = {
  '평일 점심': '#e4a04b',
  '식비·장보기': '#6f9a80',
  '커피·간식': '#d87860',
  '교통·주차': '#6391aa',
  '생활용품·잡비': '#9780ad',
  '외식·여가·개인': '#c8677a',
  '생활비 예비금': '#8a958f',
  '고정비': '#66726d',
  '미분류': '#d19b46',
}

const pad = (value: number) => String(value).padStart(2, '0')
const monthKey = (year: number, month: number) => `${year}-${pad(month + 1)}`
const dateKey = (year: number, month: number, day: number) => `${monthKey(year, month)}-${pad(day)}`

function readTransactions(): Transaction[] {
  try {
    return JSON.parse(localStorage.getItem('flow-preview-transactions') || '[]') as Transaction[]
  } catch {
    return []
  }
}

export function MoneyCalendar() {
  const now = new Date()
  const [active, setActive] = useState(false)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
  const [rows, setRows] = useState<Transaction[]>([])

  useEffect(() => {
    const activate = () => {
      setRows(readTransactions())
      setActive(true)
      document.querySelectorAll('.sidebar nav button,.bottom-nav button').forEach((button) => button.classList.remove('active'))
      document.querySelectorAll('[data-money-calendar-tab]').forEach((button) => button.classList.add('active'))
      document.body.classList.add('money-calendar-active')
    }
    const deactivate = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-money-calendar-tab]')) return
      if (target?.closest('.sidebar nav button,.bottom-nav button')) {
        setActive(false)
        document.body.classList.remove('money-calendar-active')
        document.querySelectorAll('[data-money-calendar-tab]').forEach((button) => button.classList.remove('active'))
      }
    }

    const makeButton = (mobile: boolean) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('data-money-calendar-tab', '1')
      button.setAttribute('aria-label', '캘린더')
      button.innerHTML = mobile
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg><span>캘린더</span>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg><span>캘린더</span>'
      button.addEventListener('click', activate)
      return button
    }

    const sidebarNav = document.querySelector('.sidebar nav')
    const bottomNav = document.querySelector('.bottom-nav')
    const sidebarButton = sidebarNav && !sidebarNav.querySelector('[data-money-calendar-tab]') ? makeButton(false) : null
    const mobileButton = bottomNav && !bottomNav.querySelector('[data-money-calendar-tab]') ? makeButton(true) : null
    if (sidebarButton) sidebarNav?.insertBefore(sidebarButton, sidebarNav.children[2] || null)
    if (mobileButton) bottomNav?.insertBefore(mobileButton, bottomNav.children[2] || null)
    document.addEventListener('click', deactivate)

    return () => {
      document.removeEventListener('click', deactivate)
      sidebarButton?.remove()
      mobileButton?.remove()
      document.body.classList.remove('money-calendar-active')
    }
  }, [])

  const currentMonthRows = useMemo(() => rows.filter((row) => row.date.startsWith(monthKey(year, month))), [rows, year, month])
  const byDate = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    currentMonthRows.forEach((row) => map.set(row.date, [...(map.get(row.date) || []), row]))
    return map
  }, [currentMonthRows])

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1
    return day >= 1 && day <= daysInMonth ? day : null
  })
  const selectedRows = (byDate.get(selected) || []).sort((a, b) => (b.time || '').localeCompare(a.time || ''))
  const selectedTotal = selectedRows.reduce((sum, row) => sum + row.amount, 0)
  const monthTotal = currentMonthRows.reduce((sum, row) => sum + row.amount, 0)

  const moveMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
    setSelected(dateKey(next.getFullYear(), next.getMonth(), 1))
  }
  const goToday = () => {
    const today = new Date()
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelected(dateKey(today.getFullYear(), today.getMonth(), today.getDate()))
  }

  if (!active) return null

  return <section className="money-calendar-page" aria-label="머니 캘린더">
    <div className="page-title money-calendar-title">
      <div><span className="eyebrow">MONEY CALENDAR</span><h1>머니 캘린더</h1><p>날짜별 지출 합계와 거래 건수를 월간 달력으로 확인합니다.</p></div>
      <div className="calendar-month-total"><span>이달 누계</span><b>{won(monthTotal)}</b><small>{currentMonthRows.length}건</small></div>
    </div>

    <article className="panel calendar-panel">
      <div className="calendar-toolbar">
        <button type="button" className="calendar-arrow" onClick={() => moveMonth(-1)} aria-label="이전 달"><ChevronLeft /></button>
        <div><CalendarDays /><h2>{year}년 {month + 1}월</h2></div>
        <button type="button" className="calendar-arrow" onClick={() => moveMonth(1)} aria-label="다음 달"><ChevronRight /></button>
        <button type="button" className="calendar-today" onClick={goToday}>오늘</button>
      </div>
      <div className="calendar-weekdays">{['일','월','화','수','목','금','토'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">
        {cells.map((day, index) => {
          if (!day) return <div className="calendar-cell empty" key={`empty-${index}`} />
          const key = dateKey(year, month, day)
          const dayRows = byDate.get(key) || []
          const total = dayRows.reduce((sum, row) => sum + row.amount, 0)
          const categoryDots = [...new Set(dayRows.map((row) => row.category))].slice(0, 4)
          const isToday = key === dateKey(now.getFullYear(), now.getMonth(), now.getDate())
          const isSelected = key === selected
          return <button type="button" className={`calendar-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`} onClick={() => setSelected(key)} key={key}>
            <span className="calendar-day-number">{day}</span>
            {dayRows.length > 0 && <><strong>{total.toLocaleString('ko-KR')}</strong><small>{dayRows.length}건</small><span className="calendar-dots">{categoryDots.map((category) => <i key={category} style={{ background: CATEGORY_COLORS[category] || '#89948e' }} />)}</span></>}
          </button>
        })}
      </div>
    </article>

    <article className="panel calendar-day-panel">
      <div className="calendar-day-head"><div><span className="eyebrow">DAILY DETAIL</span><h3>{Number(selected.slice(5, 7))}월 {Number(selected.slice(8, 10))}일</h3></div><div><b>{won(selectedTotal)}</b><small>{selectedRows.length}건</small></div></div>
      {selectedRows.length === 0 ? <div className="calendar-empty-day">이 날짜에는 거래가 없습니다.</div> : <div className="calendar-day-list">{selectedRows.map((row) => <div key={row.id}>
        <span className="calendar-category-dot" style={{ background: CATEGORY_COLORS[row.category] || '#89948e' }} />
        <span><b>{row.merchant || row.category}</b><small>{row.category} · {row.card}{row.time ? ` · ${row.time}` : ''}</small></span>
        <strong>{won(row.amount)}</strong>
      </div>)}</div>}
    </article>
  </section>
}
