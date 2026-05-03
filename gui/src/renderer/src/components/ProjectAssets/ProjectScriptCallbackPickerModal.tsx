import { type ReactElement, useMemo, useState } from 'react'
import type { ProjectScriptCallbackCandidate } from '../../../../shared/projectCodeWorkspace'
import { PROJECT_SCRIPT_LABELS } from '../../../../shared/projectScripts'
import './ProjectScriptCallbackPickerModal.css'

interface ProjectScriptCallbackPickerModalProps {
  title: string
  description: string
  candidates: ProjectScriptCallbackCandidate[]
  isLoading?: boolean
  errorMessage?: string | null
  emptyMessage: string
  isBusy?: boolean
  onRefresh?: (() => void) | null
  onClose: () => void
  onSelect: (candidate: ProjectScriptCallbackCandidate) => void
}

interface ProjectScriptCallbackGroup {
  scriptPath: string
  scriptName: string
  scriptKind: ProjectScriptCallbackCandidate['scriptKind']
  functions: ProjectScriptCallbackCandidate[]
}

export const ProjectScriptCallbackPickerModal = ({
  title,
  description,
  candidates,
  isLoading = false,
  errorMessage,
  emptyMessage,
  isBusy = false,
  onRefresh,
  onClose,
  onSelect
}: ProjectScriptCallbackPickerModalProps): ReactElement => {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedScriptPath, setExpandedScriptPath] = useState<string | null>(null)
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()

  const groupedCandidates = useMemo(() => {
    const groups = new Map<string, ProjectScriptCallbackGroup>()

    for (const candidate of candidates) {
      const existingGroup = groups.get(candidate.scriptPath)

      if (existingGroup) {
        if (!existingGroup.functions.some((entry) => entry.functionName === candidate.functionName)) {
          existingGroup.functions.push(candidate)
        }
        continue
      }

      groups.set(candidate.scriptPath, {
        scriptPath: candidate.scriptPath,
        scriptName: candidate.scriptName,
        scriptKind: candidate.scriptKind,
        functions: [candidate]
      })
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        functions: [...group.functions].sort((left, right) =>
          left.functionName.localeCompare(right.functionName)
        )
      }))
      .sort((left, right) => left.scriptPath.localeCompare(right.scriptPath))
  }, [candidates])

  const filteredGroups = useMemo(() => {
    if (!normalizedSearchTerm) {
      return groupedCandidates
    }

    return groupedCandidates.flatMap((group) => {
      const scriptMatches =
        group.scriptName.toLowerCase().includes(normalizedSearchTerm) ||
        group.scriptPath.toLowerCase().includes(normalizedSearchTerm) ||
        PROJECT_SCRIPT_LABELS[group.scriptKind].toLowerCase().includes(normalizedSearchTerm)

      const matchingFunctions = scriptMatches
        ? group.functions
        : group.functions.filter((candidate) =>
            candidate.functionName.toLowerCase().includes(normalizedSearchTerm)
          )

      if (matchingFunctions.length === 0) {
        return []
      }

      return [
        {
          ...group,
          functions: matchingFunctions
        }
      ]
    })
  }, [groupedCandidates, normalizedSearchTerm])

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
            placeholder="Search by script, path, or function"
            onChange={(event) => {
              setSearchTerm(event.target.value)
            }}
            disabled={isLoading || isBusy}
            aria-label="Search callbacks"
          />
        </div>

        {errorMessage && (
          <div className="editor-status" style={{ marginTop: '16px', marginBottom: 0 }}>
            {errorMessage}
          </div>
        )}

        <div className="tilemap-editor__tileset-list" role="list">
          {isLoading && (
            <div className="tilemap-editor__tileset-option tilemap-editor__tileset-option--empty">
              Loading callbacks...
            </div>
          )}

          {!isLoading && groupedCandidates.length === 0 && (
            <div className="tilemap-editor__tileset-option tilemap-editor__tileset-option--empty">
              {emptyMessage}
            </div>
          )}

          {!isLoading && groupedCandidates.length > 0 && filteredGroups.length === 0 && (
            <div className="tilemap-editor__tileset-option tilemap-editor__tileset-option--empty">
              No callbacks match the current search.
            </div>
          )}

          {!isLoading &&
            filteredGroups.map((group) => {
              const isExpanded = expandedScriptPath === group.scriptPath

              return (
                <div key={group.scriptPath} className="project-script-callback-picker__group">
                  <button
                    type="button"
                    className="project-script-callback-picker__script"
                    onClick={() => {
                      setExpandedScriptPath((currentValue) =>
                        currentValue === group.scriptPath ? null : group.scriptPath
                      )
                    }}
                    disabled={isBusy}
                    aria-expanded={isExpanded}
                  >
                    <span>{group.scriptName}</span>
                    <span className="project-script-callback-picker__script-meta">
                      {PROJECT_SCRIPT_LABELS[group.scriptKind]} • {group.scriptPath}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="project-script-callback-picker__functions" role="list">
                      {group.functions.map((candidate) => (
                        <button
                          key={`${candidate.scriptPath}:${candidate.functionName}`}
                          type="button"
                          className="project-script-callback-picker__function"
                          onClick={() => {
                            onSelect(candidate)
                          }}
                          disabled={isBusy}
                        >
                          <span>{candidate.functionName}</span>
                          <span className="project-script-callback-picker__function-meta">
                            {group.scriptName}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </div>

        <div className="editor-modal-actions">
          {onRefresh && (
            <button type="button" onClick={onRefresh} disabled={isLoading || isBusy}>
              Refresh
            </button>
          )}
          <button type="button" onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
