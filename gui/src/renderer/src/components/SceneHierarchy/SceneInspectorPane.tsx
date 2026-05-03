import { type ChangeEvent, type KeyboardEvent, type ReactElement, useEffect, useMemo, useState } from 'react'
import type {
  SceneAssetCollisionCallback,
  SceneAssetNode
} from '../../../../shared/projectAssets'
import { getProjectAssetDisplayName } from '../../../../shared/projectAssets'
import type {
  ParsedScriptPropertyDefinition,
  ProjectScriptCallbackCandidate
} from '../../../../shared/projectCodeWorkspace'
import {
  getStoredScriptPropertyValue,
  validateScriptPropertyDraft,
  type ScriptPropertyMap,
  type ScriptPropertyValue
} from '../../../../shared/projectScriptProperties'
import type { ProjectScriptOption } from '../ProjectAssets/projectScriptBrowser'
import type { ProjectTagEntry } from '../../../../shared/projectTags'
import { ProjectScriptCallbackPickerModal } from '../ProjectAssets/ProjectScriptCallbackPickerModal'
import {
  clampSceneActorPosition,
  clampSceneCollisionRect,
  findSceneNodeById,
  findSceneNodeRecord,
  formatSceneCoord,
  isSceneActorNode,
  isSceneCollisionNode,
  parseSceneCoord
} from './sceneHierarchyModel'
import type { SceneDocumentEditor } from './useSceneDocumentEditor'
import './SceneInspectorPane.css'

interface SceneInspectorPaneProps {
  className?: string
  editor: SceneDocumentEditor
  sceneLabel?: string | null
  tilemapSize: { width: number; height: number } | null
  sceneScriptOptions?: ProjectScriptOption[]
  actorScriptOptions?: ProjectScriptOption[]
  sceneScriptPropertyDefinitions?: ParsedScriptPropertyDefinition[]
  actorScriptPropertyDefinitions?: ParsedScriptPropertyDefinition[]
  collisionCallbackCandidates?: ProjectScriptCallbackCandidate[]
  isCollisionCallbackPickerLoading?: boolean
  collisionCallbackPickerErrorMessage?: string | null
  maxCollisionCallbacks?: number
  maxTagSlots?: number
  projectTags?: ProjectTagEntry[]
  onRequestTilemapSelection?: () => void
  onRequestWindowSelection?: () => void
  onRequestSceneScriptSelection?: () => void
  onRequestActorScriptSelection?: (nodeId: string) => void
  onRequestSpriteSelection: (nodeId: string) => void
  onRequestSceneAnimationPropertySelection?: (propertyName: string) => void
  onRequestActorAnimationPropertySelection?: (nodeId: string, propertyName: string) => void
  onSetSceneScriptProperty?: (propertyName: string, propertyValue: ScriptPropertyValue) => void
  onSetActorScriptProperty?: (
    nodeId: string,
    propertyName: string,
    propertyValue: ScriptPropertyValue
  ) => void
  onRefreshCollisionCallbackCandidates?: () => void
  onSetCollisionCallbacks?: (nodeId: string, callbacks: SceneAssetCollisionCallback[]) => void
}

const buildClassName = (baseClassName: string, extraClassName?: string): string => {
  return extraClassName ? `${baseClassName} ${extraClassName}` : baseClassName
}

const EMPTY_SCRIPT_PROPERTY_DEFINITIONS: ParsedScriptPropertyDefinition[] = []

const getPathLabel = (resourcePath: string | null, fallback: string): string => {
  return resourcePath ? getProjectAssetDisplayName(resourcePath.split('/').pop() ?? fallback) : fallback
}

const getScriptPropertyInputId = (propertyName: string): string => {
  return `scene-inspector-script-property-${propertyName}`
}

