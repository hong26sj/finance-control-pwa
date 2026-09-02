'use client'

import { useEffect } from 'react'

export function FixedSectionInteractions() {
  useEffect(() => {
    let timer: number | undefined

    const syncSections = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>('.fixed-section'))
      if (!sections.length) return

      const loanTotalText = document.querySelector<HTMLElement>('.metrics article:nth-child(2) b')?.textContent?.trim() || '0원'

      sections.forEach((section) => {
        const header = section.querySelector<HTMLElement>(':scope > .section-head')
        if (!header) return

        const isDebt = header.querySelector('.eyebrow')?.textContent?.trim() === 'DEBT SCHEDULE'

        if (!section.dataset.collapseReady) {
          section.dataset.collapseReady = '1'
          section.classList.add('fixed-collapsible', 'fixed-collapsed')
          header.classList.add('fixed-collapse-head')
          header.setAttribute('role', 'button')
          header.setAttribute('tabindex', '0')
          header.setAttribute('aria-expanded', 'false')

          const toggle = document.createElement('span')
          toggle.className = 'fixed-collapse-chevron'
          toggle.setAttribute('aria-hidden', 'true')
          toggle.textContent = '⌄'
          header.appendChild(toggle)
        }

        if (isDebt) {
          const note = header.querySelector<HTMLElement>('.section-note')
          if (note) note.hidden = true

          let total = header.querySelector<HTMLElement>('.fixed-debt-total')
          if (!total) {
            total = document.createElement('b')
            total.className = 'fixed-debt-total'
            const chevron = header.querySelector('.fixed-collapse-chevron')
            header.insertBefore(total, chevron || null)
          }
          if (total.textContent !== loanTotalText) total.textContent = loanTotalText
        }
      })
    }

    const scheduleSync = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(syncSections, 0)
    }

    const toggleHeader = (header: HTMLElement) => {
      const section = header.closest<HTMLElement>('.fixed-section.fixed-collapsible')
      if (!section) return
      const collapsed = section.classList.toggle('fixed-collapsed')
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const header = target?.closest<HTMLElement>('.fixed-collapse-head')
      if (header) {
        if (target?.closest('input,button,a,select,textarea')) return
        toggleHeader(header)
        return
      }
      scheduleSync()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const header = target?.closest<HTMLElement>('.fixed-collapse-head')
      if (!header || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      toggleHeader(header)
    }

    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeyDown)
    scheduleSync()

    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return null
}
