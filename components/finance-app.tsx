'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, CreditCard, Eye, EyeOff, Gauge, Home, Landmark, Menu, Pencil, Plus, ReceiptText, Search, Settings2, Trash2, Upload, WalletCards, X } from 'lucide-react'
import { ServiceWorkerRegister } from './service-worker-register'
import { CATEGORIES, DEFAULT_LOANS, EMPTY_SETTINGS, estimateMonthlyPayment, FIXED_PLAN, FinanceSettings, FixedPlan, Loan, normalizeMerchant, TabId, Transaction, weekAllowance, won } from '@/lib/finance'
import { parseCardWorkbook } from '@/lib/import-xlsx'
import { loadDriveSnapshot, saveDriveSnapshot } from '@/lib/drive-api'

const nav = [
  ['home', '대시보드', Home], ['transactions', '거래', WalletCards], ['budget', '예산', Gauge],
  ['cards', '카드 실적', CreditCard], ['fixed', '고정비·대출', ReceiptText],
  ['settings', '연결 설정', Settings2],
] as const
const colors = ['#f1a64a', '#719b82', '#dc7c61', '#6592aa', '#9882ad', '#c7677a', '#89948e']
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''
const emptyTx = (): Transaction => ({ id: '', date: '2026-07-31', time: '12:00', card: '현대 네이버', merchant: '', amount: 0, category: '미분류', living: true, fixed: false, performanceIncluded: true, cashFlow: false, source: '직접 입력', memo: '' })
const normalizeLoans = (items: Loan[]) => items.map((item) => ({ ...item, rateHistory: item.rateHistory || [] }))
const normalizeFixed = (items: FixedPlan[]) => items

function Ring({ value, label, color = '#6f9882' }: { value: number; label: string; color?: string }) {
  const bounded = Math.min(100, Math.max(0, value))
  return <div className="ring" style={{ background: `conic-gradient(${color} ${bounded * 3.6}deg,#e9ece8 0)` }}><div><strong>{Math.round(value)}%</strong><span>{label}</span></div></div>
}
function Money({ value, hidden }: { value: number; hidden: boolean }) { return <>{hidden ? '••••••' : won(value)}</> }

function TransactionModal({ value, onClose, onSave, duplicate }: { value: Transaction; onClose: () => void; onSave: (value: Transaction, force?: boolean) => boolean; duplicate: (value: Transaction) => boolean }) {
  const [draft, setDraft] = useState(value)
  const [warning, setWarning] = useState(false)
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.merchant.trim() || draft.amount <= 0) return
    if (duplicate(draft) && !warning) { setWarning(true); return }
    if (onSave({ ...draft, id: draft.id || `manual-${Date.now()}` }, warning)) onClose()
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><form className="modal" onSubmit={save} onMouseDown={(e) => e.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow">TRANSACTION</span><h2>{draft.id ? '거래 수정' : '거래 추가'}</h2></div><button type="button" className="icon-btn" onClick={onClose} aria-label="닫기"><X /></button></div>
    <div className="form-grid"><label>날짜<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label><label>시간<input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></label></div>
    <label>가맹점<input value={draft.merchant} onChange={(e) => setDraft({ ...draft, merchant: e.target.value })} placeholder="가맹점명" /></label>
    <div className="form-grid"><label>금액<input type="number" min="1" value={draft.amount || ''} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} /></label><label>결제수단<select value={draft.card} onChange={(e) => setDraft({ ...draft, card: e.target.value })}><option>현대 네이버</option><option>현대 Red</option><option>신한</option><option>현금</option><option>계좌이체</option></select></label></div>
    <label>카테고리<select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
    <div className="checks"><label><input type="checkbox" checked={draft.living} onChange={(e) => setDraft({ ...draft, living: e.target.checked })} />생활비 포함</label><label><input type="checkbox" checked={draft.fixed} onChange={(e) => setDraft({ ...draft, fixed: e.target.checked })} />고정비</label><label><input type="checkbox" checked={draft.performanceIncluded} onChange={(e) => setDraft({ ...draft, performanceIncluded: e.target.checked })} />카드 실적 포함</label><label><input type="checkbox" checked={draft.cashFlow} onChange={(e) => setDraft({ ...draft, cashFlow: e.target.checked })} />현금흐름 반영</label></div>
    <label>메모<input value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} placeholder="선택 사항" /></label>
    {warning && <p className="duplicate-warning">날짜·시간·카드·가맹점·금액이 같은 거래가 있습니다. 그래도 추가하려면 저장을 한 번 더 누르세요.</p>}
    <button className="primary" type="submit">저장</button>
  </form></div>
}

