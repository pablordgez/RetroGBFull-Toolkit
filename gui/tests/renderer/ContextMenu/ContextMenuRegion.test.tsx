import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ContextMenuOption,
  ContextMenuRegion
} from '../../../src/renderer/src/components/ContextMenu/ContextMenuRegion'

const renderContextMenuRegion = (options: ContextMenuOption[]) => {
  return render(
    <ContextMenuRegion options={options}>
      <div data-testid="context-menu-target">Target</div>
    </ContextMenuRegion>
  )
}

describe('<ContextMenuRegion />', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens a context menu on right click', () => {
    renderContextMenuRegion([{ id: 'new', label: 'New...' }])

    fireEvent.contextMenu(screen.getByTestId('context-menu-target'), {
      clientX: 80,
      clientY: 120
    })

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'New...' })).toBeInTheDocument()
  })

  it('shows submenu options on hover', () => {
    renderContextMenuRegion([
      {
        id: 'new',
        label: 'New...',
        children: [{ id: 'folder', label: 'Folder' }, { id: 'script', label: 'Script' }]
      }
    ])

    fireEvent.contextMenu(screen.getByTestId('context-menu-target'), {
      clientX: 80,
      clientY: 120
    })
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'New...' }))

    expect(screen.getByRole('menuitem', { name: 'Folder' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Script' })).toBeInTheDocument()
  })

  it('closes the context menu on left click outside the menu', () => {
    renderContextMenuRegion([{ id: 'new', label: 'New...' }])

    fireEvent.contextMenu(screen.getByTestId('context-menu-target'), {
      clientX: 80,
      clientY: 120
    })

    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByTestId('context-menu-target'), { button: 0 })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens upward when there is not enough space below the cursor', () => {
    vi.stubGlobal('innerHeight', 300)

    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if ((this as HTMLElement).classList.contains('context-menu-region__popup')) {
        return {
          x: 0,
          y: 0,
          width: 190,
          height: 120,
          top: 0,
          right: 190,
          bottom: 120,
          left: 0,
          toJSON: () => ''
        }
      }

      return originalGetBoundingClientRect.call(this)
    })

    renderContextMenuRegion([{ id: 'new', label: 'New...' }])

    fireEvent.contextMenu(screen.getByTestId('context-menu-target'), {
      clientX: 80,
      clientY: 260
    })

    expect(screen.getByRole('menu').parentElement).toHaveStyle({
      top: '140px'
    })
  })

  it('flips the submenu upward when the submenu would overflow below the viewport', () => {
    vi.stubGlobal('innerHeight', 320)

    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const element = this as HTMLElement

      if (element.classList.contains('context-menu-region__popup')) {
        return {
          x: 0,
          y: 0,
          width: 190,
          height: 56,
          top: 0,
          right: 190,
          bottom: 56,
          left: 0,
          toJSON: () => ''
        }
      }

      if (element.classList.contains('context-menu-region__item')) {
        return {
          x: 80,
          y: 252,
          width: 172,
          height: 46,
          top: 252,
          right: 252,
          bottom: 298,
          left: 80,
          toJSON: () => ''
        }
      }

      if (element.classList.contains('context-menu-region__submenu')) {
        return {
          x: 249,
          y: 241,
          width: 190,
          height: 160,
          top: 241,
          right: 439,
          bottom: 401,
          left: 249,
          toJSON: () => ''
        }
      }

      return originalGetBoundingClientRect.call(this)
    })

    renderContextMenuRegion([
      {
        id: 'new',
        label: 'New...',
        children: [{ id: 'folder', label: 'Folder' }, { id: 'script', label: 'Script' }]
      }
    ])

    fireEvent.contextMenu(screen.getByTestId('context-menu-target'), {
      clientX: 80,
      clientY: 280
    })
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'New...' }))

    expect(document.querySelector('.context-menu-region__submenu')).toHaveClass(
      'context-menu-region__submenu--up'
    )
  })

  it('flips the submenu left when the submenu would overflow past the right edge', () => {
    vi.stubGlobal('innerWidth', 360)

    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const element = this as HTMLElement

      if (element.classList.contains('context-menu-region__item')) {
        return {
          x: 230,
          y: 120,
          width: 110,
          height: 46,
          top: 120,
          right: 340,
          bottom: 166,
          left: 230,
          toJSON: () => ''
        }
      }

      if (element.classList.contains('context-menu-region__submenu')) {
        return {
          x: 337,
          y: 109,
          width: 160,
          height: 120,
          top: 109,
          right: 497,
          bottom: 229,
          left: 337,
          toJSON: () => ''
        }
      }

      return originalGetBoundingClientRect.call(this)
    })

    renderContextMenuRegion([
      {
        id: 'new',
        label: 'New...',
        children: [{ id: 'folder', label: 'Folder' }, { id: 'script', label: 'Script' }]
      }
    ])

    fireEvent.contextMenu(screen.getByTestId('context-menu-target'), {
      clientX: 220,
      clientY: 120
    })
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'New...' }))

    expect(document.querySelector('.context-menu-region__submenu')).toHaveClass(
      'context-menu-region__submenu--left'
    )
  })
})
