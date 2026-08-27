export const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
export const compactWon = (value: number) => value >= 10_000 ? `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}만원` : won(value)

export type TabId = 'home' | 'transactions' | 'budget' | 'cards' | 'fixed' | 'loans' | 'settings'
export type Transaction = {
  id: string; date: string; time: string; card: string; merchant: string; amount: number
  category: string; living: boolean; fixed: boolean; performanceIncluded: boolean
  cashFlow: boolean; cashAdvance?: boolean; source: string; memo: string
  merchantHash?: string
}
export type MerchantRule = { category: string; ambiguous: boolean; categories: string[] }
export type RatePoint = { effectiveDate: string; rate: number }
export type Loan = {
  id: string; name: string; originalPrincipal: number; balance: number; rate: number
  plannedPayment: number; actualPayment: number; extraPayment: number; maturity: string
  repaymentType: 'equal-payment' | 'equal-principal' | 'interest-only' | 'overdraft' | 'manual'
  remainingMonths: number; limit?: number; interestBasis?: 'balance' | 'limit'; rateHistory: RatePoint[]
}
export type FixedPlan = { id: string; group: 'insurance' | 'housing' | 'communication' | 'savings'; name: string; method: string; planned: number; actual: number; variable?: boolean }
export type FinanceSettings = {
  weeklyBase: number; livingCap: number; monthlyPaceTarget: number; salary: number
  cardTarget: number; categoryBudgets: Record<string, number>
}

export const CATEGORIES = ['평일 점심', '식비·장보기', '커피·간식', '교통·주차', '생활용품·잡비', '외식·여가·개인', '생활비 예비금', '고정비', '미분류']
export const EMPTY_SETTINGS: FinanceSettings = {
  weeklyBase: 0, livingCap: 0, monthlyPaceTarget: 0, salary: 0, cardTarget: 0,
  categoryBudgets: Object.fromEntries(CATEGORIES.filter((item) => item !== '고정비' && item !== '미분류').map((item) => [item, 0])),
}
export const DEFAULT_LOANS: Loan[] = []
export const FIXED_PLAN: FixedPlan[] = []

export function estimateMonthlyPayment(loan: Loan) {
  if (loan.repaymentType === 'manual') return loan.plannedPayment
  const monthlyRate = loan.rate / 100 / 12
  if (loan.repaymentType === 'overdraft' || loan.repaymentType === 'interest-only') {
    const basis = loan.interestBasis === 'limit' ? (loan.limit || loan.balance) : loan.balance
    return Math.round(basis * monthlyRate)
  }
  if (loan.remainingMonths <= 0) return loan.plannedPayment
  if (loan.repaymentType === 'equal-principal') return Math.round(loan.balance / loan.remainingMonths + loan.balance * monthlyRate)
  if (monthlyRate === 0) return Math.round(loan.balance / loan.remainingMonths)
  const factor = Math.pow(1 + monthlyRate, loan.remainingMonths)
  return Math.round(loan.balance * monthlyRate * factor / (factor - 1))
}
export function mondayOf(dateText: string) {
  const date = new Date(`${dateText}T12:00:00`)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return date.toISOString().slice(0, 10)
}
export function weekAllowance(rows: Transaction[], cutoff: string, extraRepayment: number, weeklyBase: number) {
  const living = rows.filter((row) => row.living && row.date <= cutoff)
  const weeks = [...new Set(living.map((row) => mondayOf(row.date)).concat(mondayOf(cutoff)))].sort()
  let available = weeklyBase, spent = 0, carry = 0
  for (const week of weeks) {
    spent = living.filter((row) => mondayOf(row.date) === week).reduce((sum, row) => sum + row.amount, 0)
    carry = available - spent
    if (week !== weeks.at(-1)) available = weeklyBase + carry
  }
  const currentAvailable = available - extraRepayment
  return { currentAvailable, spent, remaining: currentAvailable - spent, nextAvailable: weeklyBase + currentAvailable - spent }
}
export const normalizeMerchant = (value: string) => value.toLowerCase().replace(/\s|[-_()]/g, '')
export function classifyMerchant(merchant: string, cashAdvance = false) {
  const m = merchant.toLowerCase()
  if (cashAdvance) return { category: '생활용품·잡비', living: true, fixed: false, cashFlow: true }
  if (/보험|아파트관리비|kt통신요금|귀뚜라미에너지/.test(m)) return { category: '고정비', living: false, fixed: true, cashFlow: false }
  if (/푸드포커스|푸드 포커스|더이룸푸드/.test(m)) return { category: '평일 점심', living: true, fixed: false, cashFlow: false }
  if (/gs25|세븐일레븐|씨유|cu|이마트24|마트|정육|쿠팡_쿠페이|쿠팡\(쿠페이\)/.test(m)) return { category: '식비·장보기', living: true, fixed: false, cashFlow: false }
  if (/커피|ciao|차오|뚜레쥬르|카카오페이메가/.test(m)) return { category: '커피·간식', living: true, fixed: false, cashFlow: false }
  if (/카카오t|택시|티머니|코레일|더스윙/.test(m)) return { category: '교통·주차', living: true, fixed: false, cashFlow: false }
  if (/다이소|올리브영|워시스왓|병원|의원|한의원|약국|고이장례/.test(m)) return { category: '생활용품·잡비', living: true, fixed: false, cashFlow: false }
  if (/쿠팡이츠|우아한형제들|김밥|국수|해장국|분식|삼계탕|유부|호텔|볼링|비어|시네마|여기어때|넷플릭스|웨이브|교보문고/.test(m)) return { category: '외식·여가·개인', living: true, fixed: false, cashFlow: false }
  if (/chatgpt|openai|구글클라우드/.test(m)) return { category: '생활용품·잡비', living: true, fixed: false, cashFlow: false }
  return { category: '미분류', living: true, fixed: false, cashFlow: false }
}
