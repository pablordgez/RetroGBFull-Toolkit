import { type ChangeEvent, type KeyboardEvent, type ReactElement, useEffect, useState } from 'react'
import type { SceneAssetNode } from '../../../../shared/projectAssets'
import { getProjectAssetDisplayName } from '../../../../shared/projectAssets'
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
  tilemapSize: { width: number; height: number } | null
  onRequestSpriteSelection: (nodeId: string) => void
}

const buildClassName = (baseClassName: string, extraClassName?: string): string => {
  return extraClassName ? `${baseClassName} ${extraClassName}` : baseClassName
}

export const SceneInspectorPane = ({
  className,
  editor,
  tilemapSize,
  onRequestSpriteSelection
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

  const selectedSpriteLabel = selectedActor?.spritePath
    ? getProjectAssetDisplayName(selectedActor.spritePath.split('/').pop() ?? 'Sprite')
    : 'No sprite selected'

  const getSelectionTypeLabel = (node: SceneAssetNode | null): string => {
    if (!node) {
      return 'None'
    }

    if (isSceneActorNode(node)) {
      return 'Actor'
    }

    if (isSceneCollisionNode(node)) {
      return 'Collision'
    }

    return 'Folder'
  }

  return (
    <div className={buildClassName('scene-inspector-pane', className)}>
      {!selectedNode && (
        <div className="scene-inspector-pane__empty">
          Select an actor or collision in the hierarchy or scene view to edit its properties.
        </div>
      )}

      {selectedNode && (
        <>
          <div className="scene-inspector-pane__field">
            <span>Name</span>
            <strong>{selectedNode.name}</strong>
          </div>

          <div className="scene-inspector-pane__field">
            <span>Type</span>
            <strong>{getSelectionTypeLabel(selectedNode)}</strong>
          </div>

          {!selectedActor && !selectedCollision && (
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
                  {tilemapSize
                    ? `${tilemapSize.width * 8} x ${tilemapSize.height * 8}px`
                    : 'Unbounded'}
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

              <p className="scene-inspector-pane__hint">
                Collision boxes use local coordinates under actor parents and scene coordinates at
                the root.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
