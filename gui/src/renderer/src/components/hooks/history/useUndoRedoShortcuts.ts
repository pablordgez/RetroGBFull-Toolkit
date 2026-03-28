import { useEffect } from 'react'
import { isEditableElementTarget } from '../../utils/keyboardShortcuts'

interface UseUndoRedoShortcutsOptions {
  enabled?: boolean
  ignoreEditableTargets?: boolean
}

export const useUndoRedoShortcuts = (
  undo: () => void | Promise<void>,
  redo: () => void | Promise<void>,
  options?: UseUndoRedoShortcutsOptions
): void => {
  const { enabled = true, ignoreEditableTargets = false } = options ?? {}

  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleKeys = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) {
        return
      }

      if (ignoreEditableTargets && isEditableElementTarget(event.target)) {
        return
      }

      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        void (event.shiftKey ? redo() : undo())
        return
      }

      if (event.key.toLowerCase() === 'y') {
        event.preventDefault()
        void redo()
      }
    }

    window.addEventListener('keydown', handleKeys)
    return () => window.removeEventListener('keydown', handleKeys)
  }, [enabled, ignoreEditableTargets, redo, undo])
}
