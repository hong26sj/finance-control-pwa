'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_APPS_SCRIPT_URL } from '@/lib/drive-api'
import { Transaction } from '@/lib/finance'

const TRANSACTIONS_KEY = 'flow-preview-transactions'
const NOTICE_KEY = 'flow-shortcut-sync-notice'
const STAGE_KEY = 'flow-shortcut-staged-transactions'

type PendingShortcutTransaction = Transaction & { createdAt?: string }

async function request(endpoint: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(endpoint || DEFAULT_APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, auth_token: token }),
  })
  const result = await response.json().catch(() => null)
  if (!result?.ok) throw new Error(result?.message || result?.error || 'shortcut sync failed')
  return result
}

function readRows(): Transaction[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readStage(): PendingShortcutTransaction[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function isDuplicate(rows: Transaction[], candidate: PendingShortcutTransaction) {
  return rows.some((row) =>
    row.id === candidate.id ||
    (row.date === candidate.date &&
      row.time === candidate.time &&
      row.card === candidate.card &&
      row.amount === candidate.amount &&
      String(row.merchant || '').trim() === String(candidate.merchant || '').trim())
  )
}

function needsShortcutReview(row: Transaction) {
  return row.source === 'iOS 카드알림 OCR' && row.merchantCategoryConfirmed !== true
}

function asReviewRow(row: PendingShortcutTransaction): PendingShortcutTransaction {
  if (!needsShortcutReview(row)) return row
  return {
    ...row,
    category: '미분류',
    living: true,
    fixed: false,
    merchantCategoryAuto: row.merchantCategoryAuto === true,
  }
}

function mergeStage(items: PendingShortcutTransaction[]) {
  const existing = readStage()
  const merged = [...existing]
  items.forEach((item) => {
    if (!isDuplicate(merged, item)) merged.push(item)
  })
  localStorage.setItem(STAGE_KEY, JSON.stringify(merged))
  return merged
}

export function ShortcutInboxSync() {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let syncing = false
    let stopped = false
    const inheritedSetItem = Storage.prototype.setItem

    try {
      const staged = readStage().map(asReviewRow)
      if (staged.length) {
        const rows = readRows()
        const additions = staged.filter((item) => !isDuplicate(rows, item))
        if (additions.length) localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([...rows, ...additions]))
      }
    } catch { /* ignore malformed legacy storage */ }

    try {
      const rows = readRows()
      let changed = false
      const reviewed = rows.map((row) => {
        const next = asReviewRow(row)
        if (next !== row) changed = true
        return next
      })
      if (changed) inheritedSetItem.call(localStorage, TRANSACTIONS_KEY, JSON.stringify(reviewed))
    } catch { /* ignore malformed legacy storage */ }

    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage && key === TRANSACTIONS_KEY) {
        try {
          const previous = readRows()
          const previousById = new Map(previous.map((row) => [row.id, row]))
          const next = JSON.parse(value) as Transaction[]
          if (Array.isArray(next)) {
            value = JSON.stringify(next.map((row) => {
              const before = previousById.get(row.id)
              if (
                row.source === 'iOS 카드알림 OCR' &&
                before?.category === '미분류' &&
                row.category !== '미분류'
              ) {
                return { ...row, merchantCategoryAuto: false, merchantCategoryConfirmed: true }
              }
              return row
            }))
          }
        } catch { /* keep original value */ }
      }
      return inheritedSetItem.call(this, key, value)
    }

    const showPendingNotice = () => {
      const notice = sessionStorage.getItem(NOTICE_KEY)
      if (!notice) return
      sessionStorage.removeItem(NOTICE_KEY)
      window.setTimeout(() => window.alert(notice), 250)
    }

    const sync = async (manual = false) => {
      if (syncing || stopped || document.visibilityState === 'hidden') return
      const token = localStorage.getItem('flow-drive-token') || ''
      if (!token) {
        setStatus('Drive 인증 필요')
        if (manual) window.alert('카드알림을 가져오려면 홈 화면 Flow의 연결 설정에서 Drive 인증을 다시 해주세요.\n\nPWA를 삭제하거나 재설치할 필요는 없습니다.')
        return
      }

      const endpoint = localStorage.getItem('flow-drive-endpoint') || DEFAULT_APPS_SCRIPT_URL
      syncing = true
      setBusy(true)
      if (manual) setStatus('확인 중…')

      try {
        const result = await request(endpoint, token, { action: 'shortcut.pending.get' })
        const pending = (Array.isArray(result.items) ? result.items : []) as PendingShortcutTransaction[]
        if (!pending.length) {
          setStatus('대기 거래 없음')
          if (manual) window.alert('서버에 대기 중인 카드알림 거래가 없습니다.')
          return
        }

        const before = readRows()
        const additions = pending
          .filter((item) => !isDuplicate(before, item))
          .map(asReviewRow)

        if (additions.length) {
          mergeStage(additions)
          localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([...before, ...additions]))
        }

        // Never acknowledge the server queue until the installed PWA can read every item
        // back from its own localStorage. This protects the Home Screen PWA from losing an
        // import even if React hydration or another storage writer runs at the same time.
        const stored = readRows()
        const verified = pending.filter((item) => isDuplicate(stored, asReviewRow(item)))
        if (verified.length !== pending.length) {
          throw new Error(`로컬 저장 확인 실패 (${verified.length}/${pending.length})`)
        }

        await request(endpoint, token, { action: 'shortcut.pending.ack', ids: verified.map((item) => item.id) })

        if (additions.length) {
          const total = additions.reduce((sum, item) => sum + Number(item.amount || 0), 0)
          sessionStorage.setItem(NOTICE_KEY, `카드 알림 ${additions.length}건 동기화 완료\n${total.toLocaleString('ko-KR')}원\n거래 탭에서 카테고리를 확인하세요.`)
          setStatus(`${additions.length}건 저장 완료`)
          window.setTimeout(() => window.location.reload(), 150)
        } else {
          setStatus('이미 로컬에 반영됨')
          if (manual) window.alert('대기 거래는 홈 화면 Flow의 로컬 데이터에 이미 반영되어 있습니다.')
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '카드알림 동기화 실패'
        setStatus(message)
        if (manual) window.alert(`카드알림 동기화 실패\n${message}\n\n서버 대기 거래는 삭제하지 않고 유지합니다.`)
      } finally {
        syncing = false
        setBusy(false)
      }
    }

    ;(window as Window & { flowShortcutSync?: (manual?: boolean) => Promise<void> }).flowShortcutSync = sync

    showPendingNotice()
    const timer = window.setTimeout(() => void sync(false), 1800)
    const retry = window.setInterval(() => void sync(false), 10000)
    const onVisible = () => { if (document.visibilityState === 'visible') window.setTimeout(() => void sync(false), 300) }
    const onPageShow = () => window.setTimeout(() => void sync(false), 300)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)

    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.clearInterval(retry)
      delete (window as Window & { flowShortcutSync?: (manual?: boolean) => Promise<void> }).flowShortcutSync
      Storage.prototype.setItem = inheritedSetItem
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  const runManual = () => {
    const fn = (window as Window & { flowShortcutSync?: (manual?: boolean) => Promise<void> }).flowShortcutSync
    if (fn) void fn(true)
  }

  return (
    <button
      type="button"
      onClick={runManual}
      disabled={busy}
      aria-label="카드알림 동기화"
      title={status || '카드알림 동기화'}
      style={{
        position: 'fixed',
        right: '14px',
        bottom: 'calc(78px + env(safe-area-inset-bottom))',
        zIndex: 120,
        border: '1px solid #d7ded9',
        borderRadius: '999px',
        background: '#fff',
        color: '#173c30',
        boxShadow: '0 4px 16px rgba(16,28,24,.12)',
        padding: '8px 12px',
        fontSize: '11px',
        fontWeight: 700,
        opacity: busy ? .6 : 1,
      }}
    >
      {busy ? '동기화 중…' : '카드알림 가져오기'}
    </button>
  )
}
