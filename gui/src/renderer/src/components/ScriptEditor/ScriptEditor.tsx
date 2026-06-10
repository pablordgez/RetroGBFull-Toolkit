import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as MonacoEditor from 'monaco-editor'
import { useSearchParams } from 'react-router-dom'
import { EditorClosePrompt } from '../ProjectAssets/EditorClosePrompt'
import { toProjectCodeWorkspaceUri } from '../../../../shared/projectCodeWorkspace'
import { PROJECT_SCRIPT_LABELS, type ProjectScriptKind } from '../../../../shared/projectScripts'
import { configureMonaco } from './configureMonaco'
import type { ScriptEditorRuntimeSession } from './scriptEditorRuntime'
import {
  shouldDeferInitialRuntimeForScript,
  shouldDeferRuntimeUntilEdit
} from './scriptEditorRuntimePolicy'
import './ScriptEditor.css'

type ScriptEditorTab = 'source' | 'header'
type ScriptEditorStatusTone = 'info' | 'error'
type ScriptEditorTheme = 'light' | 'dark'

const EMPTY_MONACO_MODEL_SENTINEL = '\n'

const buildSnapshot = (editableSourceContent: string, headerContent: string): string => {
  return JSON.stringify({ editableSourceContent, headerContent })
}

const toMonacoEditorValue = (value: string): string => {
  return value.length === 0 ? EMPTY_MONACO_MODEL_SENTINEL : value
}

const fromMonacoEditorValue = (value: string | undefined, currentValue: string): string => {
  const nextValue = value ?? ''

  if (currentValue.length === 0 && nextValue === EMPTY_MONACO_MODEL_SENTINEL) {
    return ''
  }

  return nextValue
}

const isProjectScriptKind = (value: string | null): value is ProjectScriptKind => {
  return value === 'actor' || value === 'scene' || value === 'general'
}

