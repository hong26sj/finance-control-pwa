'use client'

import { useEffect } from 'react'

export function FixedSectionInteractions() {
  useEffect(() => {
    let timer: number | undefined

    const isMoneyInput = (input: HTMLInputElement | null) => {
      if (!input) return false
      if (input.dataset.flowMoneyInput === '1') return true
      return input.matches('.loan-values input[type="number"], .fixed-detail-table input[type="number"], .modal .form-grid input[type="number"]')
    }

    const rawDigits = (value: string) => value.replace(/[^0-9]/g, '')
    const formatDigits = (value: string) => {
      const digits = rawDigits(value)
      if (!digits) return ''
      return Number(digits).toLocaleString('ko-KR')
    }

    const formatMoneyInput = (input: HTMLInputElement) => {
      if (!isMoneyInput(input)) return
      input.dataset.flowMoneyInput = '1'
      if (input.type !== 'text') input.type = 'text'
      input.inputMode = 'numeric'
      input.pattern = '[0-9,]*'
      const formatted = formatDigits(input.value)
      if (input.value !== formatted) input.value = formatted
    }

    const syncMoneyInputs = () => {
      document.querySelectorAll<HTMLInputElement>('.loan-values input, .fixed-detail-table input, .modal .form-grid input').forEach((input) => {
        if (isMoneyInput(input)) formatMoneyInput(input)
      })
    }

    const syncSections = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>('.fixed-section'))
      syncMoneyInputs()
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

    const onBeforeInput = (event: InputEvent) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null
      if (!isMoneyInput(input) || !input) return

      if (input.type !== 'text') input.type = 'text'
      const current = input.value
      if (!current.includes(',')) return

      const selectionStart = input.selectionStart ?? current.length
      const selectionEnd = input.selectionEnd ?? selectionStart
      const rawStart = rawDigits(current.slice(0, selectionStart)).length
      const rawEnd = rawDigits(current.slice(0, selectionEnd)).length
      input.value = rawDigits(current)
      try { input.setSelectionRange(rawStart, rawEnd) } catch { /* selection is best-effort */ }
    }

    const onInput = (event: Event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null
      if (isMoneyInput(input) && input) {
        window.setTimeout(() => {
          formatMoneyInput(input)
          try { input.setSelectionRange(input.value.length, input.value.length) } catch { /* selection is best-effort */ }
        }, 0)
      }
      scheduleSync()
    }

    const onFocusOut = (event: FocusEvent) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null
      if (isMoneyInput(input) && input) formatMoneyInput(input)
    }

    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('beforeinput', onBeforeInput as EventListener, true)
    document.addEventListener('input', onInput)
    document.addEventListener('focusout', onFocusOut)
    scheduleSync()

    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('beforeinput', onBeforeInput as EventListener, true)
      document.removeEventListener('input', onInput)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  return null
}
