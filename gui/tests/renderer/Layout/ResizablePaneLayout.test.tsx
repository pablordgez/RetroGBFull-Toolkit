import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ResizablePaneLayout } from '../../../src/renderer/src/components/Layout/ResizablePaneLayout'

const setBounds = (element: HTMLElement, bounds: Partial<DOMRect>) => {
  element.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: bounds.right ?? 400,
      bottom: bounds.bottom ?? 400,
      width: bounds.width ?? 400,
      height: bounds.height ?? 400,
      toJSON: () => ({})
    }) as DOMRect
}

describe('ResizablePaneLayout', () => {
  afterEach(() => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  it('renders a vertical end pane and clamps pointer resizing', () => {
    const { container } = render(
      <ResizablePaneLayout pane={<aside>Inspector</aside>} initialPaneSize={220} minPaneSize={120}>
        <main>Scene</main>
      </ResizablePaneLayout>
    )
    const layout = container.firstElementChild as HTMLElement
    const pane = container.querySelector('.resizable-pane-layout__pane') as HTMLElement
    const handle = screen.getByRole('separator', { name: 'Resize pane' })

    setBounds(layout, { bottom: 500, height: 500 })
    fireEvent(window, new Event('resize'))

    expect(layout).toHaveClass('resizable-pane-layout--vertical')
    expect(layout).toHaveStyle({ flexDirection: 'column' })
    expect(handle).toHaveAttribute('aria-orientation', 'horizontal')
    expect(pane).toHaveStyle({ height: '120px', order: '2' })

    fireEvent.pointerDown(handle, { clientY: 100 })
    expect(document.body.style.cursor).toBe('ns-resize')
    expect(document.body.style.userSelect).toBe('none')
    expect(pane).toHaveStyle({ height: '300px' })

    fireEvent.pointerMove(window, { clientY: 490 })
    expect(pane).toHaveStyle({ height: '120px' })
    fireEvent.pointerUp(window)
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })

  it('renders a horizontal start pane with a custom class and ignores move events before drag', () => {
    const { container } = render(
      <ResizablePaneLayout
        pane={<aside>Assets</aside>}
        direction="horizontal"
        panePosition="start"
        initialPaneSize={160}
        minPaneSize={100}
        maxPaneSizeRatio={0.5}
        resizeHandleLabel="Resize assets"
        className="workspace-layout"
      >
        <main>Editor</main>
      </ResizablePaneLayout>
    )
    const layout = container.firstElementChild as HTMLElement
    const pane = container.querySelector('.resizable-pane-layout__pane') as HTMLElement
    const content = container.querySelector('.resizable-pane-layout__content') as HTMLElement
    const handle = screen.getByRole('separator', { name: 'Resize assets' })

    setBounds(layout, { right: 360, width: 360 })
    fireEvent.pointerMove(window, { clientX: 340 })

    expect(layout).toHaveClass('workspace-layout')
    expect(layout).toHaveStyle({ flexDirection: 'row' })
    expect(content).toHaveStyle({ order: '2' })
    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(pane).toHaveStyle({ width: '100px', order: '0' })

    fireEvent.pointerDown(handle, { clientX: 340 })
    expect(document.body.style.cursor).toBe('ew-resize')
    expect(pane).toHaveStyle({ width: '180px' })
  })
})
