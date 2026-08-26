import type { Metadata, Viewport } from 'next'
import { Manrope, Noto_Sans_KR } from 'next/font/google'
import { BudgetInteractions } from '@/components/budget-interactions'
import { PrivacyRuntime } from '@/components/privacy-runtime'
import './globals.css'
import './mobile-fixes.css'
import './budget-interactions.css'

const manrope = Manrope({ subsets: ['latin'], variable: '--font-number' })
const noto = Noto_Sans_KR({ subsets: ['latin'], variable: '--font-body' })
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
      <body className={`${manrope.variable} ${noto.variable}`}><PrivacyRuntime />{children}<BudgetInteractions /></body>
    </html>
  )
}
