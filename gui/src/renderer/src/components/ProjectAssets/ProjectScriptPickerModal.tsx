import { type ReactElement, useMemo, useState } from 'react'
import type { ProjectScriptOption } from './projectScriptBrowser'

interface ProjectScriptPickerModalProps {
  title: string
  description: string
  options: ProjectScriptOption[]
  isLoading: boolean
  errorMessage?: string | null
  emptyMessage: string
  noneLabel?: string | null
  isBusy?: boolean
  onRefresh: () => void
  onClose: () => void
  onSelectNone?: (() => void) | null
  onSelect: (option: ProjectScriptOption) => void
}

export const ProjectScriptPickerModal = ({
  title,
  description,
  options,
  isLoading,
  errorMessage,
  emptyMessage,
  noneLabel,
  isBusy = false,
  onRefresh,
  onClose,
  onSelectNone,
  onSelect
}: ProjectScriptPickerModalProps): ReactElement => {
  const [searchTerm, setSearchTerm] = useState('')
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const filteredOptions = useMemo(() => {
    if (!normalizedSearchTerm) {
      return options
    }

    return options.filter((option) => {
      return (
        option.name.toLowerCase().includes(normalizedSearchTerm) ||
        option.path.toLowerCase().includes(normalizedSearchTerm)
      )
    })
  }, [normalizedSearchTerm, options])

  return (
    <div className="editor-modal-backdrop">
      <div className="editor-modal" role="dialog" aria-modal="true">
        <h2>{title}</h2>
        <p className="editor-modal-copy">{description}</p>

        <div className="editor-modal-search">
          <span>Search</span>
          <input
            type="search"
            value={searchTerm}
            placeholder="Search by name or path"
            onChange={(event) => {
              setSearchTerm(event.target.value)
            }}
            disabled={isLoading || isBusy}
            aria-label="Search scripts"
          />
        </div>

        {errorMessage && (
          <div className="editor-status" style={{ marginTop: '16px', marginBottom: 0 }}>
            {errorMessage}
          </div>
        )}

        <div className="tilemap-editor__tileset-list" role="list">
          {!isLoading && onSelectNone && (
            <button
              type="button"
              className="tilemap-editor__tileset-option"
              onClick={onSelectNone}
              disabled={isBusy}
            >
              <span>{noneLabel ?? 'None'}</span>
              <span className="tilemap-editor__tileset-path">Clear script.</span>
            </button>
          )}

          {isLoading && (
            <div className="tilemap-editor__tileset-option tilemap-editor__tileset-option--empty">
              Loading scripts...
            </div>
          )}

          {!isLoading && options.length === 0 && (
            <div className="tilemap-editor__tileset-option tilemap-editor__tileset-option--empty">
              {emptyMessage}
            </div>
          )}

          {!isLoading && options.length > 0 && filteredOptions.length === 0 && (
            <div className="tilemap-editor__tileset-option tilemap-editor__tileset-option--empty">
              No scripts match the current search.
            </div>
          )}

          {!isLoading &&
            filteredOptions.map((option) => (
              <button
                key={option.path}
                type="button"
                className="tilemap-editor__tileset-option"
                onClick={() => {
                  onSelect(option)
                }}
                disabled={isBusy}
              >
                <span>{option.name}</span>
                <span className="tilemap-editor__tileset-path">{option.path}</span>
              </button>
            ))}
        </div>

        <div className="editor-modal-actions">
          <button type="button" onClick={onRefresh} disabled={isLoading || isBusy}>
            Refresh
          </button>
          <button type="button" onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
