import { useEffect } from 'react'

interface UseUndoRedoShortcutsOptions {
  enabled?: boolean
  ignoreEditableTargets?: boolean
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || target.isContentEditable
}

export const useUndoRedoShortcuts = (
  undo: () => void | Promise<void>,
  redo: () => void | Promise<void>,
  options?: UseUndoRedoShortcutsOptions
) => {
  const { enabled = true, ignoreEditableTargets = false } = options ?? {}

  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleKeys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return
      }

      if (ignoreEditableTargets && isEditableTarget(event.target)) {
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
