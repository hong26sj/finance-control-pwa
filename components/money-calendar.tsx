'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { CATEGORIES, Transaction, won } from '@/lib/finance'
import { DEFAULT_APPS_SCRIPT_URL, upsertDriveTransactions } from '@/lib/drive-api'

const CATEGORY_COLORS: Record<string, string> = {
  '평일 점심': '#e4a04b', '식비·장보기': '#6f9a80', '커피·간식': '#d87860', '교통·주차': '#6391aa',
  '생활용품·잡비': '#9780ad', '외식·여가·개인': '#c8677a', '생활비 예비금': '#8a958f', '고정비': '#66726d', '미분류': '#d19b46',
}
const pad = (value: number) => String(value).padStart(2, '0')
const monthKey = (year: number, month: number) => `${year}-${pad(month + 1)}`
const dateKey = (year: number, month: number, day: number) => `${monthKey(year, month)}-${pad(day)}`
function readTransactions(): Transaction[] { try { return JSON.parse(localStorage.getItem('flow-preview-transactions') || '[]') as Transaction[] } catch { return [] } }
function toggleValue(values: string[], value: string) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value] }
function filterLabel(values: string[]) { return values.length === 0 ? '전체' : values.length === 1 ? values[0] : `${values[0]} 외 ${values.length - 1}` }

