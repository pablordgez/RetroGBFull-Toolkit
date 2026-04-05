import { type RefObject, useEffect, useRef } from 'react'
import { isEditableElementTarget } from '../../utils/keyboardShortcuts'

interface UseUndoRedoShortcutsOptions {
  enabled?: boolean
  ignoreEditableTargets?: boolean
  containerRef?: RefObject<HTMLElement | null>
}

export const useUndoRedoShortcuts = (
  undo: () => void | Promise<void>,
  redo: () => void | Promise<void>,
  options?: UseUndoRedoShortcutsOptions
): void => {
  const { enabled = true, ignoreEditableTargets = false, containerRef } = options ?? {}
  const undoRef = useRef(undo)
  const redoRef = useRef(redo)

  useEffect(() => {
    undoRef.current = undo
    redoRef.current = redo
  }, [redo, undo])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleKeys = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) {
        return
      }

      const container = containerRef?.current

      if (container) {
        const eventTarget = event.target instanceof Node ? event.target : null
        const activeElement = document.activeElement
        const isWithinContainer =
          eventTarget === container ||
          (eventTarget !== null && container.contains(eventTarget)) ||
          activeElement === container ||
          (activeElement !== null && container.contains(activeElement))

        if (!isWithinContainer) {
          return
        }
      }

      if (ignoreEditableTargets && isEditableElementTarget(event.target)) {
        return
      }

      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        void (event.shiftKey ? redoRef.current() : undoRef.current())
        return
      }

      if (event.key.toLowerCase() === 'y') {
        event.preventDefault()
        void redoRef.current()
      }
    }

    window.addEventListener('keydown', handleKeys)
    return () => window.removeEventListener('keydown', handleKeys)
  }, [containerRef, enabled, ignoreEditableTargets])
}
