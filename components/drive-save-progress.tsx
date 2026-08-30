'use client'

import { useEffect, useRef, useState } from 'react'

type ProgressState = { visible: boolean; progress: number; stage: string; state: 'saving' | 'done' | 'error' }

export function DriveSaveProgress() {
  const [status, setStatus] = useState<ProgressState>({ visible: false, progress: 0, stage: '', state: 'saving' })
  const hideTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
      const next: ProgressState = {
        visible: true,
        progress: Math.max(0, Math.min(100, Number(detail.progress || 0))),
        stage: String(detail.stage || '저장 중'),
        state: detail.state === 'done' ? 'done' : detail.state === 'error' ? 'error' : 'saving',
      }
      setStatus(next)
      if (next.state === 'done') hideTimer.current = window.setTimeout(() => setStatus((current) => ({ ...current, visible: false })), 650)
      if (next.state === 'error') hideTimer.current = window.setTimeout(() => setStatus((current) => ({ ...current, visible: false })), 2200)
    }
    window.addEventListener('flow-drive-save-progress', onProgress)
    return () => {
      window.removeEventListener('flow-drive-save-progress', onProgress)
      if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
    }
  }, [])

  if (!status.visible) return null
  return <div className={`drive-save-progress-global ${status.state}`} role="status" aria-live="polite">
    <div><span>{status.stage}</span><b>{status.progress}%</b></div>
    <div className="drive-save-progress-global-track"><i style={{ width: `${status.progress}%` }} /></div>
  </div>
}