export const SceneInspectorPane = ({
  className,
  editor,
  sceneLabel,
  tilemapSize,
  sceneScriptOptions = [],
  actorScriptOptions = [],
  sceneScriptPropertyDefinitions = [],
  actorScriptPropertyDefinitions = [],
  collisionCallbackCandidates = [],
  isCollisionCallbackPickerLoading = false,
  collisionCallbackPickerErrorMessage = null,
  maxCollisionCallbacks = 0,
  maxTagSlots = 5,
  projectTags = [],
  onRequestTilemapSelection = () => undefined,
  onRequestWindowSelection = () => undefined,
  onRequestSceneScriptSelection = () => undefined,
  onRequestActorScriptSelection = () => undefined,
  onRequestSpriteSelection,
  onRequestSceneAnimationPropertySelection = () => undefined,
  onRequestActorAnimationPropertySelection = () => undefined,
  onSetSceneScriptProperty = () => undefined,
  onSetActorScriptProperty = () => undefined,
  onRefreshCollisionCallbackCandidates = () => undefined,
  onSetCollisionCallbacks = () => undefined
}: SceneInspectorPaneProps): ReactElement => {
  const selectedNode = editor.selectedNode
  const selectedActor = editor.selectedActor
  const selectedCollision = editor.selectedCollision
  const collisionParentActor = selectedCollision
    ? (() => {
        const collisionRecord = findSceneNodeRecord(editor.nodes, selectedCollision.id)
        const parentNode = collisionRecord?.parentId
          ? findSceneNodeById(editor.nodes, collisionRecord.parentId)
          : null

        return parentNode && isSceneActorNode(parentNode) ? parentNode : null
      })()
    : null
  const [xDraft, setXDraft] = useState('0')
  const [yDraft, setYDraft] = useState('0')
  const [widthDraft, setWidthDraft] = useState('8')
  const [heightDraft, setHeightDraft] = useState('8')
  const [scriptPropertyDrafts, setScriptPropertyDrafts] = useState<Record<string, string>>({})
  const [scriptPropertyErrors, setScriptPropertyErrors] = useState<Record<string, string>>({})
  const [isCollisionCallbackPickerOpen, setIsCollisionCallbackPickerOpen] = useState(false)

  useEffect(() => {
    if (selectedActor) {
      setXDraft(formatSceneCoord(selectedActor.x))
      setYDraft(formatSceneCoord(selectedActor.y))
      return
    }

    if (selectedCollision) {
      setXDraft(formatSceneCoord(selectedCollision.x))
      setYDraft(formatSceneCoord(selectedCollision.y))
      setWidthDraft(formatSceneCoord(selectedCollision.width))
      setHeightDraft(formatSceneCoord(selectedCollision.height))
      return
    }

    setXDraft('0')
    setYDraft('0')
    setWidthDraft('8')
    setHeightDraft('8')
  }, [collisionParentActor, selectedActor, selectedCollision])

  useEffect(() => {
    setIsCollisionCallbackPickerOpen(false)
  }, [selectedCollision?.id])

  const activeScriptPropertyDefinitions = useMemo(() => {
    if (!selectedNode) {
      return sceneScriptPropertyDefinitions
    }

    if (selectedActor) {
      return actorScriptPropertyDefinitions
    }

    return EMPTY_SCRIPT_PROPERTY_DEFINITIONS
  }, [actorScriptPropertyDefinitions, sceneScriptPropertyDefinitions, selectedActor, selectedNode])
  const activeScriptProperties: ScriptPropertyMap | undefined = useMemo(() => {
    if (!selectedNode) {
      return editor.sceneScriptProperties
    }

    return selectedActor?.scriptProperties
  }, [editor.sceneScriptProperties, selectedActor, selectedNode])

  useEffect(() => {
    const nextDrafts = Object.fromEntries(
      activeScriptPropertyDefinitions
        .filter((definition) => definition.kind === 'integer')
        .map((definition) => {
          const currentValue = getStoredScriptPropertyValue(definition, activeScriptProperties)
          return [definition.name, typeof currentValue === 'number' ? String(currentValue) : '']
        })
    )

    setScriptPropertyDrafts(nextDrafts)
    setScriptPropertyErrors({})
  }, [activeScriptPropertyDefinitions, activeScriptProperties, selectedActor?.id, selectedNode?.id])

  const commitActorAxis = (axis: 'x' | 'y'): void => {
    if (!selectedActor) {
      return
    }

    const nextCoord = parseSceneCoord(axis === 'x' ? xDraft : yDraft)

    if (nextCoord === null) {
      setXDraft(formatSceneCoord(selectedActor.x))
      setYDraft(formatSceneCoord(selectedActor.y))
      return
    }

    const nextPosition = clampSceneActorPosition(
      axis === 'x' ? nextCoord : selectedActor.x,
      axis === 'y' ? nextCoord : selectedActor.y,
      tilemapSize
    )

    editor.updateActor(selectedActor.id, nextPosition)
  }

  const commitCollisionRect = (field: 'x' | 'y' | 'width' | 'height'): void => {
    if (!selectedCollision) {
      return
    }

    const nextX = parseSceneCoord(field === 'x' ? xDraft : formatSceneCoord(selectedCollision.x))
    const nextY = parseSceneCoord(field === 'y' ? yDraft : formatSceneCoord(selectedCollision.y))
    const nextWidth = parseSceneCoord(
      field === 'width' ? widthDraft : formatSceneCoord(selectedCollision.width)
    )
    const nextHeight = parseSceneCoord(
      field === 'height' ? heightDraft : formatSceneCoord(selectedCollision.height)
    )

    if (nextX === null || nextY === null || nextWidth === null || nextHeight === null) {
      setXDraft(formatSceneCoord(selectedCollision.x))
      setYDraft(formatSceneCoord(selectedCollision.y))
      setWidthDraft(formatSceneCoord(selectedCollision.width))
      setHeightDraft(formatSceneCoord(selectedCollision.height))
      return
    }

    const nextRect = clampSceneCollisionRect(
      nextX + (collisionParentActor?.x ?? 0),
      nextY + (collisionParentActor?.y ?? 0),
      nextWidth,
      nextHeight,
      tilemapSize
    )
    editor.updateCollision(selectedCollision.id, nextRect)
  }

  const handleActorAxisKeyDown = (
    axis: 'x' | 'y',
    event: KeyboardEvent<HTMLInputElement>
  ): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitActorAxis(axis)
    }

    if (event.key === 'Escape' && selectedActor) {
      event.preventDefault()
      setXDraft(formatSceneCoord(selectedActor.x))
      setYDraft(formatSceneCoord(selectedActor.y))
    }
  }

  const handleCollisionFieldKeyDown = (
    field: 'x' | 'y' | 'width' | 'height',
    event: KeyboardEvent<HTMLInputElement>
  ): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitCollisionRect(field)
    }

    if (event.key === 'Escape' && selectedCollision) {
      event.preventDefault()
      setXDraft(formatSceneCoord(selectedCollision.x))
      setYDraft(formatSceneCoord(selectedCollision.y))
      setWidthDraft(formatSceneCoord(selectedCollision.width))
      setHeightDraft(formatSceneCoord(selectedCollision.height))
    }
  }

  const selectedSpriteLabel = getPathLabel(selectedActor?.spritePath ?? null, 'No sprite selected')
  const selectedTilemapLabel = getPathLabel(editor.tilemapPath, 'No tilemap selected')
  const selectedWindowLabel = getPathLabel(editor.windowPath, 'No window selected')
  const selectedSceneScriptLabel = getPathLabel(editor.scriptPath, 'No scene script selected')
  const selectedActorScriptLabel = getPathLabel(
    selectedActor?.scriptPath ?? null,
    'No actor script selected'
  )
  const selectedTaggableNode = selectedActor ?? selectedCollision
  const selectedTagIds = selectedTaggableNode?.tags ?? []

  const toggleTag = (tagId: string, isSelected: boolean): void => {
    if (!selectedTaggableNode) {
      return
    }

    const nextTags = isSelected
      ? [...selectedTagIds, tagId].slice(0, maxTagSlots)
      : selectedTagIds.filter((currentTagId) => currentTagId !== tagId)

    editor.setNodeTags(selectedTaggableNode.id, nextTags)
  }

  const renderTagControls = (): ReactElement | null => {
    if (!selectedTaggableNode) {
      return null
    }

    return (
      <>
        <div className="scene-inspector-pane__field">
          <span>Tags</span>
          <strong>
            {selectedTagIds.length} / {maxTagSlots}
          </strong>
        </div>

        {projectTags.length === 0 && (
          <div className="scene-inspector-pane__hint">No project tags defined.</div>
        )}

        {projectTags.length > 0 && (
          <div className="scene-inspector-pane__tag-list">
            {projectTags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag.id)
              const isDisabled = !isSelected && selectedTagIds.length >= maxTagSlots

              return (
                <label key={tag.id} className="scene-inspector-pane__tag-option">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={(event) => toggleTag(tag.id, event.target.checked)}
                  />
                  <span>{tag.name}</span>
                </label>
              )
            })}
          </div>
        )}
      </>
    )
  }
  const commitScriptProperty = (definition: ParsedScriptPropertyDefinition): void => {
    if (definition.kind !== 'integer') {
      return
    }

    const draftValue = scriptPropertyDrafts[definition.name] ?? ''
    const validation = validateScriptPropertyDraft(definition, draftValue)

    if (validation.error) {
      setScriptPropertyErrors((currentErrors) => ({
        ...currentErrors,
        [definition.name]: validation.error
      }))
      return
    }

    setScriptPropertyErrors((currentErrors) => {
      const nextErrors = { ...currentErrors }
      delete nextErrors[definition.name]
      return nextErrors
    })

    if (!selectedNode) {
      onSetSceneScriptProperty(definition.name, validation.value)
      return
    }

    if (selectedActor) {
      onSetActorScriptProperty(selectedActor.id, definition.name, validation.value)
    }
  }

  const resetScriptPropertyDraft = (definition: ParsedScriptPropertyDefinition): void => {
    const currentValue = getStoredScriptPropertyValue(definition, activeScriptProperties)
    setScriptPropertyDrafts((currentDrafts) => ({
      ...currentDrafts,
      [definition.name]: typeof currentValue === 'number' ? String(currentValue) : ''
    }))
    setScriptPropertyErrors((currentErrors) => {
      const nextErrors = { ...currentErrors }
      delete nextErrors[definition.name]
      return nextErrors
    })
  }

  const renderScriptPropertyControl = (definition: ParsedScriptPropertyDefinition): ReactElement => {
    if (definition.kind === 'boolean') {
      const currentValue = getStoredScriptPropertyValue(definition, activeScriptProperties) === true

      return (
        <div key={definition.name} className="scene-inspector-pane__property-row">
          <label
            className="scene-inspector-pane__property-label"
            htmlFor={getScriptPropertyInputId(definition.name)}
          >
            {definition.name}
          </label>
          <input
            id={getScriptPropertyInputId(definition.name)}
            type="checkbox"
            checked={currentValue}
            onChange={(event) => {
              if (!selectedNode) {
                onSetSceneScriptProperty(definition.name, event.target.checked)
                return
              }

              if (selectedActor) {
                onSetActorScriptProperty(selectedActor.id, definition.name, event.target.checked)
              }
            }}
          />
        </div>
      )
    }

    if (definition.kind === 'enum') {
      const currentValue = getStoredScriptPropertyValue(definition, activeScriptProperties)

      return (
        <div key={definition.name} className="scene-inspector-pane__property-row">
          <label
            className="scene-inspector-pane__property-label"
            htmlFor={getScriptPropertyInputId(definition.name)}
          >
            {definition.name}
            <small> ({definition.typeName})</small>
          </label>
          <select
            id={getScriptPropertyInputId(definition.name)}
            className="scene-inspector-pane__property-input"
            value={typeof currentValue === 'string' ? currentValue : ''}
            onChange={(event) => {
              const nextValue = event.target.value
              const validation = validateScriptPropertyDraft(
                definition,
                nextValue.length > 0 ? nextValue : null
              )

              if (validation.error) {
                setScriptPropertyErrors((currentErrors) => ({
                  ...currentErrors,
                  [definition.name]: validation.error
                }))
                return
              }

              setScriptPropertyErrors((currentErrors) => {
                const nextErrors = { ...currentErrors }
                delete nextErrors[definition.name]
                return nextErrors
              })

              if (!selectedNode) {
                onSetSceneScriptProperty(definition.name, validation.value)
                return
              }

              if (selectedActor) {
                onSetActorScriptProperty(selectedActor.id, definition.name, validation.value)
              }
            }}
          >
            <option value="">Use Default</option>
            {(definition.enumValues ?? []).map((enumValue) => (
              <option key={enumValue} value={enumValue}>
                {enumValue}
              </option>
            ))}
          </select>
        </div>
      )
    }

    if (definition.kind === 'animation') {
      const currentValue = getStoredScriptPropertyValue(definition, activeScriptProperties)
      const currentPath = typeof currentValue === 'string' ? currentValue : null

      return (
        <div key={definition.name} className="scene-inspector-pane__property-row">
          <span className="scene-inspector-pane__property-label">{definition.name}</span>
          <div className="scene-inspector-pane__property-actions">
            <strong className="scene-inspector-pane__property-value">
              {getPathLabel(currentPath, 'No animation selected')}
            </strong>
            <button
              type="button"
              onClick={() => {
                if (!selectedNode) {
                  onRequestSceneAnimationPropertySelection(definition.name)
                  return
                }

                if (selectedActor) {
                  onRequestActorAnimationPropertySelection(selectedActor.id, definition.name)
                }
              }}
            >
              {currentPath ? 'Change Animation' : 'Select Animation'}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div key={definition.name} className="scene-inspector-pane__property-stack">
        <div className="scene-inspector-pane__property-row">
          <label
            className="scene-inspector-pane__property-label"
            htmlFor={getScriptPropertyInputId(definition.name)}
          >
            {definition.name}
            <small> ({definition.typeName})</small>
          </label>
          <input
            id={getScriptPropertyInputId(definition.name)}
            className="scene-inspector-pane__property-input"
            type="text"
            value={scriptPropertyDrafts[definition.name] ?? ''}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const nextValue = event.target.value
              setScriptPropertyDrafts((currentDrafts) => ({
                ...currentDrafts,
                [definition.name]: nextValue
              }))

              const validation = validateScriptPropertyDraft(definition, nextValue)
              setScriptPropertyErrors((currentErrors) => {
                const nextErrors = { ...currentErrors }

                if (validation.error) {
                  nextErrors[definition.name] = validation.error
                } else {
                  delete nextErrors[definition.name]
                }

                return nextErrors
              })
            }}
            onBlur={() => {
              commitScriptProperty(definition)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitScriptProperty(definition)
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                resetScriptPropertyDraft(definition)
              }
            }}
          />
        </div>
        {scriptPropertyErrors[definition.name] && (
          <span className="scene-inspector-pane__hint">{scriptPropertyErrors[definition.name]}</span>
        )}
      </div>
    )
  }
  const availableCollisionCandidates = useMemo(() => {
    if (!selectedCollision) {
      return []
    }

    const assignedKeys = new Set(
      (selectedCollision.callbacks ?? []).map(
        (callback) => `${callback.scriptPath}::${callback.functionName}`
      )
    )

    return collisionCallbackCandidates.filter((candidate) => {
      return !assignedKeys.has(`${candidate.scriptPath}::${candidate.functionName}`)
    })
  }, [collisionCallbackCandidates, selectedCollision])

  const getSelectionTypeLabel = (node: SceneAssetNode | null): string => {
    if (!node) {
      return 'Scene'
    }

    if (isSceneActorNode(node)) {
      return 'Actor'
    }

    if (isSceneCollisionNode(node)) {
      return 'Collision'
    }

    return 'Folder'
  }

  const handleSelectCollisionCallback = (candidate: ProjectScriptCallbackCandidate): void => {
    if (!selectedCollision) {
      return
    }

    onSetCollisionCallbacks(selectedCollision.id, [
      ...(selectedCollision.callbacks ?? []),
      {
        scriptPath: candidate.scriptPath,
        functionName: candidate.functionName
      }
    ])
    setIsCollisionCallbackPickerOpen(false)
  }

  const showLegacyEmptyState =
    !selectedNode &&
    !sceneLabel &&
    sceneScriptOptions.length === 0 &&
    actorScriptOptions.length === 0 &&
    collisionCallbackCandidates.length === 0

  return (
    <div
      className={buildClassName('scene-inspector-pane', className)}
      data-testid="project-workspace-scene-inspector"
    >
      {!editor.canEdit && (
        <div className="scene-inspector-pane__empty">
          Open a scene to inspect it.
        </div>
      )}

      {editor.canEdit && showLegacyEmptyState && (
        <div className="scene-inspector-pane__empty">
          Select an actor or collision.
        </div>
      )}

      {editor.canEdit && !showLegacyEmptyState && (
        <>
          <div className="scene-inspector-pane__field">
            <span>Name</span>
            <strong>{selectedNode?.name ?? sceneLabel ?? 'Scene'}</strong>
          </div>

          <div className="scene-inspector-pane__field">
            <span>Type</span>
            <strong>{getSelectionTypeLabel(selectedNode)}</strong>
          </div>

          {!selectedNode && (
            <>
              <div className="scene-inspector-pane__field">
                <span>Tilemap</span>
                <strong>{selectedTilemapLabel}</strong>
              </div>

              <button type="button" onClick={onRequestTilemapSelection}>
                {editor.tilemapPath ? 'Change Tilemap' : 'Select Tilemap'}
              </button>

              <div className="scene-inspector-pane__field">
                <span>Window</span>
                <strong>{selectedWindowLabel}</strong>
              </div>

              <button type="button" onClick={onRequestWindowSelection}>
                {editor.windowPath ? 'Change Window' : 'Select Window'}
              </button>

              <div className="scene-inspector-pane__field">
                <span>Scene Script</span>
                <strong>{selectedSceneScriptLabel}</strong>
              </div>

              <button type="button" onClick={onRequestSceneScriptSelection}>
                {editor.scriptPath ? 'Change Scene Script' : 'Select Scene Script'}
              </button>

              <div className="scene-inspector-pane__field">
                <span>Scene Bounds</span>
                <strong>
                  {tilemapSize ? `${tilemapSize.width * 8} x ${tilemapSize.height * 8}px` : 'Unbounded'}
                </strong>
              </div>

              {activeScriptPropertyDefinitions.length > 0 && (
                <>
                  <div className="scene-inspector-pane__section-title">Script Properties</div>
                  {activeScriptPropertyDefinitions.map(renderScriptPropertyControl)}
                </>
              )}
            </>
          )}

          {!selectedActor && !selectedCollision && selectedNode && (
            <div className="scene-inspector-pane__field">
              <span>Children</span>
              <strong>{selectedNode.children.length}</strong>
            </div>
          )}

          {selectedActor && (
            <>
              <div className="scene-inspector-pane__field">
                <span>Sprite</span>
                <strong>{selectedSpriteLabel}</strong>
              </div>

              <button
                type="button"
                onClick={() => {
                  onRequestSpriteSelection(selectedActor.id)
                }}
              >
                {selectedActor.spritePath ? 'Change Sprite' : 'Select Sprite'}
              </button>

              <div className="scene-inspector-pane__field">
                <span>Actor Script</span>
                <strong>{selectedActorScriptLabel}</strong>
              </div>

              <button
                type="button"
                onClick={() => {
                  onRequestActorScriptSelection(selectedActor.id)
                }}
              >
                {selectedActor.scriptPath ? 'Change Actor Script' : 'Select Actor Script'}
              </button>

              <label className="scene-inspector-pane__toggle">
                <input
                  type="checkbox"
                  checked={selectedActor.followCamera}
                  onChange={(event) => {
                    editor.setFollowedActor(event.target.checked ? selectedActor.id : null)
                  }}
                />
                <span>Follow camera</span>
              </label>

              <div className="scene-inspector-pane__field">
                <span>Scene Bounds</span>
                <strong>
                  {tilemapSize ? `${tilemapSize.width * 8} x ${tilemapSize.height * 8}px` : 'Unbounded'}
                </strong>
              </div>

              <div className="scene-inspector-pane__coords">
                <label>
                  X
                  <input
                    type="text"
                    value={xDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setXDraft(event.target.value)
                    }}
                    onBlur={() => {
                      commitActorAxis('x')
                    }}
                    onKeyDown={(event) => {
                      handleActorAxisKeyDown('x', event)
                    }}
                  />
                </label>

                <label>
                  Y
                  <input
                    type="text"
                    value={yDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setYDraft(event.target.value)
                    }}
                    onBlur={() => {
                      commitActorAxis('y')
                    }}
                    onKeyDown={(event) => {
                      handleActorAxisKeyDown('y', event)
                    }}
                  />
                </label>
              </div>

              <p className="scene-inspector-pane__hint">1/16th-pixel precision.</p>

              {renderTagControls()}

              {activeScriptPropertyDefinitions.length > 0 && (
                <>
                  <div className="scene-inspector-pane__section-title">Script Properties</div>
                  {activeScriptPropertyDefinitions.map(renderScriptPropertyControl)}
                </>
              )}
            </>
          )}

          {selectedCollision && (
            <>
              <label className="scene-inspector-pane__toggle">
                <input
                  type="checkbox"
                  checked={selectedCollision.isBlocking}
                  onChange={(event) => {
                    editor.updateCollision(selectedCollision.id, {
                      isBlocking: event.target.checked
                    })
                  }}
                />
                <span>Blocking</span>
              </label>

              <div className="scene-inspector-pane__coords scene-inspector-pane__coords--collision">
                <label>
                  X
                  <input
                    type="text"
                    value={xDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setXDraft(event.target.value)
                    }}
                    onBlur={() => {
                      commitCollisionRect('x')
                    }}
                    onKeyDown={(event) => {
                      handleCollisionFieldKeyDown('x', event)
                    }}
                  />
                </label>

                <label>
                  Y
                  <input
                    type="text"
                    value={yDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setYDraft(event.target.value)
                    }}
                    onBlur={() => {
                      commitCollisionRect('y')
                    }}
                    onKeyDown={(event) => {
                      handleCollisionFieldKeyDown('y', event)
                    }}
                  />
                </label>

                <label>
                  Width
                  <input
                    type="text"
                    value={widthDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setWidthDraft(event.target.value)
                    }}
                    onBlur={() => {
                      commitCollisionRect('width')
                    }}
                    onKeyDown={(event) => {
                      handleCollisionFieldKeyDown('width', event)
                    }}
                  />
                </label>

                <label>
                  Height
                  <input
                    type="text"
                    value={heightDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setHeightDraft(event.target.value)
                    }}
                    onBlur={() => {
                      commitCollisionRect('height')
                    }}
                    onKeyDown={(event) => {
                      handleCollisionFieldKeyDown('height', event)
                    }}
                  />
                </label>
              </div>

              <div className="scene-inspector-pane__field">
                <span>Collision Callbacks</span>
                <strong>
                  {(selectedCollision.callbacks ?? []).length} / {maxCollisionCallbacks || 0}
                </strong>
              </div>

              <div className="scene-inspector-pane__callback-list">
                {(selectedCollision.callbacks ?? []).length === 0 && (
                  <div className="scene-inspector-pane__hint">No collision callbacks assigned.</div>
                )}

                {(selectedCollision.callbacks ?? []).map((callback, index) => (
                  <div
                    key={`${callback.scriptPath}:${callback.functionName}`}
                    className="scene-inspector-pane__callback-item"
                  >
                    <div>
                      <strong>{callback.functionName}</strong>
                      <span>{getPathLabel(callback.scriptPath, 'Script')}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onSetCollisionCallbacks(
                          selectedCollision.id,
                          (selectedCollision.callbacks ?? []).filter(
                            (_, callbackIndex) => callbackIndex !== index
                          )
                        )
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="scene-inspector-pane__callback-adder">
                <button
                  type="button"
                  onClick={() => {
                    setIsCollisionCallbackPickerOpen(true)
                  }}
                  disabled={
                    maxCollisionCallbacks > 0 &&
                    (selectedCollision.callbacks ?? []).length >= maxCollisionCallbacks
                  }
                >
                  Add Callback
                </button>
              </div>

              {renderTagControls()}

              <p className="scene-inspector-pane__hint">
                Local under actors; scene coordinates at the root.
              </p>

              {isCollisionCallbackPickerOpen && (
                <ProjectScriptCallbackPickerModal
                  title="Add Collision Callback"
                  description="Pick a compatible callback."
                  candidates={availableCollisionCandidates}
                  isLoading={isCollisionCallbackPickerLoading}
                  errorMessage={collisionCallbackPickerErrorMessage}
                  emptyMessage="No compatible callbacks found."
                  onRefresh={onRefreshCollisionCallbackCandidates}
                  onClose={() => {
                    setIsCollisionCallbackPickerOpen(false)
                  }}
                  onSelect={handleSelectCollisionCallback}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
