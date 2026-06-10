import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EditorClosePrompt } from '../ProjectAssets/EditorClosePrompt'
import {
  validateProjectSaveDataEntries,
  type ProjectSaveDataEntry
} from '../../../../shared/projectSaveData'
import './SaveDataEditor.css'

type SaveDataStatusTone = 'info' | 'error'

const buildEntryId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `save-entry-${Date.now()}-${Math.round(Math.random() * 100_000)}`
}

const buildSnapshot = (entries: ProjectSaveDataEntry[]): string => {
  return JSON.stringify(entries)
}

const createEmptyEntry = (): ProjectSaveDataEntry => ({
  id: buildEntryId(),
  type: 'uint8_t',
  name: '',
  defaultValue: '0'
})

export const SaveDataEditor = (): ReactElement => {
  const [searchParams] = useSearchParams()
  const projectPath = searchParams.get('projectPath') ?? ''
  const [entries, setEntries] = useState<ProjectSaveDataEntry[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusTone, setStatusTone] = useState<SaveDataStatusTone>('info')
  const [isClosePromptOpen, setIsClosePromptOpen] = useState(false)
  const isDirty = savedSnapshot !== null && buildSnapshot(entries) !== savedSnapshot
  const validationIssues = useMemo(() => validateProjectSaveDataEntries(entries), [entries])
  const validationByField = useMemo(() => {
    const nextMap = new Map<string, string>()

    for (const issue of validationIssues) {
      const issueKey = `${issue.entryId}:${issue.field}`

      if (!nextMap.has(issueKey)) {
        nextMap.set(issueKey, issue.message)
      }
    }

    return nextMap
  }, [validationIssues])

  useEffect(() => {
    let isCancelled = false

    const loadSaveData = async (): Promise<void> => {
      if (!projectPath) {
        setStatusTone('error')
        setStatusMessage('This window was opened without a project path.')
        setIsLoaded(true)
        return
      }

      try {
        const payload = await window.api.loadProjectSaveData(projectPath)

        if (isCancelled) {
          return
        }

        setEntries(payload.entries)
        setSavedSnapshot(buildSnapshot(payload.entries))
        setStatusMessage(null)
        setStatusTone('info')
      } catch (error) {
        console.error('[save-data-editor] loadProjectSaveData failed', error)
        setStatusTone('error')
        setStatusMessage(
          error instanceof Error
            ? error.message
            : 'Something went wrong while loading save data.'
        )
      } finally {
        if (!isCancelled) {
          setIsLoaded(true)
        }
      }
    }

    void loadSaveData()

    return () => {
      isCancelled = true
    }
  }, [projectPath])

  useEffect(() => {
    if (!projectPath) {
      return
    }

    return window.api.onEditorCloseRequested(() => {
      if (isDirty) {
        setIsClosePromptOpen(true)
        return
      }

      void window.api.confirmEditorClose()
    })
  }, [isDirty, projectPath])

  const saveEntries = useCallback(async (): Promise<boolean> => {
    if (!projectPath) {
      return false
    }

    if (validationIssues.length > 0) {
      setStatusTone('error')
      setStatusMessage(validationIssues[0].message)
      return false
    }

    setIsSaving(true)

    try {
      const payload = await window.api.saveProjectSaveData(projectPath, { entries })
      setEntries(payload.entries)
      setSavedSnapshot(buildSnapshot(payload.entries))
      setStatusTone('info')
      setStatusMessage(
        `Saved ${payload.entries.length} save-data entr${payload.entries.length === 1 ? 'y' : 'ies'}.`
      )
      return true
    } catch (error) {
      console.error('[save-data-editor] saveProjectSaveData failed', error)
      setStatusTone('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Something went wrong while saving save data.'
      )
      return false
    } finally {
      setIsSaving(false)
    }
  }, [entries, projectPath, validationIssues])

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') {
        return
      }

      event.preventDefault()
      void saveEntries()
    }

    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  }, [saveEntries])

  const handleCloseDecision = useCallback(
    async (decision: 'save' | 'discard' | 'cancel') => {
      if (decision === 'cancel') {
        setIsClosePromptOpen(false)
        return
      }

      if (decision === 'save') {
        const didSave = await saveEntries()

        if (!didSave) {
          return
        }
      }

      setIsClosePromptOpen(false)
      await window.api.confirmEditorClose()
    },
    [saveEntries]
  )

  const updateEntry = useCallback(
    (
      entryId: string,
      field: keyof Omit<ProjectSaveDataEntry, 'id'>,
      value: string
    ): void => {
      setEntries((currentEntries) =>
        currentEntries.map((entry) =>
          entry.id === entryId ? { ...entry, [field]: value } : entry
        )
      )
    },
    []
  )

  const moveEntry = useCallback((entryId: string, direction: -1 | 1): void => {
    setEntries((currentEntries) => {
      const currentIndex = currentEntries.findIndex((entry) => entry.id === entryId)

      if (currentIndex < 0) {
        return currentEntries
      }

      const nextIndex = currentIndex + direction

      if (nextIndex < 0 || nextIndex >= currentEntries.length) {
        return currentEntries
      }

      const nextEntries = [...currentEntries]
      const [entry] = nextEntries.splice(currentIndex, 1)
      nextEntries.splice(nextIndex, 0, entry)
      return nextEntries
    })
  }, [])

  return (
    <div className="save-data-editor">
      <header className="save-data-editor__toolbar">
        <div className="save-data-editor__summary">
          <span className="save-data-editor__eyebrow">Project Save State</span>
          <h1>Save Data Editor</h1>
        </div>

        <div className="save-data-editor__actions">
          <button
            type="button"
            onClick={() => {
              setEntries((currentEntries) => [...currentEntries, createEmptyEntry()])
            }}
            disabled={isSaving}
          >
            Add Entry
          </button>
          <button
            type="button"
            className="save-data-editor__save"
            onClick={() => {
              void saveEntries()
            }}
            disabled={!isLoaded || isSaving}
          >
            {isSaving ? 'Saving...' : isDirty ? 'Save*' : 'Save'}
          </button>
        </div>
      </header>

      {statusMessage && (
        <div className={`save-data-editor__status save-data-editor__status--${statusTone}`}>
          {statusMessage}
        </div>
      )}

      <div className="save-data-editor__body">
        <section className="save-data-editor__panel">
          <div className="save-data-editor__panel-header">
            <h2>Entries</h2>
            <p>Written in order.</p>
          </div>

          {!isLoaded && <div className="save-data-editor__empty">Loading save data...</div>}

          {isLoaded && entries.length === 0 && (
            <div className="save-data-editor__empty">
              No save-data entries yet.
            </div>
          )}

          {isLoaded && entries.length > 0 && (
            <div className="save-data-editor__rows">
              {entries.map((entry, index) => (
                <article key={entry.id} className="save-data-editor__row">
                  <div className="save-data-editor__row-header">
                    <span className="save-data-editor__row-title">Entry {index + 1}</span>
                    <div className="save-data-editor__row-actions">
                      <button
                        type="button"
                        onClick={() => {
                          moveEntry(entry.id, -1)
                        }}
                        disabled={index === 0 || isSaving}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          moveEntry(entry.id, 1)
                        }}
                        disabled={index === entries.length - 1 || isSaving}
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEntries((currentEntries) =>
                            currentEntries.filter((currentEntry) => currentEntry.id !== entry.id)
                          )
                        }}
                        disabled={isSaving}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="save-data-editor__row-fields">
                    <label className="save-data-editor__field save-data-editor__field--type">
                      <span>Type</span>
                      <input
                        data-mono="true"
                        type="text"
                        value={entry.type}
                        onChange={(event) => {
                          updateEntry(entry.id, 'type', event.target.value)
                        }}
                      />
                      <small className="save-data-editor__field-error">
                        {validationByField.get(`${entry.id}:type`) ?? ''}
                      </small>
                    </label>

                    <label className="save-data-editor__field save-data-editor__field--name">
                      <span>Name</span>
                      <input
                        data-mono="true"
                        type="text"
                        value={entry.name}
                        onChange={(event) => {
                          updateEntry(entry.id, 'name', event.target.value)
                        }}
                      />
                      <small className="save-data-editor__field-error">
                        {validationByField.get(`${entry.id}:name`) ?? ''}
                      </small>
                    </label>

                    <label className="save-data-editor__field save-data-editor__field--default">
                      <span>Default Value</span>
                      <input
                        data-mono="true"
                        type="text"
                        value={entry.defaultValue}
                        onChange={(event) => {
                          updateEntry(entry.id, 'defaultValue', event.target.value)
                        }}
                      />
                      <small className="save-data-editor__field-error">
                        {validationByField.get(`${entry.id}:defaultValue`) ?? ''}
                      </small>
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="save-data-editor__sidebar">
          <div className="save-data-editor__sidebar-header">
            <h2>Validation</h2>
          </div>

          <div className="save-data-editor__validation">
            {validationIssues.length === 0 ? (
              <div className="save-data-editor__status save-data-editor__status--info">
                Valid.
              </div>
            ) : (
              <div className="save-data-editor__status save-data-editor__status--error">
                {validationIssues.length} issue{validationIssues.length === 1 ? '' : 's'} need
                attention.
              </div>
            )}

            {validationIssues.length > 0 && (
              <ul>
                {validationIssues.map((issue, index) => (
                  <li key={`${issue.entryId}:${issue.field}:${index}`}>{issue.message}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="save-data-editor__notes">
            <h2>Notes</h2>
            <ul>
              <li>`signature` is reserved.</li>
              <li>Defaults accept C expressions.</li>
            </ul>
          </div>
        </aside>
      </div>

      {isClosePromptOpen && (
        <EditorClosePrompt
          assetLabel="Save Data"
          isBusy={isSaving}
          onCloseDecision={(decision) => {
            void handleCloseDecision(decision)
          }}
        />
      )}
    </div>
  )
}