export const ScriptEditor = (): ReactElement => {
  const [searchParams] = useSearchParams()
  const projectPath = searchParams.get('projectPath') ?? ''
  const resourcePath = searchParams.get('resourcePath') ?? ''
  const scriptKindParam = searchParams.get('scriptKind')
  const scriptKind = isProjectScriptKind(scriptKindParam) ? scriptKindParam : null
  const [activeTab, setActiveTab] = useState<ScriptEditorTab>('source')
  const [displayName, setDisplayName] = useState('Script')
  const [sourcePath, setSourcePath] = useState(resourcePath)
  const [headerPath, setHeaderPath] = useState('')
  const [managedSourcePrefix, setManagedSourcePrefix] = useState('')
  const [editableSourceContent, setEditableSourceContent] = useState('')
  const [headerContent, setHeaderContent] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasUserEditedSinceLoad, setHasUserEditedSinceLoad] = useState(false)
  const [isClosePromptOpen, setIsClosePromptOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusTone, setStatusTone] = useState<ScriptEditorStatusTone>('info')
  const editorRef = useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(null)
  const runtimeSessionRef = useRef<ScriptEditorRuntimeSession | null>(null)
  const managedSourcePrefixRef = useRef('')
  const editableSourceContentRef = useRef('')
  const headerContentRef = useRef('')
  const activeTabRef = useRef<ScriptEditorTab>('source')
  const [isEditorReady, setIsEditorReady] = useState(false)
  const [isRuntimeStartAllowed, setIsRuntimeStartAllowed] = useState(false)
  const [theme, setTheme] = useState<ScriptEditorTheme>('light')
  const [hasLoadedThemePreference, setHasLoadedThemePreference] = useState(false)

  const isScriptBacked = projectPath.length > 0 && resourcePath.length > 0 && scriptKind !== null
  const isDirty =
    savedSnapshot !== null && buildSnapshot(editableSourceContent, headerContent) !== savedSnapshot

  useEffect(() => {
    let isCancelled = false

    const loadThemePreference = async (): Promise<void> => {
      try {
        const preferences = await window.api.getAppPreferences()

        if (!isCancelled) {
          setTheme(preferences.scriptEditorTheme)
        }
      } catch (error) {
        console.warn('[script-editor] failed to load theme preference', error)
      } finally {
        if (!isCancelled) {
          setHasLoadedThemePreference(true)
        }
      }
    }

    void loadThemePreference()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hasLoadedThemePreference) {
      return
    }

    void window.api.saveAppPreferences({ scriptEditorTheme: theme }).catch((error) => {
      console.warn('[script-editor] failed to save theme preference', error)
    })
  }, [hasLoadedThemePreference, theme])

  useEffect(() => {
    configureMonaco()
  }, [])

  useEffect(() => {
    managedSourcePrefixRef.current = managedSourcePrefix
  }, [managedSourcePrefix])

  useEffect(() => {
    editableSourceContentRef.current = editableSourceContent
  }, [editableSourceContent])

  useEffect(() => {
    headerContentRef.current = headerContent
  }, [headerContent])

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    let isCancelled = false

    const loadScript = async (): Promise<void> => {
      setIsRuntimeStartAllowed(false)
      setHasUserEditedSinceLoad(false)
      setIsLoaded(false)

      if (!isScriptBacked || !scriptKind) {
        setStatusTone('error')
        setStatusMessage('This window was opened without a valid script resource.')
        setIsLoaded(true)
        return
      }

      try {
        const payload = await window.api.loadProjectScriptResource(
          projectPath,
          resourcePath,
          scriptKind
        )

        if (isCancelled) {
          return
        }

        setDisplayName(payload.displayName)
        setSourcePath(payload.sourcePath)
        setHeaderPath(payload.headerPath)
        setManagedSourcePrefix(payload.managedSourcePrefix)
        setEditableSourceContent(payload.editableSourceContent)
        setHeaderContent(payload.headerContent)
        setSavedSnapshot(buildSnapshot(payload.editableSourceContent, payload.headerContent))
        setIsRuntimeStartAllowed(
          !shouldDeferInitialRuntimeForScript(
            payload.scriptKind,
            payload.editableSourceContent
          )
        )
        setStatusMessage(null)
        setStatusTone('info')
      } catch (error) {
        console.error('[script-editor] loadProjectScriptResource failed', error)
        setStatusTone('error')
        setStatusMessage(
          error instanceof Error ? error.message : 'Something went wrong while loading the script.'
        )
      } finally {
        if (!isCancelled) {
          setIsLoaded(true)
        }
      }
    }

    void loadScript()

    return () => {
      isCancelled = true
    }
  }, [isScriptBacked, projectPath, resourcePath, scriptKind])

  useEffect(() => {
    if (
      isRuntimeStartAllowed ||
      !isLoaded ||
      !isScriptBacked ||
      !scriptKind ||
      shouldDeferRuntimeUntilEdit(scriptKind, editableSourceContent, hasUserEditedSinceLoad)
    ) {
      return
    }

    setIsRuntimeStartAllowed(true)
  }, [
    editableSourceContent,
    hasUserEditedSinceLoad,
    isLoaded,
    isRuntimeStartAllowed,
    isScriptBacked,
    scriptKind
  ])

  useEffect(() => {
    editorRef.current?.focus()
  }, [activeTab])

  useEffect(() => {
    if (
      !isLoaded ||
      !isEditorReady ||
      !isRuntimeStartAllowed ||
      !isScriptBacked ||
      !sourcePath ||
      !headerPath ||
      !scriptKind
    ) {
      return
    }

    let isDisposed = false

    const startRuntime = async (): Promise<void> => {
      const [{ createScriptEditorRuntime }, workspaceSnapshot] = await Promise.all([
        import('./scriptEditorRuntime'),
        window.api.getProjectCodeWorkspaceSnapshot(projectPath)
      ])

      if (isDisposed) {
        return
      }

      const runtimeSession = await createScriptEditorRuntime({
        workspaceSnapshot,
        sourcePath,
        managedSourcePrefix: managedSourcePrefixRef.current,
        editableSourceContent: editableSourceContentRef.current,
        headerPath,
        headerContent: headerContentRef.current,
        activeTab: activeTabRef.current
      })

      if (isDisposed) {
        await runtimeSession.dispose()
        return
      }

      runtimeSessionRef.current = runtimeSession
      setStatusMessage(null)
      setStatusTone('info')
    }

    void startRuntime().catch((error) => {
      console.error('[script-editor] failed to start language service', error)
      setStatusTone('error')
      setStatusMessage(
        error instanceof Error
          ? `Code intelligence failed to start: ${error.message}`
          : 'Code intelligence failed to start.'
      )
    })

    return () => {
      isDisposed = true
      const runtimeSession = runtimeSessionRef.current
      runtimeSessionRef.current = null

      if (runtimeSession) {
        void runtimeSession.dispose()
      }
    }
  }, [
    headerPath,
    isEditorReady,
    isLoaded,
    isRuntimeStartAllowed,
    isScriptBacked,
    managedSourcePrefix,
    projectPath,
    scriptKind,
    sourcePath
  ])

  useEffect(() => {
    runtimeSessionRef.current?.setActiveTab(activeTab)
  }, [activeTab])

  useEffect(() => {
    runtimeSessionRef.current?.updateSourceContent(editableSourceContent)
  }, [editableSourceContent])

  useEffect(() => {
    runtimeSessionRef.current?.updateHeaderContent(headerContent)
  }, [headerContent])

  const saveScript = useCallback(async (): Promise<boolean> => {
    if (!isScriptBacked || !scriptKind) {
      return false
    }

    setIsSaving(true)

    try {
      const payload = await window.api.saveProjectScriptResource(
        projectPath,
        resourcePath,
        scriptKind,
        editableSourceContent,
        headerContent
      )
      setSavedSnapshot(buildSnapshot(editableSourceContent, headerContent))
      setStatusTone('info')
      setStatusMessage(`Saved ${PROJECT_SCRIPT_LABELS[payload.scriptKind].toLowerCase()}.`)
      return true
    } catch (error) {
      console.error('[script-editor] saveProjectScriptResource failed', error)
      setStatusTone('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Something went wrong while saving the script.'
      )
      return false
    } finally {
      setIsSaving(false)
    }
  }, [editableSourceContent, headerContent, isScriptBacked, projectPath, resourcePath, scriptKind])

  useEffect(() => {
    if (!isScriptBacked) {
      return
    }

    return window.api.onEditorCloseRequested(() => {
      if (isDirty) {
        setIsClosePromptOpen(true)
        return
      }

      void window.api.confirmEditorClose()
    })
  }, [isDirty, isScriptBacked])

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') {
        return
      }

      event.preventDefault()
      void saveScript()
    }

    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  }, [saveScript])

  const handleCloseDecision = useCallback(
    async (decision: 'save' | 'discard' | 'cancel') => {
      if (decision === 'cancel') {
        setIsClosePromptOpen(false)
        return
      }

      if (decision === 'save') {
        const didSave = await saveScript()

        if (!didSave) {
          return
        }
      }

      setIsClosePromptOpen(false)
      await window.api.confirmEditorClose()
    },
    [saveScript]
  )

  const activePath = activeTab === 'source' ? sourcePath : headerPath
  const editorTitle = useMemo(() => {
    if (!scriptKind) {
      return displayName
    }

    return `${displayName} (${PROJECT_SCRIPT_LABELS[scriptKind]})`
  }, [displayName, scriptKind])

  const activeValue = activeTab === 'source' ? editableSourceContent : headerContent
  const editorValue = toMonacoEditorValue(activeValue)
  const editorTheme = theme === 'dark' ? 'vs-dark' : 'vs'

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const currentValue = activeTab === 'source' ? editableSourceContent : headerContent
      const nextValue = fromMonacoEditorValue(value, currentValue)

      if (activeTab === 'source') {
        setEditableSourceContent(nextValue)
        setHasUserEditedSinceLoad(true)
        return
      }

      setHeaderContent(nextValue)
      setHasUserEditedSinceLoad(true)
    },
    [activeTab, editableSourceContent, headerContent]
  )

  const handleEditorMount = useCallback<OnMount>((editorInstance) => {
    editorRef.current = editorInstance
    setIsEditorReady(true)
    editorInstance.focus()
  }, [])

  return (
    <div className="script-editor">
      <header className="script-editor__toolbar">
        <div className="script-editor__summary">
          <strong>{editorTitle}</strong>
          <span>{activePath || resourcePath || 'No script path'}</span>
        </div>

        <div className="script-editor__actions">
          <button
            type="button"
            onClick={() => {
              setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'))
            }}
          >
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
          <button type="button" onClick={() => void saveScript()} disabled={!isLoaded || isSaving}>
            {isSaving ? 'Saving...' : isDirty ? 'Save*' : 'Save'}
          </button>
        </div>
      </header>

      {statusMessage && (
        <div className={`script-editor__status script-editor__status--${statusTone}`} role="status">
          {statusMessage}
        </div>
      )}

      {!isLoaded && <div className="script-editor__empty">Loading script...</div>}

      {isLoaded && (
        <div className="script-editor__body">
          <aside className="script-editor__sidebar">
            <div className="script-editor__tabs">
              <button
                type="button"
                className={`script-editor__tab${activeTab === 'source' ? ' script-editor__tab--active' : ''}`}
                onClick={() => setActiveTab('source')}
              >
                {sourcePath.split('/').pop() || 'Source (.c)'}
              </button>

              <button
                type="button"
                className={`script-editor__tab${activeTab === 'header' ? ' script-editor__tab--active' : ''}`}
                onClick={() => setActiveTab('header')}
              >
                {headerPath.split('/').pop() || 'Header (.h)'}
              </button>
            </div>

            {activeTab === 'source' && managedSourcePrefix && (
              <details className="script-editor__preamble">
                <summary>Injected engine preamble</summary>
                <p className="script-editor__preamble-copy">
                  Managed includes and `#pragma bank 255`.
                </p>
                <pre>{managedSourcePrefix}</pre>
              </details>
            )}
          </aside>

          <div className="script-editor__editor">
            <Editor
              beforeMount={configureMonaco}
              defaultLanguage="c"
              language="c"
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              options={{
                automaticLayout: true,
                fontFamily: 'Cascadia Code, Consolas, monospace',
                fontSize: 14,
                minimap: {
                  enabled: false
                },
                quickSuggestions: true,
                quickSuggestionsDelay: 250,
                scrollBeyondLastLine: false,
                suggestOnTriggerCharacters: true,
                tabSize: 4,
                wordWrap: 'on'
              }}
              path={
                activePath
                  ? toProjectCodeWorkspaceUri(activePath)
                  : toProjectCodeWorkspaceUri(`${activeTab}.c`)
              }
              saveViewState
              theme={editorTheme}
              value={editorValue}
            />
          </div>
        </div>
      )}

      {isClosePromptOpen && (
        <EditorClosePrompt
          assetLabel={displayName}
          isBusy={isSaving}
          onCloseDecision={(decision) => {
            void handleCloseDecision(decision)
          }}
        />
      )}
    </div>
  )
}
