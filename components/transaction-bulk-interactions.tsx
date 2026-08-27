'use client'

import { useEffect } from 'react'
import { CATEGORIES, Transaction } from '@/lib/finance'

const TRANSACTIONS_KEY = 'flow-preview-transactions'

export function TransactionBulkInteractions() {
  useEffect(() => {
    const selected = new Set<string>()
    let viewportOriginal = ''
    let viewportLocked = false

    const isInbox = () => document.querySelector('.page-title .eyebrow')?.textContent?.trim() === 'CLASSIFICATION INBOX'

    const readRows = () => {
      try {
        const rows = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]') as Transaction[]
        return Array.isArray(rows) ? rows : []
      } catch {
        return []
      }
    }

    const filteredPending = () => {
      const query = (document.querySelector('.search input') as HTMLInputElement | null)?.value?.toLowerCase() || ''
      return readRows()
        .filter((row) => row.category === '미분류')
        .filter((row) => `${row.merchant} ${row.card}`.toLowerCase().includes(query))
        .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
    }

    const updateToolbar = () => {
      const toolbar = document.querySelector<HTMLElement>('.bulk-category-toolbar')
      if (!toolbar) return
      const count = toolbar.querySelector<HTMLElement>('[data-bulk-count]')
      const apply = toolbar.querySelector<HTMLButtonElement>('[data-bulk-apply]')
      const all = toolbar.querySelector<HTMLInputElement>('[data-bulk-all]')
      const visibleIds = filteredPending().map((row) => row.id)
      if (count) count.textContent = `${selected.size}건 선택`
      if (apply) apply.disabled = selected.size === 0
      if (all) {
        const selectedVisible = visibleIds.filter((id) => selected.has(id)).length
        all.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length
        all.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length
      }
    }

    const ensureToolbar = () => {
      const panel = document.querySelector('.search')?.parentElement
      if (!panel || panel.querySelector('.bulk-category-toolbar')) return

      const toolbar = document.createElement('div')
      toolbar.className = 'bulk-category-toolbar'
      const options = CATEGORIES.filter((category) => category !== '미분류')
        .map((category) => `<option value="${category}">${category}</option>`)
        .join('')
      toolbar.innerHTML = `
        <label class="bulk-all-label"><input type="checkbox" data-bulk-all><span>현재 목록 전체</span></label>
        <span class="bulk-selected-count" data-bulk-count>0건 선택</span>
        <select data-bulk-category aria-label="일괄 지정 카테고리">
          <option value="">카테고리 선택</option>${options}
        </select>
        <button type="button" class="primary bulk-apply" data-bulk-apply disabled>선택 항목 적용</button>
      `
      const table = panel.querySelector('.tx-table')
      panel.insertBefore(toolbar, table || null)
      updateToolbar()
    }

    const syncRows = () => {
      if (!isInbox()) return
      ensureToolbar()
      const data = filteredPending()
      const domRows = [...document.querySelectorAll<HTMLElement>('.tx-table .tx-row')]
      domRows.forEach((rowEl, index) => {
        const tx = data[index]
        if (!tx) return
        rowEl.dataset.transactionId = tx.id
        rowEl.classList.add('bulk-selectable')
        let checkbox = rowEl.querySelector<HTMLInputElement>('.bulk-row-check')
        if (!checkbox) {
          checkbox = document.createElement('input')
          checkbox.type = 'checkbox'
          checkbox.className = 'bulk-row-check'
          checkbox.setAttribute('aria-label', '거래 선택')
          rowEl.appendChild(checkbox)
        }
        checkbox.dataset.transactionId = tx.id
        checkbox.checked = selected.has(tx.id)
      })
      updateToolbar()
    }

    const applyBulkCategory = () => {
      const category = (document.querySelector('[data-bulk-category]') as HTMLSelectElement | null)?.value || ''
      if (!category || selected.size === 0) return
      const fixed = category === '고정비'
      const next = readRows().map((row) => selected.has(row.id)
        ? { ...row, category, living: !fixed, fixed }
        : row)
      localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(next))
      selected.clear()
      window.location.reload()
    }

    const lockViewportForSearch = () => {
      const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
      if (!viewport || viewportLocked) return
      viewportOriginal = viewport.content
      const stripped = viewport.content
        .split(',')
        .map((part) => part.trim())
        .filter((part) => !/^maximum-scale=/i.test(part) && !/^user-scalable=/i.test(part))
      viewport.content = [...stripped, 'maximum-scale=1', 'user-scalable=no'].join(', ')
      viewportLocked = true
    }

    const restoreViewport = () => {
      if (!viewportLocked) return
      const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
      if (viewport && viewportOriginal) viewport.content = viewportOriginal
      viewportLocked = false
    }

    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-bulk-apply]')) {
        applyBulkCategory()
        return
      }
      const all = target?.closest('[data-bulk-all]') as HTMLInputElement | null
      if (all) {
        const visible = filteredPending()
        if (all.checked) visible.forEach((row) => selected.add(row.id))
        else visible.forEach((row) => selected.delete(row.id))
        syncRows()
      }
    }

    const onChange = (event: Event) => {
      const target = event.target as HTMLInputElement | null
      if (target?.classList.contains('bulk-row-check')) {
        const id = target.dataset.transactionId
        if (!id) return
        if (target.checked) selected.add(id)
        else selected.delete(id)
        updateToolbar()
      }
    }

    const onInput = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('.search input')) window.setTimeout(syncRows, 0)
    }

    const onPointerDown = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('.search input')) lockViewportForSearch()
    }

    const onFocusOut = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('.search input')) window.setTimeout(restoreViewport, 80)
    }

    document.addEventListener('click', onClick)
    document.addEventListener('change', onChange)
    document.addEventListener('input', onInput)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('touchstart', onPointerDown, true)
    document.addEventListener('focusout', onFocusOut)

    const timer = window.setInterval(syncRows, 350)
    syncRows()

    return () => {
      window.clearInterval(timer)
      restoreViewport()
      document.removeEventListener('click', onClick)
      document.removeEventListener('change', onChange)
      document.removeEventListener('input', onInput)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('touchstart', onPointerDown, true)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  return null
}