function PageTitle({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>
}

function DailyBars({ rows, cutoff }: { rows: Transaction[]; cutoff: string }) {
  const days = Array.from({ length: Number(cutoff.slice(8, 10)) }, (_, i) => i + 1)
  const totals = days.map((day) => rows.filter((row) => row.living && Number(row.date.slice(8, 10)) === day).reduce((sum, row) => sum + row.amount, 0))
  const max = Math.max(...totals, 1)
  return <div className="daily-chart" aria-label="일별 생활비 그래프">{days.map((day, i) => <div key={day} title={`${day}일 ${won(totals[i])}`}><i style={{ height: `${Math.max(3, totals[i] / max * 100)}%` }} className={day === days.at(-1) ? 'today' : ''} /><span>{day % 5 === 0 || day === 1 ? day : ''}</span></div>)}</div>
}

function Dashboard({ rows, cutoff, hidden, loans, settings, setTab }: { rows: Transaction[]; cutoff: string; hidden: boolean; loans: Loan[]; settings: FinanceSettings; setTab: (tab: TabId) => void }) {
  const living = rows.filter((row) => row.living).reduce((sum, row) => sum + row.amount, 0)
  const extra = loans.reduce((sum, loan) => sum + loan.extraPayment, 0)
  const week = weekAllowance(rows, cutoff, extra, settings.weeklyBase)
  const categoryTotals = Object.keys(settings.categoryBudgets).map((name) => ({ name, value: rows.filter((row) => row.living && row.category === name).reduce((sum, row) => sum + row.amount, 0) }))
  const uncategorized = rows.filter((row) => row.category === '미분류').length
  const day = Math.max(1, Number(cutoff.slice(8, 10)))
  const projected = Math.round(living / day * 31)
  const paceTarget = Math.round(settings.monthlyPaceTarget / 31 * day)
  const paceGap = living - paceTarget
  const savingsPotential = Math.max(0, settings.livingCap - projected)
  const adjustable = categoryTotals.filter((item) => ['커피·간식', '외식·여가·개인', '생활용품·잡비'].includes(item.name)).sort((a, b) => b.value - a.value)[0]
  const payoffTarget = [...loans].filter((loan) => loan.balance > 0).sort((a, b) => b.rate - a.rate)[0]
  return <>
    <PageTitle eyebrow="JULY REPLAY" title={`${Number(cutoff.slice(8, 10))}일 현재 자금 현황`} copy="선택한 날짜까지 발생한 거래만으로 모든 수치를 다시 계산합니다." action={<button className="primary" onClick={() => setTab('transactions')}><Plus />거래 추가</button>} />
    <section className="hero-grid">
      <article className="hero dark"><div><span>이번 주 사용 가능액</span><h2><Money value={week.currentAvailable} hidden={hidden} /></h2><p>기본 주간금액 {won(settings.weeklyBase)} + 이전 주 이월</p></div><Ring value={week.currentAvailable ? week.spent / week.currentAvailable * 100 : 0} label="이번 주" color="#e9ad54" /><div className="week-formula"><span>이번 주 사용 <b><Money value={week.spent} hidden={hidden} /></b></span><span>잔여/초과 <b className={week.remaining < 0 ? 'danger' : ''}><Money value={week.remaining} hidden={hidden} /></b></span><span>다음 주 가능 <b><Money value={week.nextAvailable} hidden={hidden} /></b></span></div></article>
      <article className="hero"><div className="panel-label"><span>7월 생활비</span><b>{settings.livingCap ? Math.round(living / settings.livingCap * 100) : 0}%</b></div><h2><Money value={living} hidden={hidden} /></h2><p>월 한도 {won(settings.livingCap)} · 남은 금액 {won(settings.livingCap - living)}</p><div className="progress"><i style={{ width: `${settings.livingCap ? Math.min(100, living / settings.livingCap * 100) : 0}%` }} /></div>{uncategorized > 0 && <button className="notice" onClick={() => setTab('transactions')}>{uncategorized}건의 카테고리를 확인하세요</button>}</article>
    </section>
    <section className={`focus-alert ${paceGap > 0 ? 'warning' : 'good'}`}><div><span>{paceGap > 0 ? '지출 속도 경고' : '절감 흐름 양호'}</span><h3>{paceGap > 0 ? `현재 속도는 권장선보다 ${won(paceGap)} 빠릅니다` : `현재 속도를 유지하면 ${won(savingsPotential)}을 확보할 수 있습니다`}</h3><p>월말 예상 생활비 {won(projected)} · {adjustable ? `가장 큰 조절 가능 지출은 ${adjustable.name} ${won(adjustable.value)}` : '조절 가능 지출이 아직 없습니다'}</p></div><div><span>현금 확보 다음 목표</span><b>{payoffTarget?.name || '대출 정보 없음'}</b><small>완납 시 월 {won(payoffTarget?.actualPayment || 0)}의 현금흐름 확보</small></div></section>
    <section className="metrics"><article><span>현재까지 거래</span><b>{rows.length}건</b><small>취소건 제외</small></article><article><span>카드 사용 합계</span><b><Money value={rows.filter((r) => r.performanceIncluded).reduce((s, r) => s + r.amount, 0)} hidden={hidden} /></b><small>사용자 제외 거래 미포함</small></article><article><span>고정비 실제</span><b><Money value={rows.filter((r) => r.fixed).reduce((s, r) => s + r.amount, 0)} hidden={hidden} /></b><small>결제일과 무관한 월 누계</small></article></section>
    <section className="two-col"><article className="panel"><div className="section-head"><div><span className="eyebrow">DAILY FLOW</span><h3>일별 생활비</h3></div><BarChart3 /></div><DailyBars rows={rows} cutoff={cutoff} /></article><article className="panel"><div className="section-head"><div><span className="eyebrow">CATEGORY</span><h3>카테고리별 사용</h3></div></div><div className="category-list">{categoryTotals.filter((c) => c.value > 0).sort((a, b) => b.value - a.value).slice(0, 6).map((item, index) => <div key={item.name}><i style={{ background: colors[index] }} /><span>{item.name}</span><b><Money value={item.value} hidden={hidden} /></b></div>)}</div></article></section>
  </>
}

function Transactions({ rows, hidden, onEdit, onDelete, onAdd, onImport }: { rows: Transaction[]; hidden: boolean; onEdit: (row: Transaction) => void; onDelete: (id: string) => void; onAdd: () => void; onImport: (file: File) => void }) {
  const [query, setQuery] = useState('')
  const pending = rows.filter((row) => row.category === '미분류')
  const filtered = pending.filter((row) => `${row.merchant} ${row.card}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
  return <><PageTitle eyebrow="CLASSIFICATION INBOX" title={`미분류 거래 ${pending.length}건`} copy="분류가 필요한 거래만 표시됩니다. 카테고리를 확정해 저장하면 이 목록에서 바로 사라집니다." action={<div className="title-actions"><label className="secondary upload-button" aria-label="엑셀 내역 업로드"><Upload />엑셀 내역 업로드<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { const file = e.target.files?.[0]; if (file) onImport(file); e.target.value = '' }} /></label><button className="primary" onClick={onAdd}><Plus />직접 입력</button></div>} /><article className="panel">{pending.length > 0 ? <><label className="search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="가맹점·카드 검색" /></label><div className="tx-table"><div className="tx-header"><span>날짜</span><span>가맹점</span><span>상태</span><span>금액</span><span /></div>{filtered.map((row) => <div className="tx-row" key={row.id}><span>{row.date.slice(5).replace('-', '.')}<small>{row.time}</small></span><span><b>{row.merchant}</b><small>{row.card} · {row.source === '직접 입력' ? '직접 입력' : '업로드'}</small></span><span><em className="pending-tag">분류 필요</em><small>수정 버튼에서 카테고리 선택</small></span><strong><Money value={row.amount} hidden={hidden} /></strong><span className="row-actions"><button onClick={() => onEdit(row)} aria-label="분류"><Pencil /></button><button className="delete" onClick={() => onDelete(row.id)} aria-label="삭제"><Trash2 /></button></span></div>)}</div></> : <div className="empty-state"><div>✓</div><h3>미분류 거래가 없습니다</h3><p>새 거래를 입력하거나 엑셀을 올리면 분류가 필요한 내역만 이곳에 나타납니다.</p></div>}</article></>
}

function Budget({ rows, hidden, settings }: { rows: Transaction[]; hidden: boolean; settings: FinanceSettings }) {
  const items = Object.entries(settings.categoryBudgets).map(([name, budget]) => ({ name, budget, spent: rows.filter((r) => r.living && r.category === name).reduce((s, r) => s + r.amount, 0) }))
  const spent = items.reduce((s, i) => s + i.spent, 0)
  return <><PageTitle eyebrow="BUDGET" title="생활비 예산" copy="월 예산과 실제 사용 속도를 카테고리별로 비교합니다." /><article className="budget-summary panel"><Ring value={settings.livingCap ? spent / settings.livingCap * 100 : 0} label="월 한도" /><div><span>현재 생활비</span><h2><Money value={spent} hidden={hidden} /></h2><p>{won(settings.livingCap)} 중 {won(settings.livingCap - spent)} 남음</p></div></article><article className="panel budget-list">{items.map((item, i) => <div key={item.name}><i style={{ background: colors[i] }} /><span>{item.name}</span><b><Money value={item.spent} hidden={hidden} /> <small>/ {won(item.budget)}</small></b><div className="progress"><i style={{ width: `${item.budget ? Math.min(100, item.spent / item.budget * 100) : 0}%`, background: colors[i] }} /></div><em>{item.budget ? Math.round(item.spent / item.budget * 100) : 0}%</em></div>)}</article></>
}

function Cards({ rows, hidden, settings }: { rows: Transaction[]; hidden: boolean; settings: FinanceSettings }) {
  const items = ['현대 네이버', '신한', '현대 Red'].map((name) => ({ name, target: name === '현대 Red' ? 0 : settings.cardTarget, spent: rows.filter((r) => r.card === name && r.performanceIncluded).reduce((s, r) => s + r.amount, 0) }))
  return <><PageTitle eyebrow="CARD PERFORMANCE" title="카드 실적" copy="모든 카드 거래는 기본 포함되며, 제외할 거래만 거래 수정에서 체크를 해제합니다." /><section className="card-grid">{items.map((card) => <article className={`pay-card ${card.name.includes('Red') ? 'red' : card.name.includes('신한') ? 'blue' : ''}`} key={card.name}><CreditCard /><span>{card.name}</span><h2><Money value={card.spent} hidden={hidden} /></h2><p>{card.target ? `목표 ${won(card.target)} · ${Math.round(card.spent / card.target * 100)}%` : '별도 실적 목표 없음'}</p>{card.target > 0 && <div className="progress"><i style={{ width: `${Math.min(100, card.spent / card.target * 100)}%` }} /></div>}</article>)}</section></>
}

function FixedCosts({ rows, hidden, plans, setPlans, loans, setLoans, settings }: { rows: Transaction[]; hidden: boolean; plans: FixedPlan[]; setPlans: (plans: FixedPlan[]) => void; loans: Loan[]; setLoans: (loans: Loan[]) => void; settings: FinanceSettings }) {
  const [rateDates, setRateDates] = useState<Record<string, string>>({})
  const actualTx = rows.filter((r) => r.fixed).reduce((s, r) => s + r.amount, 0)
  const loanActual = loans.filter((loan) => loan.repaymentType !== 'overdraft').reduce((sum, loan) => sum + loan.actualPayment, 0)
  const overdraftReserve = loans.filter((loan) => loan.repaymentType === 'overdraft').reduce((sum, loan) => sum + loan.actualPayment, 0)
  const otherActual = plans.reduce((sum, item) => sum + item.actual, 0)
  const totalFixed = loanActual + otherActual
  const expectedLoans = loans.filter((loan) => loan.repaymentType !== 'overdraft').reduce((sum, loan) => sum + estimateMonthlyPayment(loan), 0)
  const updateLoan = (id: string, values: Partial<Loan>) => setLoans(loans.map((loan) => loan.id === id ? { ...loan, ...values } : loan))
  const updateExtra = (loan: Loan, value: number) => updateLoan(loan.id, { balance: Math.max(0, loan.balance - (value - loan.extraPayment)), extraPayment: value })
  const applyRate = (loan: Loan) => {
    const effectiveDate = rateDates[loan.id] || new Date().toISOString().slice(0, 10)
    const calculated = estimateMonthlyPayment(loan)
    updateLoan(loan.id, { plannedPayment: calculated, rateHistory: [...loan.rateHistory, { effectiveDate, rate: loan.rate }] })
  }
  const groups: Array<{ id: FixedPlan['group']; title: string; copy: string }> = [
    { id: 'insurance', title: '보험', copy: '계좌이체와 카드결제를 분리해 카드 실적 중복을 막습니다.' },
    { id: 'housing', title: '주거', copy: '관리비·수도·가스 변동을 포함한 월 예산입니다.' },
    { id: 'communication', title: '통신', copy: '휴대폰 실제 청구액을 입력합니다.' },
    { id: 'savings', title: '연금·청약', copy: '소비와 구분되는 저축성 고정지출입니다.' },
  ]
  return <><PageTitle eyebrow="FIXED COST CONTROL" title="고정비와 대출" copy="지출을 줄여 현금을 확보하고, 대출을 끝내 월 현금흐름을 늘리는 데 초점을 맞춥니다." /><section className="metrics"><article><span>이번 달 고정비</span><b><Money value={totalFixed} hidden={hidden} /></b><small>급여의 {settings.salary ? Math.round(totalFixed / settings.salary * 100) : 0}% · 마통 이자 별도</small></article><article><span>확정 대출 납부액</span><b><Money value={loanActual} hidden={hidden} /></b><small>금리 기준 예상 {won(expectedLoans)}</small></article><article><span>보험·주거·통신 등</span><b><Money value={otherActual} hidden={hidden} /></b><small>마통 최대이자 예비 {won(overdraftReserve)} · 카드 확인 {won(actualTx)}</small></article></section>
    <article className="panel fixed-section"><div className="section-head"><div><span className="eyebrow">DEBT SCHEDULE</span><h3>대출 상세</h3></div><span className="section-note">평소에는 핵심 금액만 표시됩니다</span></div><div className="loan-cards">{loans.map((loan) => { const calculated = estimateMonthlyPayment(loan); const gap = loan.actualPayment - calculated; return <details className="loan-detail" key={loan.id}><summary className="loan-summary-row"><div><b>{loan.name}</b><span>{loan.repaymentType === 'overdraft' ? '한도 전액 기준 이자' : loan.maturity}</span></div><div><span>현재 잔여금액</span><strong><Money value={loan.balance} hidden={hidden} /></strong></div><div><span>월 상환액</span><strong><Money value={loan.actualPayment} hidden={hidden} /></strong></div><div><span>금리</span><strong>{loan.rate}%</strong></div><span className="edit-toggle">수정하기</span></summary><div className="loan-editor-body"><div className="loan-values"><label>대출금액<input type="number" value={loan.originalPrincipal} onChange={(e) => updateLoan(loan.id, { originalPrincipal: Number(e.target.value) })} /></label><label>현재 잔여금액<input type="number" value={loan.balance} onChange={(e) => updateLoan(loan.id, { balance: Number(e.target.value) })} /></label><label>월 실제 상환액<input type="number" value={loan.actualPayment} onChange={(e) => updateLoan(loan.id, { actualPayment: Number(e.target.value) })} /></label><label>추가상환<input type="number" value={loan.extraPayment || ''} placeholder="0" onChange={(e) => updateExtra(loan, Number(e.target.value))} /></label></div><div className="calculated-payment"><span>현재 조건 자동 계산</span><b><Money value={calculated} hidden={hidden} /></b><small className={Math.abs(gap) > 1000 ? 'warn-text' : ''}>실제액과 {gap >= 0 ? '+' : ''}{won(gap)} 차이</small></div><div className="rate-change"><label>변경 금리<input type="number" step="0.0001" value={loan.rate} onChange={(e) => updateLoan(loan.id, { rate: Number(e.target.value) })} /></label><label>적용일<input type="date" value={rateDates[loan.id] || '2026-08-26'} onChange={(e) => setRateDates({ ...rateDates, [loan.id]: e.target.value })} /></label><button className="secondary" onClick={() => applyRate(loan)}>금리 적용</button></div>{loan.rateHistory.length > 0 && <div className="rate-history"><b>금리 이력</b>{loan.rateHistory.map((point, index) => <p key={`${point.effectiveDate}-${index}`}>{point.effectiveDate} · {point.rate}%</p>)}</div>}</div></details> })}</div></article>
    {groups.map((group) => { const items = plans.filter((item) => item.group === group.id); return <article className="panel fixed-section" key={group.id}><div className="section-head"><div><span className="eyebrow">{group.id.toUpperCase()}</span><h3>{group.title}</h3><p>{group.copy}</p></div><b>{won(items.reduce((sum, item) => sum + item.actual, 0))}</b></div><div className="fixed-detail-table"><div><span>항목</span><span>결제수단</span><span>예정액</span><span>실제액</span></div>{items.map((item) => <div key={item.id}><span><b>{item.name}</b>{item.variable && <small>변동</small>}</span><span>{item.method}</span><input type="number" value={item.planned} onChange={(e) => setPlans(plans.map((x) => x.id === item.id ? { ...x, planned: Number(e.target.value) } : x))} /><input type="number" value={item.actual} onChange={(e) => setPlans(plans.map((x) => x.id === item.id ? { ...x, actual: Number(e.target.value) } : x))} /></div>)}</div></article> })}
  </>
}

function ConnectionSettings({ endpoint, setEndpoint, token, setToken, onLoad, onSave, status }: { endpoint: string; setEndpoint: (value: string) => void; token: string; setToken: (value: string) => void; onLoad: () => void; onSave: () => void; status: string }) {
  return <><PageTitle eyebrow="GOOGLE DRIVE" title="기기 간 데이터 연결" copy="Apps Script 웹앱 주소와 기기 토큰을 등록하면 iPhone과 PC에서 같은 Drive 데이터를 사용합니다." /><article className="panel settings-card"><label>Apps Script 웹앱 주소<input type="url" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" /></label><label>기기 토큰<input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="설치할 때 만든 20자 이상의 토큰" /></label><p>토큰은 이 기기에만 저장되며 GitHub 코드에는 포함되지 않습니다. 카드 전체번호·CVC·계좌 비밀번호는 입력하지 않습니다.</p><div className="settings-actions"><button className="secondary" onClick={onLoad}>Drive에서 불러오기</button><button className="primary" onClick={onSave}>현재 데이터를 Drive에 저장</button></div>{status && <div className="sync-status">{status}</div>}</article></>
}

export function FinanceApp() {
  const [tab, setTab] = useState<TabId>('home'), [menu, setMenu] = useState(false), [hidden, setHidden] = useState(false)
  const [cutoff, setCutoff] = useState('2026-07-15'), [allRows, setAllRows] = useState<Transaction[]>([]), [loans, setLoans] = useState(DEFAULT_LOANS)
  const [fixedPlans, setFixedPlans] = useState<FixedPlan[]>(FIXED_PLAN)
  const [settings, setSettings] = useState<FinanceSettings>(EMPTY_SETTINGS)
  const [endpoint, setEndpoint] = useState(''), [token, setToken] = useState(''), [syncStatus, setSyncStatus] = useState('')
  const [editing, setEditing] = useState<Transaction | null>(null), [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const hydrate = async () => {
      let seedRows: Transaction[] = []
      let seedConfig: { settings?: FinanceSettings; loans?: Loan[]; fixedPlans?: FixedPlan[] } = {}
      try { const response = await fetch(`${BASE_PATH}/private-preview-data.json`); if (response.ok) seedRows = await response.json() } catch { /* public build intentionally has no private seed */ }
      try { const response = await fetch(`${BASE_PATH}/private-preview-config.json`); if (response.ok) seedConfig = await response.json() } catch { /* public build intentionally has no private seed */ }
      const savedRows = localStorage.getItem('flow-preview-transactions'), savedLoans = localStorage.getItem('flow-preview-loans'), savedFixed = localStorage.getItem('flow-preview-fixed'), savedSettings = localStorage.getItem('flow-preview-settings')
      setAllRows(savedRows ? JSON.parse(savedRows) : seedRows)
      setLoans(normalizeLoans(savedLoans ? JSON.parse(savedLoans) : (seedConfig.loans || DEFAULT_LOANS)))
      setFixedPlans(normalizeFixed(savedFixed ? JSON.parse(savedFixed) : (seedConfig.fixedPlans || FIXED_PLAN)))
      setSettings(savedSettings ? JSON.parse(savedSettings) : (seedConfig.settings || EMPTY_SETTINGS))
      setEndpoint(localStorage.getItem('flow-drive-endpoint') || '')
      setToken(localStorage.getItem('flow-drive-token') || '')
      setLoaded(true)
    }
    hydrate()
  }, [])
  useEffect(() => { if (loaded) localStorage.setItem('flow-preview-transactions', JSON.stringify(allRows)) }, [allRows, loaded])
  useEffect(() => { if (loaded) localStorage.setItem('flow-preview-loans', JSON.stringify(loans)) }, [loans, loaded])
  useEffect(() => { if (loaded) { localStorage.setItem('flow-preview-fixed', JSON.stringify(fixedPlans)); localStorage.setItem('flow-drive-endpoint', endpoint); localStorage.setItem('flow-drive-token', token) } }, [fixedPlans, endpoint, token, loaded])
  useEffect(() => { if (loaded) localStorage.setItem('flow-preview-settings', JSON.stringify(settings)) }, [settings, loaded])
  const rows = useMemo(() => allRows.filter((row) => row.date <= cutoff), [allRows, cutoff])
  const duplicate = (value: Transaction) => allRows.some((row) => row.id !== value.id && row.date === value.date && row.time === value.time && row.card === value.card && normalizeMerchant(row.merchant) === normalizeMerchant(value.merchant) && row.amount === value.amount)
  const save = (value: Transaction) => { setAllRows((current) => current.some((row) => row.id === value.id) ? current.map((row) => row.id === value.id ? value : row) : [...current, value]); return true }
  const deleteRow = (id: string) => { if (confirm('이 거래를 완전히 삭제할까요? 같은 내역을 다시 업로드하면 다시 추가됩니다.')) setAllRows((current) => current.filter((row) => row.id !== id)) }
  const loadDrive = async () => { try { setSyncStatus('Drive에서 불러오는 중…'); const data = await loadDriveSnapshot(endpoint, token); setAllRows(data.transactions || []); setLoans(normalizeLoans(data.loans || [])); setFixedPlans(normalizeFixed(data.fixedPlans || [])); setSettings(data.settings || EMPTY_SETTINGS); setSyncStatus(`불러오기 완료 · ${new Date().toLocaleTimeString('ko-KR')}`) } catch (error) { setSyncStatus(error instanceof Error ? error.message : '불러오기에 실패했습니다.') } }
  const saveDrive = async () => { try { setSyncStatus('Drive에 저장하는 중…'); await saveDriveSnapshot(endpoint, token, { transactions: allRows, loans, fixedPlans, settings, cashFlow: 0 }); setSyncStatus(`저장 완료 · ${new Date().toLocaleTimeString('ko-KR')}`) } catch (error) { setSyncStatus(error instanceof Error ? error.message : '저장에 실패했습니다.') } }
  const importFile = async (file: File) => {
    try {
      const imported = await parseCardWorkbook(file)
      let skipped = 0
      const additions = imported.filter((candidate) => {
        const exists = allRows.some((row) => row.date === candidate.date && row.time === candidate.time && row.card === candidate.card && normalizeMerchant(row.merchant) === normalizeMerchant(candidate.merchant) && row.amount === candidate.amount)
        if (exists) skipped += 1
        return !exists
      })
      setAllRows((current) => [...current, ...additions])
      alert(`${additions.length}건을 추가하고, 이미 반영된 ${skipped}건은 제외했습니다.`)
    } catch (error) { alert(error instanceof Error ? error.message : '파일을 읽지 못했습니다.') }
  }
  return <div className="app-shell"><ServiceWorkerRegister />
    {menu && <button className="scrim" onClick={() => setMenu(false)} aria-label="메뉴 닫기" />}
    <aside className={`sidebar ${menu ? 'open' : ''}`}><div className="brand"><div>F</div><span><b>Flow</b><small>나의 자금관리</small></span></div><nav>{nav.map(([id, label, Icon]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setMenu(false) }}><Icon /><span>{label}</span></button>)}</nav><div className="sync"><span>데이터 저장 구조</span><b>{endpoint ? 'Google Drive 연결됨' : 'Google Drive 연결 필요'}</b><small>{endpoint ? '설정에서 불러오기·저장' : '연결 설정에서 주소 등록'}</small></div></aside>
    <main><header><button className="icon-btn mobile" onClick={() => setMenu(true)}><Menu /></button><label className="cutoff"><CalendarDays /><span>테스트 날짜</span><input type="date" min="2026-07-01" max="2026-07-31" value={cutoff} onChange={(e) => setCutoff(e.target.value)} /></label><span className="test-badge">7월 재현 테스트</span><button className="icon-btn" onClick={() => setHidden(!hidden)} aria-label="금액 가리기">{hidden ? <EyeOff /> : <Eye />}</button></header>
      <div className="content">{!loaded ? <div className="loading">데이터를 불러오는 중…</div> : tab === 'home' ? <Dashboard rows={rows} cutoff={cutoff} hidden={hidden} loans={loans} settings={settings} setTab={setTab} /> : tab === 'transactions' ? <Transactions rows={rows} hidden={hidden} onEdit={setEditing} onDelete={deleteRow} onAdd={() => setEditing(emptyTx())} onImport={importFile} /> : tab === 'budget' ? <Budget rows={rows} hidden={hidden} settings={settings} /> : tab === 'cards' ? <Cards rows={rows} hidden={hidden} settings={settings} /> : tab === 'fixed' ? <FixedCosts rows={rows} hidden={hidden} plans={fixedPlans} setPlans={setFixedPlans} loans={loans} setLoans={setLoans} settings={settings} /> : <ConnectionSettings endpoint={endpoint} setEndpoint={setEndpoint} token={token} setToken={setToken} onLoad={loadDrive} onSave={saveDrive} status={syncStatus} />}</div>
    </main><nav className="bottom-nav">{nav.slice(0, 5).map(([id, label, Icon]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon /><span>{label}</span></button>)}</nav>
    {editing && <TransactionModal value={editing} onClose={() => setEditing(null)} onSave={save} duplicate={duplicate} />}
  </div>
}
