import { fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUndoRedoShortcuts } from '../../../src/renderer/src/components/hooks/history/useUndoRedoShortcuts'

describe('useUndoRedoShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps a single keydown listener while using the latest undo and redo callbacks', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const initialUndo = vi.fn()
    const initialRedo = vi.fn()

    const { rerender } = renderHook(
      ({
        undo,
        redo
      }: {
        undo: () => void
        redo: () => void
      }) => useUndoRedoShortcuts(undo, redo),
      {
        initialProps: {
          undo: initialUndo,
          redo: initialRedo
        }
      }
    )

    expect(addEventListenerSpy).toHaveBeenCalledTimes(1)
    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(removeEventListenerSpy).not.toHaveBeenCalled()

    const nextUndo = vi.fn()
    const nextRedo = vi.fn()

    rerender({
      undo: nextUndo,
      redo: nextRedo
    })

    expect(addEventListenerSpy).toHaveBeenCalledTimes(1)
    expect(removeEventListenerSpy).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })

    expect(initialUndo).not.toHaveBeenCalled()
    expect(initialRedo).not.toHaveBeenCalled()
    expect(nextUndo).toHaveBeenCalledTimes(1)
    expect(nextRedo).toHaveBeenCalledTimes(2)
  })

  it('only handles shortcuts for events originating inside the provided container', () => {
    const container = document.createElement('div')
    const insideButton = document.createElement('button')
    const outsideButton = document.createElement('button')
    const undo = vi.fn()
    const redo = vi.fn()

    container.appendChild(insideButton)
    document.body.appendChild(container)
    document.body.appendChild(outsideButton)

    const containerRef = { current: container }

    renderHook(() => useUndoRedoShortcuts(undo, redo, { containerRef }))

    insideButton.focus()
    fireEvent.keyDown(insideButton, { key: 'z', ctrlKey: true })

    outsideButton.focus()
    fireEvent.keyDown(outsideButton, { key: 'z', ctrlKey: true })

    expect(undo).toHaveBeenCalledTimes(1)
    expect(redo).not.toHaveBeenCalled()

    container.remove()
    outsideButton.remove()
  })
})
