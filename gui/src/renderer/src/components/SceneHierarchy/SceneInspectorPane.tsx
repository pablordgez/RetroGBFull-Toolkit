import { type ChangeEvent, type KeyboardEvent, type ReactElement, useEffect, useMemo, useState } from 'react'
import type {
  SceneAssetCollisionCallback,
  SceneAssetNode
} from '../../../../shared/projectAssets'
import { getProjectAssetDisplayName } from '../../../../shared/projectAssets'
import type { ProjectScriptCallbackCandidate } from '../../../../shared/projectCodeWorkspace'
import type { ProjectScriptOption } from '../ProjectAssets/projectScriptBrowser'
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
  collisionCallbackCandidates?: ProjectScriptCallbackCandidate[]
  isCollisionCallbackPickerLoading?: boolean
  collisionCallbackPickerErrorMessage?: string | null
  maxCollisionCallbacks?: number
  onRequestTilemapSelection?: () => void
  onRequestWindowSelection?: () => void
  onRequestSceneScriptSelection?: () => void
  onRequestActorScriptSelection?: (nodeId: string) => void
  onRequestSpriteSelection: (nodeId: string) => void
  onRefreshCollisionCallbackCandidates?: () => void
  onSetCollisionCallbacks?: (nodeId: string, callbacks: SceneAssetCollisionCallback[]) => void
}

const buildClassName = (baseClassName: string, extraClassName?: string): string => {
  return extraClassName ? `${baseClassName} ${extraClassName}` : baseClassName
}

const getPathLabel = (resourcePath: string | null, fallback: string): string => {
  return resourcePath ? getProjectAssetDisplayName(resourcePath.split('/').pop() ?? fallback) : fallback
}

export const SceneInspectorPane = ({
  className,
  editor,
  sceneLabel,
  tilemapSize,
  sceneScriptOptions = [],
  actorScriptOptions = [],
  collisionCallbackCandidates = [],
  isCollisionCallbackPickerLoading = false,
  collisionCallbackPickerErrorMessage = null,
  maxCollisionCallbacks = 0,
  onRequestTilemapSelection = () => undefined,
  onRequestWindowSelection = () => undefined,
  onRequestSceneScriptSelection = () => undefined,
  onRequestActorScriptSelection = () => undefined,
  onRequestSpriteSelection,
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
          Open a scene to inspect its hierarchy, scripts, and collision callbacks.
        </div>
      )}

      {editor.canEdit && showLegacyEmptyState && (
        <div className="scene-inspector-pane__empty">
          Select an actor or collision in the hierarchy or scene view to edit its properties.
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

              <p className="scene-inspector-pane__hint">Positions use 1/16th-pixel precision.</p>
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

              <p className="scene-inspector-pane__hint">
                Collision boxes use local coordinates under actor parents and scene coordinates at
                the root.
              </p>

              {isCollisionCallbackPickerOpen && (
                <ProjectScriptCallbackPickerModal
                  title="Add Collision Callback"
                  description="Choose a script, then expand it to pick one of its compatible collision callbacks."
                  candidates={availableCollisionCandidates}
                  isLoading={isCollisionCallbackPickerLoading}
                  errorMessage={collisionCallbackPickerErrorMessage}
                  emptyMessage="No compatible callbacks were found in general, actor, or scene scripts."
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
