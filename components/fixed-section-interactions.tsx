'use client'

import { useEffect } from 'react'

export function FixedSectionInteractions() {
  useEffect(() => {
    const syncSections = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>('.fixed-section'))
      if (!sections.length) return

      const loanTotalText = document.querySelector<HTMLElement>('.metrics article:nth-child(2) b')?.textContent?.trim() || ''

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

          const toggleSection = () => {
            const collapsed = section.classList.toggle('fixed-collapsed')
            header.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
          }

          header.addEventListener('click', toggleSection)
          header.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            toggleSection()
          })
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
          total.textContent = loanTotalText || '0원'
        }
      })
    }

    syncSections()
    const observer = new MutationObserver(syncSections)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  return null
}