export function MoneyCalendar() {
  const now = new Date()
  const [active, setActive] = useState(false)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState(dateKey(now.getFullYear(), now.getMonth(), now.getDate()))
  const [rows, setRows] = useState<Transaction[]>([])
  const [categoryFilters, setCategoryFilters] = useState<string[]>([])
  const [cardFilters, setCardFilters] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(0)

  useEffect(() => {
    const activate = () => {
      setRows(readTransactions()); setActive(true)
      document.querySelectorAll('.sidebar nav button,.bottom-nav button').forEach((button) => button.classList.remove('active'))
      document.querySelectorAll('[data-money-calendar-tab]').forEach((button) => button.classList.add('active'))
      document.body.classList.add('money-calendar-active')
    }
    const deactivate = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-money-calendar-tab]')) return
      if (target?.closest('.sidebar nav button,.bottom-nav button')) {
        setActive(false); document.body.classList.remove('money-calendar-active')
        document.querySelectorAll('[data-money-calendar-tab]').forEach((button) => button.classList.remove('active'))
      }
    }
    const refreshRows = () => setRows(readTransactions())
    const makeButton = () => {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('data-money-calendar-tab', '1'); button.setAttribute('aria-label', '캘린더')
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg><span>캘린더</span>'
      button.addEventListener('click', activate); return button
    }
    const sidebarNav = document.querySelector('.sidebar nav'); const bottomNav = document.querySelector('.bottom-nav')
    const sidebarButton = sidebarNav && !sidebarNav.querySelector('[data-money-calendar-tab]') ? makeButton() : null
    const mobileButton = bottomNav && !bottomNav.querySelector('[data-money-calendar-tab]') ? makeButton() : null
    if (sidebarButton) sidebarNav?.insertBefore(sidebarButton, sidebarNav.children[2] || null)
    if (mobileButton) bottomNav?.insertBefore(mobileButton, bottomNav.children[2] || null)
    document.addEventListener('click', deactivate); window.addEventListener('flow-transactions-changed', refreshRows)
    return () => { document.removeEventListener('click', deactivate); window.removeEventListener('flow-transactions-changed', refreshRows); sidebarButton?.remove(); mobileButton?.remove(); document.body.classList.remove('money-calendar-active') }
  }, [])

  useEffect(() => { setSelectedIds([]); setBulkCategory(''); setBulkProgress(0) }, [selected])

  const currentMonthRows = useMemo(() => rows.filter((row) => row.date.startsWith(monthKey(year, month))), [rows, year, month])
  const filteredMonthRows = useMemo(() => currentMonthRows.filter((row) => {
    if (categoryFilters.length && !categoryFilters.includes(row.category)) return false
    if (cardFilters.length && !cardFilters.includes(row.card)) return false
    return true
  }), [currentMonthRows, categoryFilters, cardFilters])
  const cards = useMemo(() => [...new Set(rows.map((row) => row.card).filter(Boolean))].sort(), [rows])
  const byDate = useMemo(() => { const map = new Map<string, Transaction[]>(); filteredMonthRows.forEach((row) => map.set(row.date, [...(map.get(row.date) || []), row])); return map }, [filteredMonthRows])
  const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: 42 }, (_, index) => { const day = index - firstDay + 1; return day >= 1 && day <= daysInMonth ? day : null })
  const selectedRows = (byDate.get(selected) || []).sort((a, b) => (b.time || '').localeCompare(a.time || ''))
  const selectedTotal = selectedRows.reduce((sum, row) => sum + row.amount, 0); const monthTotal = filteredMonthRows.reduce((sum, row) => sum + row.amount, 0)
  const moveMonth = (delta: number) => { const next = new Date(year, month + delta, 1); setYear(next.getFullYear()); setMonth(next.getMonth()); setSelected(dateKey(next.getFullYear(), next.getMonth(), 1)) }
  const goToday = () => { const today = new Date(); setYear(today.getFullYear()); setMonth(today.getMonth()); setSelected(dateKey(today.getFullYear(), today.getMonth(), today.getDate())) }

  const applyBulkCategory = async () => {
    if (!selectedIds.length || !bulkCategory || bulkSaving) return
    const token = localStorage.getItem('flow-drive-token') || ''
    const endpoint = localStorage.getItem('flow-drive-endpoint') || DEFAULT_APPS_SCRIPT_URL
    if (!token) { window.alert('Drive 인증이 필요합니다.'); return }
    const wanted = new Set(selectedIds)
    const fixed = bulkCategory === '고정비'
    const changed = rows.filter((row) => wanted.has(row.id)).map((row) => ({ ...row, category: bulkCategory, living: !fixed, fixed, merchantCategoryAmbiguous: false }))
    if (!changed.length) return

    setBulkSaving(true); setBulkProgress(12)
    window.dispatchEvent(new Event('flow-explicit-transaction-write'))
    const changedById = new Map(changed.map((row) => [row.id, row]))
    const nextRows = rows.map((row) => changedById.get(row.id) || row)
    localStorage.setItem('flow-preview-transactions', JSON.stringify(nextRows))
    setRows(nextRows)
    window.dispatchEvent(new CustomEvent('flow-transactions-changed', { detail: { ids: selectedIds, bulk: true } }))
    window.dispatchEvent(new CustomEvent('flow-drive-save-progress', { detail: { progress: 18, stage: `${changed.length}건 저장 준비 중`, state: 'saving' } }))

    const timer = window.setInterval(() => setBulkProgress((value) => Math.min(88, value + (value < 60 ? 9 : 3))), 170)
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('flow-drive-save-progress', { detail: { progress: 46, stage: 'Drive 전송 중', state: 'saving' } })), 80)
    try {
      await upsertDriveTransactions(endpoint, token, changed)
      window.clearInterval(timer)
      setBulkProgress(100)
      window.dispatchEvent(new CustomEvent('flow-drive-save-progress', { detail: { progress: 100, stage: `${changed.length}건 저장 완료`, state: 'done' } }))
      setSelectedIds([]); setBulkCategory('')
    } catch (error) {
      window.clearInterval(timer)
      window.dispatchEvent(new Event('flow-explicit-transaction-write'))
      localStorage.setItem('flow-preview-transactions', JSON.stringify(rows))
      setRows(rows)
      window.dispatchEvent(new CustomEvent('flow-transactions-changed', { detail: { rollback: true } }))
      window.dispatchEvent(new CustomEvent('flow-drive-save-progress', { detail: { progress: 0, stage: error instanceof Error ? error.message : '저장 실패', state: 'error' } }))
      window.alert(error instanceof Error ? error.message : '저장에 실패했습니다.')
    } finally {
      setBulkSaving(false)
    }
  }

  if (!active) return null

  return <>
    <style>{`
      .money-calendar-page{position:absolute;top:68px;left:230px;right:0;z-index:15;min-height:calc(100vh - 68px);background:var(--paper);padding:34px 34px 100px;overflow:auto}.money-calendar-page>.page-title,.money-calendar-page>.panel{max-width:1152px;margin-left:auto;margin-right:auto}.money-calendar-title{align-items:flex-end}.calendar-month-total{min-width:170px;text-align:right;background:#fff;border:1px solid var(--line);border-radius:13px;padding:12px 14px}.calendar-month-total span,.calendar-month-total small{display:block;font-size:9px;color:var(--muted)}.calendar-month-total b{display:block;font:800 17px var(--font-number);margin:4px 0}.calendar-panel{padding:18px}.calendar-toolbar{display:grid;grid-template-columns:40px 1fr 40px auto;gap:8px;align-items:center;margin-bottom:12px}.calendar-toolbar>div{display:flex;justify-content:center;align-items:center;gap:8px}.calendar-toolbar>div svg{width:18px;color:var(--green)}.calendar-toolbar h2{margin:0;font:800 18px var(--font-number)}.calendar-arrow,.calendar-today{height:38px;border:1px solid var(--line);background:#fff;border-radius:9px;display:grid;place-items:center;cursor:pointer}.calendar-arrow svg{width:17px}.calendar-today{padding:0 13px;font-size:10px;font-weight:800}.calendar-filters{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px}.calendar-filter{position:relative}.calendar-filter>span{display:block;margin-bottom:4px;font-size:8px;color:var(--muted);font-weight:700}.calendar-filter details{position:relative}.calendar-filter summary{list-style:none;height:36px;border:1px solid var(--line);border-radius:9px;background:#fff;padding:0 10px;display:flex;align-items:center;justify-content:space-between;font-size:10px;color:var(--ink);cursor:pointer}.calendar-filter summary::-webkit-details-marker{display:none}.calendar-filter summary:after{content:'⌄';color:var(--muted);font-size:12px}.calendar-filter-menu{position:absolute;z-index:30;top:40px;left:0;right:0;max-height:240px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:6px}.calendar-filter-menu button{width:100%;border:0;background:transparent;text-align:left;padding:7px 8px;font-size:10px;font-weight:700;color:var(--muted);cursor:pointer}.calendar-filter-menu label{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:7px;font-size:10px;color:var(--ink);cursor:pointer}.calendar-filter-menu label:hover{background:#f3f6f4}.calendar-filter-menu input{width:15px;height:15px;margin:0;accent-color:var(--forest)}.calendar-weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.calendar-weekdays{border:1px solid var(--line);border-bottom:0;border-radius:11px 11px 0 0;overflow:hidden;background:#f5f7f4}.calendar-weekdays span{text-align:center;padding:8px 2px;font-size:9px;font-weight:800;color:var(--muted)}.calendar-weekdays span:first-child{color:#bd665d}.calendar-grid{border-left:1px solid var(--line);border-top:1px solid var(--line)}.calendar-cell{position:relative;min-height:105px;border:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:#fff;text-align:left;padding:9px;cursor:pointer;overflow:hidden}.calendar-cell.empty{background:#fafbf9;cursor:default}.calendar-cell:nth-child(7n+1) .calendar-day-number{color:#bd665d}.calendar-cell.today .calendar-day-number{background:var(--forest);color:#fff}.calendar-cell.selected{background:#f0f5f2;box-shadow:inset 0 0 0 2px #729482}.calendar-day-number{display:inline-grid;place-items:center;min-width:25px;height:25px;border-radius:8px;font:800 10px var(--font-number)}.calendar-cell strong,.calendar-cell small{display:block}.calendar-cell strong{font:800 11px var(--font-number);margin-top:9px}.calendar-cell small{font-size:8px;color:var(--muted);margin-top:2px}.calendar-dots{position:absolute;left:9px;right:9px;bottom:9px;display:flex;gap:4px}.calendar-dots i{width:6px;height:6px;border-radius:50%}.calendar-day-panel{margin-top:16px}.calendar-day-head{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid var(--line);padding-bottom:12px}.calendar-day-head h3{font-size:15px;margin:4px 0 0}.calendar-day-head>div:last-child{text-align:right}.calendar-day-head>div:last-child b,.calendar-day-head>div:last-child small{display:block}.calendar-day-head>div:last-child b{font:800 16px var(--font-number)}.calendar-day-head>div:last-child small{font-size:8px;color:var(--muted);margin-top:2px}.calendar-bulk-toolbar{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}.calendar-bulk-toolbar label{display:flex;align-items:center;gap:6px;font-size:9px;font-weight:750;color:var(--muted);white-space:nowrap}.calendar-bulk-toolbar input{width:16px;height:16px;accent-color:var(--forest)}.calendar-bulk-toolbar select{height:34px;border:1px solid var(--line);border-radius:9px;background:#fff;padding:0 9px;font-size:10px;min-width:0}.calendar-bulk-toolbar button{height:34px;border:0;border-radius:9px;padding:0 12px;font-size:9px;font-weight:800;background:var(--forest);color:#fff}.calendar-bulk-toolbar button:disabled{opacity:.45}.calendar-bulk-progress{grid-column:1/-1;height:4px;border-radius:999px;background:#e8ece9;overflow:hidden}.calendar-bulk-progress i{display:block;height:100%;background:var(--forest);transition:width .16s ease}.calendar-day-list>div{display:grid;grid-template-columns:24px 8px minmax(0,1fr) auto;gap:8px;align-items:center;padding:12px 2px;border-top:1px solid #edf0ed}.calendar-day-list>div:first-child{border-top:0}.calendar-row-check{display:grid;place-items:center}.calendar-row-check input{width:17px;height:17px;accent-color:var(--forest)}.calendar-category-dot{width:8px;height:8px;border-radius:50%}.calendar-day-list b,.calendar-day-list small{display:block}.calendar-day-list b{font-size:11px}.calendar-day-list small{font-size:8px;color:var(--muted);margin-top:3px}.calendar-day-list strong{font:800 11px var(--font-number)}.calendar-empty-day{text-align:center;padding:26px 8px;color:var(--muted);font-size:10px}.money-calendar-active .app-shell>main .content{visibility:hidden}.money-calendar-active .bottom-nav [data-money-calendar-tab],.money-calendar-active .sidebar [data-money-calendar-tab]{color:#315d4c;background:#e8efeb}
      @media(max-width:700px){.money-calendar-page{top:62px;left:0;padding:25px 10px 100px;min-height:calc(100vh - 62px)}.money-calendar-title{display:block}.calendar-month-total{margin-top:14px;text-align:left;min-width:0}.calendar-panel{padding:10px}.calendar-toolbar{grid-template-columns:36px 1fr 36px}.calendar-toolbar .calendar-today{grid-column:1/-1;height:34px}.calendar-toolbar h2{font-size:16px}.calendar-filter summary{font-size:11px;height:34px}.calendar-filter-menu label,.calendar-filter-menu button{font-size:11px}.calendar-weekdays span{font-size:8px;padding:7px 0}.calendar-cell{min-height:76px;padding:6px 5px}.calendar-day-number{min-width:22px;height:22px}.calendar-cell strong{font-size:8px;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.calendar-cell small{font-size:7px}.calendar-dots{left:5px;right:5px;bottom:6px;gap:3px}.calendar-dots i{width:5px;height:5px}.calendar-day-panel{padding:14px}.calendar-bulk-toolbar{grid-template-columns:auto minmax(0,1fr)}.calendar-bulk-toolbar button{grid-column:1/-1}.calendar-day-list>div{grid-template-columns:22px 8px minmax(0,1fr) auto;padding:11px 0}.bottom-nav button{min-width:0}.bottom-nav button span{font-size:7px}}
    `}</style>
    <section className="money-calendar-page" aria-label="머니 캘린더">
      <div className="page-title money-calendar-title"><div><span className="eyebrow">MONEY CALENDAR</span><h1>머니 캘린더</h1><p>날짜별 지출 합계와 거래 건수를 월간 달력으로 확인합니다.</p></div><div className="calendar-month-total"><span>이달 누계</span><b>{won(monthTotal)}</b><small>{filteredMonthRows.length}건</small></div></div>
      <article className="panel calendar-panel">
        <div className="calendar-toolbar"><button type="button" className="calendar-arrow" onClick={() => moveMonth(-1)} aria-label="이전 달"><ChevronLeft /></button><div><CalendarDays /><h2>{year}년 {month + 1}월</h2></div><button type="button" className="calendar-arrow" onClick={() => moveMonth(1)} aria-label="다음 달"><ChevronRight /></button><button type="button" className="calendar-today" onClick={goToday}>오늘</button></div>
        <div className="calendar-filters">
          <div className="calendar-filter"><span>카테고리</span><details><summary>{filterLabel(categoryFilters)}</summary><div className="calendar-filter-menu"><button type="button" onClick={() => setCategoryFilters([])}>전체 선택</button>{CATEGORIES.map((category) => <label key={category}><input type="checkbox" checked={categoryFilters.includes(category)} onChange={() => setCategoryFilters((values) => toggleValue(values, category))} />{category}</label>)}</div></details></div>
          <div className="calendar-filter"><span>결제수단</span><details><summary>{filterLabel(cardFilters)}</summary><div className="calendar-filter-menu"><button type="button" onClick={() => setCardFilters([])}>전체 선택</button>{cards.map((card) => <label key={card}><input type="checkbox" checked={cardFilters.includes(card)} onChange={() => setCardFilters((values) => toggleValue(values, card))} />{card}</label>)}</div></details></div>
        </div>
        <div className="calendar-weekdays">{['일','월','화','수','목','금','토'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">{cells.map((day, index) => { if (!day) return <div className="calendar-cell empty" key={`empty-${index}`} />; const key = dateKey(year, month, day); const dayRows = byDate.get(key) || []; const total = dayRows.reduce((sum, row) => sum + row.amount, 0); const categoryDots = [...new Set(dayRows.map((row) => row.category))].slice(0, 4); const isToday = key === dateKey(now.getFullYear(), now.getMonth(), now.getDate()); const isSelected = key === selected; return <button type="button" className={`calendar-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`} onClick={() => setSelected(key)} key={key}><span className="calendar-day-number">{day}</span>{dayRows.length > 0 && <><strong>{total.toLocaleString('ko-KR')}</strong><small>{dayRows.length}건</small><span className="calendar-dots">{categoryDots.map((category) => <i key={category} style={{ background: CATEGORY_COLORS[category] || '#89948e' }} />)}</span></>}</button> })}</div>
      </article>
      <article className="panel calendar-day-panel">
        <div className="calendar-day-head"><div><span className="eyebrow">DAILY DETAIL</span><h3>{Number(selected.slice(5, 7))}월 {Number(selected.slice(8, 10))}일</h3></div><div><b>{won(selectedTotal)}</b><small>{selectedRows.length}건</small></div></div>
        {selectedRows.length > 0 && <div className="calendar-bulk-toolbar">
          <label><input type="checkbox" checked={selectedRows.length > 0 && selectedRows.every((row) => selectedIds.includes(row.id))} onChange={(event) => setSelectedIds(event.target.checked ? selectedRows.map((row) => row.id) : [])} />전체 선택</label>
          <select value={bulkCategory} disabled={bulkSaving} onChange={(event) => setBulkCategory(event.target.value)}><option value="">카테고리 선택</option>{CATEGORIES.filter((category) => category !== '미분류').map((category) => <option key={category} value={category}>{category}</option>)}</select>
          <button type="button" disabled={!selectedIds.length || !bulkCategory || bulkSaving} onClick={() => void applyBulkCategory()}>{bulkSaving ? `${bulkProgress}% 저장 중` : `${selectedIds.length}건 분류`}</button>
          {bulkSaving && <span className="calendar-bulk-progress"><i style={{ width: `${bulkProgress}%` }} /></span>}
        </div>}
        {selectedRows.length === 0 ? <div className="calendar-empty-day">선택한 필터에 해당하는 거래가 없습니다.</div> : <div className="calendar-day-list">{selectedRows.map((row) => <div key={row.id} data-transaction-id={row.id}>
          <label className="calendar-row-check"><input className="calendar-bulk-check" type="checkbox" checked={selectedIds.includes(row.id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id))} /></label>
          <span className="calendar-category-dot" style={{ background: CATEGORY_COLORS[row.category] || '#89948e' }} />
          <span><b>{row.merchant || row.category}</b><small>{row.category} · {row.card}{row.time ? ` · ${row.time}` : ''}{row.performanceIncluded ? '' : ' · 실적 제외'}</small></span>
          <strong>{won(row.amount)}</strong>
        </div>)}</div>}
      </article>
    </section>
  </>
}
