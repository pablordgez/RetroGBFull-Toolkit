import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

let isConfigured = false

export const configureMonaco = (): void => {
  if (isConfigured) {
    return
  }

  ;(globalThis as typeof globalThis & {
    MonacoEnvironment?: {
      getWorker: (_moduleId: string, label: string) => Worker
    }
  }).MonacoEnvironment = {
    getWorker: (_moduleId: string, _label: string) => new editorWorker()
  }

  loader.config({ monaco })
  isConfigured = true
}
