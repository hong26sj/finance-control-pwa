import type { Metadata, Viewport } from 'next'
import { BudgetInteractions } from '@/components/budget-interactions'
import { FixedSectionInteractions } from '@/components/fixed-section-interactions'
import { PrivacyRuntime } from '@/components/privacy-runtime'
import { TransactionBulkInteractions } from '@/components/transaction-bulk-interactions'
import { FinancePolicyInteractions } from '@/components/finance-policy-interactions'
import { CardDetailInteractions } from '@/components/card-detail-interactions'
import './globals.css'
import './mobile-fixes.css'
import './budget-interactions.css'
import './preview-baseline.css'
import './fixed-section-interactions.css'
import './calendar-position-fix.css'
import './typography-system.css'
import './transaction-bulk.css'
import './finance-policy-interactions.css'
import './card-detail-interactions.css'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

export const metadata: Metadata = {
  title: 'Flow — 실시간 자금관리 PWA',
  description: '가계부, 주간 사용 가능액, 카드 실적, 고정비와 대출 상환을 한 화면에서 관리합니다.',
  applicationName: 'Flow',
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Flow' },
  icons: { icon: `${basePath}/icon.svg`, apple: `${basePath}/icon.svg` },
}

export const viewport: Viewport = {
  themeColor: '#101c18',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body><PrivacyRuntime />{children}<BudgetInteractions /><FixedSectionInteractions /><TransactionBulkInteractions /><FinancePolicyInteractions /><CardDetailInteractions /></body>
    </html>
  )
}
