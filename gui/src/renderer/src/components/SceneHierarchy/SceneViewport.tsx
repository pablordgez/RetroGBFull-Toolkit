import {
  type CSSProperties,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { SceneAssetActorNode } from '../../../../shared/projectAssets'
import { RetroActorIcon } from '../Docking/ResourceIcons'
import { useViewport } from '../hooks/viewport/useViewport'
import {
  hasProjectAssetDragPayload,
  readProjectAssetDragPayload,
  type ProjectAssetDragPayload
} from '../ProjectAssets/projectAssetDrag'
import {
  clampSceneActorPosition,
  clampSceneCollisionRect,
  collectSceneActorNodes,
  collectSceneCollisionRenderNodes,
  findSceneNodeById,
  pixelsToSceneCoord,
  sceneCoordToPixels
} from './sceneHierarchyModel'
import type { SceneDocumentEditor } from './useSceneDocumentEditor'
import './SceneViewport.css'

interface SceneViewportProps {
  editor: SceneDocumentEditor
  tilemapSize: { width: number; height: number } | null
  loadError?: string | null
  spritePreviews: Record<
    string,
    {
      path: string
      imageUrl: string
      imageUrlsByPalette?: [string, string]
      width: number
      height: number
    }
  >
  tilemapDocument: {
    width: number
    height: number
  } | null
  tilesetDocumentLoaded: boolean
  windowDocument: {
    width: number
    height: number
    windowTopEnd: number
    windowBottomStart: number
  } | null
  windowTilesetDocumentLoaded: boolean
  onActorSelect: (nodeId: string) => void
  onCollisionSelect: (nodeId: string) => void
  onViewportBackgroundSelect: () => void
  onProjectAssetDrop: (
    payload: ProjectAssetDragPayload,
    dropPosition: { x: number; y: number }
  ) => void | Promise<void>
  drawTilemap: (canvas: HTMLCanvasElement) => void
  drawWindow: (canvas: HTMLCanvasElement) => void
}

interface ActorDragState {
  kind: 'actor'
  nodeId: string
  startX: number
  startY: number
  previewX: number
  previewY: number
  pointerOffsetX: number
  pointerOffsetY: number
}

interface CollisionMoveState {
  kind: 'collision-move'
  nodeId: string
  startRect: {
    x: number
    y: number
    width: number
    height: number
  }
  previewRect: {
    x: number
    y: number
    width: number
    height: number
  }
  pointerOffsetX: number
  pointerOffsetY: number
}

interface CollisionResizeState {
  kind: 'collision-resize'
  nodeId: string
  handle: 'nw' | 'ne' | 'sw' | 'se'
  activeHandle: 'nw' | 'ne' | 'sw' | 'se'
  startRect: {
    x: number
    y: number
    width: number
    height: number
  }
  previewRect: {
    x: number
    y: number
    width: number
    height: number
  }
}

type DragState = ActorDragState | CollisionMoveState | CollisionResizeState

interface WindowVisibleBand {
  key: 'top' | 'bottom'
  startRow: number
  rowCount: number
}

const DEFAULT_SCENE_SIZE = {
  width: 168,
  height: 160
}

const GAME_BOY_SCREEN_SIZE = {
  width: 160,
  height: 144
}

const MAP_RENDER_OFFSET = {
  x: 8,
  y: 16
}

const COLLISION_HANDLE_NAMES: Array<CollisionResizeState['handle']> = ['nw', 'ne', 'sw', 'se']

const getResizeAnchorPoint = (
  rect: CollisionResizeState['startRect'],
  handle: CollisionResizeState['handle']
): { x: number; y: number } => {
  switch (handle) {
    case 'nw':
      return {
        x: rect.x + rect.width,
        y: rect.y + rect.height
      }
    case 'ne':
      return {
        x: rect.x,
        y: rect.y + rect.height
      }
    case 'sw':
      return {
        x: rect.x + rect.width,
        y: rect.y
      }
    case 'se':
      return {
        x: rect.x,
        y: rect.y
      }
  }
}

const getActiveResizeHandle = (
  anchorX: number,
  anchorY: number,
  pointerX: number,
  pointerY: number
): CollisionResizeState['handle'] => {
  if (pointerX <= anchorX && pointerY <= anchorY) {
    return 'nw'
  }

  if (pointerX > anchorX && pointerY <= anchorY) {
    return 'ne'
  }

  if (pointerX <= anchorX && pointerY > anchorY) {
    return 'sw'
  }

  return 'se'
}

const buildRectFromCorners = (
  firstX: number,
  firstY: number,
  secondX: number,
  secondY: number
): { x: number; y: number; width: number; height: number } => {
  return {
    x: Math.min(firstX, secondX),
    y: Math.min(firstY, secondY),
    width: Math.abs(secondX - firstX),
    height: Math.abs(secondY - firstY)
  }
}

export const SceneViewport = ({
  editor,
  tilemapSize,
  loadError,
  spritePreviews,
  tilemapDocument,
  tilesetDocumentLoaded,
  windowDocument,
  windowTilesetDocumentLoaded,
  onActorSelect,
  onCollisionSelect,
  onViewportBackgroundSelect,
  onProjectAssetDrop,
  drawTilemap,
  drawWindow
}: SceneViewportProps): ReactElement => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const windowCanvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const isPanningRef = useRef(false)
  const lastPointerPositionRef = useRef({ x: 0, y: 0 })
  const dragDepthRef = useRef(0)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [isAssetDropActive, setIsAssetDropActive] = useState(false)
  const actors = useMemo(() => {
    return collectSceneActorNodes(editor.nodes)
  }, [editor.nodes])
  const collisions = useMemo(() => {
    return collectSceneCollisionRenderNodes(editor.nodes)
  }, [editor.nodes])
  const dragPreviewPositions = useMemo(() => {
    if (!dragState || dragState.kind !== 'actor') {
      return null
    }

    const draggedNode = findSceneNodeById(editor.nodes, dragState.nodeId)

    if (!draggedNode) {
      return null
    }

    const deltaX = dragState.previewX - dragState.startX
    const deltaY = dragState.previewY - dragState.startY

    return new Map(
      collectSceneActorNodes([draggedNode]).map((actor) => [
        actor.id,
        {
          x: actor.x + deltaX,
          y: actor.y + deltaY
        }
      ])
    )
  }, [dragState, editor.nodes])

  const collisionPreviewRect = useMemo(() => {
    if (!dragState || dragState.kind === 'actor') {
      return null
    }

    return dragState.previewRect
  }, [dragState])

  const windowVisibleBands = useMemo(() => {
    if (!windowDocument) {
      return []
    }

    const bands: WindowVisibleBand[] = []

    if (windowDocument.windowTopEnd > 0) {
      bands.push({
        key: 'top',
        startRow: 0,
        rowCount: windowDocument.windowTopEnd
      })
    }

    if (windowDocument.windowBottomStart > windowDocument.windowTopEnd) {
      bands.push({
        key: 'bottom',
        startRow: windowDocument.windowBottomStart,
        rowCount: Math.max(0, 18 - windowDocument.windowBottomStart)
      })
    }

    return bands.filter((band) => band.rowCount > 0)
  }, [windowDocument])

  const mapPixelSize = tilemapSize
    ? {
        width: tilemapSize.width * 8,
        height: tilemapSize.height * 8
      }
    : null

  const scenePixelSize = mapPixelSize
    ? {
        width: Math.max(
          mapPixelSize.width + MAP_RENDER_OFFSET.x,
          GAME_BOY_SCREEN_SIZE.width + MAP_RENDER_OFFSET.x
        ),
        height: Math.max(
          mapPixelSize.height + MAP_RENDER_OFFSET.y,
          GAME_BOY_SCREEN_SIZE.height + MAP_RENDER_OFFSET.y
        )
      }
    : DEFAULT_SCENE_SIZE

  const { containerRef, fitToScreen, handlePan, handleZoom, pan, scale } = useViewport(
    scenePixelSize.width,
    scenePixelSize.height,
    0.25,
    64,
    true
  )

  useEffect(() => {
    if (!canvasRef.current || !tilemapDocument || !tilesetDocumentLoaded) {
      return
    }

    drawTilemap(canvasRef.current)
  }, [drawTilemap, tilemapDocument, tilesetDocumentLoaded])

  useEffect(() => {
    if (!windowCanvasRef.current || !windowDocument || !windowTilesetDocumentLoaded) {
      return
    }

    drawWindow(windowCanvasRef.current)
  }, [drawWindow, windowDocument, windowTilesetDocumentLoaded])

  const getWorldPointFromClient = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const bounds = worldRef.current?.getBoundingClientRect()

      if (!bounds) {
        return { x: 0, y: 0 }
      }

      return {
        x: (clientX - bounds.left) / scale,
        y: (clientY - bounds.top) / scale
      }
    },
    [scale]
  )

  const clearProjectAssetDropState = useCallback(() => {
    dragDepthRef.current = 0
    setIsAssetDropActive(false)
  }, [])

  const updateDragState = useCallback((nextDragState: DragState | null) => {
    dragStateRef.current = nextDragState
    setDragState(nextDragState)
  }, [])

  useEffect(() => {
    if (!dragState) {
      return
    }

    const handlePointerMove = (event: PointerEvent): void => {
      const currentDragState = dragStateRef.current

      if (!currentDragState) {
        return
      }

      const worldPoint = getWorldPointFromClient(event.clientX, event.clientY)

      if (currentDragState.kind === 'actor') {
        const nextPosition = clampSceneActorPosition(
          pixelsToSceneCoord(worldPoint.x - currentDragState.pointerOffsetX),
          pixelsToSceneCoord(worldPoint.y - currentDragState.pointerOffsetY),
          tilemapSize
        )

        updateDragState({
          ...currentDragState,
          previewX: nextPosition.x,
          previewY: nextPosition.y
        })
        return
      }

      if (currentDragState.kind === 'collision-move') {
        const nextRect = clampSceneCollisionRect(
          pixelsToSceneCoord(worldPoint.x - currentDragState.pointerOffsetX),
          pixelsToSceneCoord(worldPoint.y - currentDragState.pointerOffsetY),
          currentDragState.startRect.width,
          currentDragState.startRect.height,
          tilemapSize
        )

        updateDragState({
          ...currentDragState,
          previewRect: nextRect
        })
        return
      }

      const pointerX = pixelsToSceneCoord(worldPoint.x)
      const pointerY = pixelsToSceneCoord(worldPoint.y)
      const anchorPoint = getResizeAnchorPoint(currentDragState.startRect, currentDragState.handle)
      const nextRect = buildRectFromCorners(anchorPoint.x, anchorPoint.y, pointerX, pointerY)

      updateDragState({
        ...currentDragState,
        activeHandle: getActiveResizeHandle(anchorPoint.x, anchorPoint.y, pointerX, pointerY),
        previewRect: clampSceneCollisionRect(
          nextRect.x,
          nextRect.y,
          nextRect.width,
          nextRect.height,
          tilemapSize
        )
      })
    }

    const handlePointerUp = (): void => {
      const currentDragState = dragStateRef.current

      if (!currentDragState) {
        return
      }

      updateDragState(null)

      if (currentDragState.kind === 'actor') {
        if (
          currentDragState.previewX !== currentDragState.startX ||
          currentDragState.previewY !== currentDragState.startY
        ) {
          editor.updateActor(currentDragState.nodeId, {
            x: currentDragState.previewX,
            y: currentDragState.previewY
          })
        }

        return
      }

      const didCollisionChange =
        currentDragState.previewRect.x !== currentDragState.startRect.x ||
        currentDragState.previewRect.y !== currentDragState.startRect.y ||
        currentDragState.previewRect.width !== currentDragState.startRect.width ||
        currentDragState.previewRect.height !== currentDragState.startRect.height

      if (didCollisionChange) {
        editor.updateCollision(currentDragState.nodeId, currentDragState.previewRect)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState, editor, getWorldPointFromClient, tilemapSize, updateDragState])

  const buildActorStyle = (actor: SceneAssetActorNode): CSSProperties => {
    const preview =
      actor.spritePath && spritePreviews[actor.spritePath] ? spritePreviews[actor.spritePath] : null
    const activePosition = dragPreviewPositions?.get(actor.id) ?? { x: actor.x, y: actor.y }

    return {
      left: `${sceneCoordToPixels(activePosition.x)}px`,
      top: `${sceneCoordToPixels(activePosition.y)}px`,
      width: `${preview?.width ?? 8}px`,
      height: `${preview?.height ?? 8}px`
    }
  }

  const buildCollisionStyle = (
    collision: (typeof collisions)[number]
  ): CSSProperties => {
    const previewNodeId = dragState && dragState.kind !== 'actor' ? dragState.nodeId : null
    const activeRect =
      collisionPreviewRect && previewNodeId === collision.node.id
        ? collisionPreviewRect
        : {
            x: collision.worldX,
            y: collision.worldY,
            width: collision.node.width,
            height: collision.node.height
          }

    return {
      left: `${sceneCoordToPixels(activeRect.x)}px`,
      top: `${sceneCoordToPixels(activeRect.y)}px`,
      width: `${sceneCoordToPixels(activeRect.width)}px`,
      height: `${sceneCoordToPixels(activeRect.height)}px`
    }
  }

  return (
    <div className="scene-viewport">
      {loadError && <div className="scene-viewport__status">{loadError}</div>}

      <div className="scene-viewport__toolbar">
        <span className="scene-viewport__zoom">Zoom: {Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={() => {
            fitToScreen()
          }}
        >
          Reset View
        </button>
      </div>

      <div
        ref={containerRef}
        className={`scene-viewport__surface ${
          isAssetDropActive ? 'scene-viewport__surface--drop-active' : ''
        }`}
        data-testid="scene-viewport-surface"
        onMouseDown={(event) => {
          if (event.button === 1) {
            event.preventDefault()
            isPanningRef.current = true
            lastPointerPositionRef.current = { x: event.clientX, y: event.clientY }
          }
        }}
        onMouseMove={(event) => {
          if (!isPanningRef.current) {
            return
          }

          const deltaX = event.clientX - lastPointerPositionRef.current.x
          const deltaY = event.clientY - lastPointerPositionRef.current.y
          lastPointerPositionRef.current = { x: event.clientX, y: event.clientY }
          handlePan(deltaX, deltaY)
        }}
        onMouseUp={() => {
          isPanningRef.current = false
        }}
        onMouseLeave={() => {
          isPanningRef.current = false
        }}
        onWheel={(event) => {
          event.preventDefault()
          const bounds = containerRef.current?.getBoundingClientRect()

          if (!bounds) {
            return
          }

          const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1
          handleZoom(zoomFactor, event.clientX - bounds.left, event.clientY - bounds.top)
        }}
        onDragEnter={(event) => {
          if (!hasProjectAssetDragPayload(event.dataTransfer)) {
            return
          }

          event.preventDefault()
          dragDepthRef.current += 1
          setIsAssetDropActive(true)
        }}
        onDragOver={(event) => {
          if (!hasProjectAssetDragPayload(event.dataTransfer)) {
            return
          }

          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'

          if (!isAssetDropActive) {
            setIsAssetDropActive(true)
          }
        }}
        onDragLeave={(event) => {
          if (!hasProjectAssetDragPayload(event.dataTransfer)) {
            return
          }

          event.preventDefault()
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)

          if (dragDepthRef.current === 0) {
            setIsAssetDropActive(false)
          }
        }}
        onDrop={(event) => {
          const payload = readProjectAssetDragPayload(event.dataTransfer)
          clearProjectAssetDropState()

          if (!payload) {
            return
          }

          event.preventDefault()
          const worldPoint = getWorldPointFromClient(event.clientX, event.clientY)
          const dropPosition = clampSceneActorPosition(
            pixelsToSceneCoord(worldPoint.x),
            pixelsToSceneCoord(worldPoint.y),
            tilemapSize
          )

          void onProjectAssetDrop(payload, dropPosition)
        }}
      >
        <div
          ref={worldRef}
          className="scene-viewport__world"
          style={{
            width: `${scenePixelSize.width}px`,
            height: `${scenePixelSize.height}px`,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`
          }}
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return
            }

            onViewportBackgroundSelect()
          }}
        >
          <div className="scene-viewport__screen-outline" aria-hidden="true" />

          {tilemapDocument && (
            <canvas
              ref={canvasRef}
              className="scene-viewport__tilemap"
              width={mapPixelSize?.width ?? 0}
              height={mapPixelSize?.height ?? 0}
              style={{
                left: `${MAP_RENDER_OFFSET.x}px`,
                top: `${MAP_RENDER_OFFSET.y}px`
              }}
            />
          )}

          {windowDocument && (
            <>
              <canvas
                ref={windowCanvasRef}
                className="scene-viewport__window"
                width={160}
                height={144}
                style={{
                  left: `${MAP_RENDER_OFFSET.x}px`,
                  top: `${MAP_RENDER_OFFSET.y}px`
                }}
              />

              {windowVisibleBands.map((band) => (
                <div
                  key={band.key}
                  className={`scene-viewport__window-region scene-viewport__window-region--${band.key}`}
                  aria-hidden="true"
                  style={{
                    left: `${MAP_RENDER_OFFSET.x}px`,
                    top: `${MAP_RENDER_OFFSET.y + band.startRow * 8}px`,
                    width: `${GAME_BOY_SCREEN_SIZE.width}px`,
                    height: `${band.rowCount * 8}px`
                  }}
                />
              ))}
            </>
          )}

          {!tilemapDocument && (
            <div className="scene-viewport__empty">
              Load a tilemap to visualize the scene bounds.
            </div>
          )}

          {collisions.map((collision) => (
            <div
              key={collision.node.id}
              data-testid={`scene-collision-${collision.node.id}`}
              className={`scene-viewport__collision ${
                editor.selectedNodeId === collision.node.id
                  ? 'scene-viewport__collision--selected'
                  : ''
              } ${collision.node.isBlocking ? 'scene-viewport__collision--blocking' : ''}`}
              style={buildCollisionStyle(collision)}
              onMouseDown={(event) => {
                if (event.button !== 0) {
                  return
                }

                event.preventDefault()
                event.stopPropagation()
                onCollisionSelect(collision.node.id)
                const worldPoint = getWorldPointFromClient(event.clientX, event.clientY)

                updateDragState({
                  kind: 'collision-move',
                  nodeId: collision.node.id,
                  startRect: {
                    x: collision.worldX,
                    y: collision.worldY,
                    width: collision.node.width,
                    height: collision.node.height
                  },
                  previewRect: {
                    x: collision.worldX,
                    y: collision.worldY,
                    width: collision.node.width,
                    height: collision.node.height
                  },
                  pointerOffsetX: worldPoint.x - sceneCoordToPixels(collision.worldX),
                  pointerOffsetY: worldPoint.y - sceneCoordToPixels(collision.worldY)
                })
              }}
              onClick={(event) => {
                event.stopPropagation()
                onCollisionSelect(collision.node.id)
              }}
            >
              {editor.selectedNodeId === collision.node.id &&
                (
                  dragState?.kind === 'collision-resize' && dragState.nodeId === collision.node.id
                    ? [dragState.activeHandle]
                    : COLLISION_HANDLE_NAMES
                ).map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    className={`scene-viewport__collision-handle scene-viewport__collision-handle--${handle} ${
                      dragState?.kind === 'collision-resize' &&
                      dragState.nodeId === collision.node.id &&
                      dragState.activeHandle === handle
                        ? 'scene-viewport__collision-handle--active'
                        : ''
                    }`}
                    onMouseDown={(event) => {
                      if (event.button !== 0) {
                        return
                      }

                      event.preventDefault()
                      event.stopPropagation()
                      onCollisionSelect(collision.node.id)
                      updateDragState({
                        kind: 'collision-resize',
                        nodeId: collision.node.id,
                        handle,
                        activeHandle: handle,
                        startRect: {
                          x: collision.worldX,
                          y: collision.worldY,
                          width: collision.node.width,
                          height: collision.node.height
                        },
                        previewRect: {
                          x: collision.worldX,
                          y: collision.worldY,
                          width: collision.node.width,
                          height: collision.node.height
                        }
                      })
                    }}
                  />
                ))}
            </div>
          ))}

          {actors.map((actor) => {
            const preview =
              actor.spritePath && spritePreviews[actor.spritePath]
                ? spritePreviews[actor.spritePath]
                : null

            return (
              <button
                key={actor.id}
                type="button"
                className={`scene-viewport__actor ${
                  editor.selectedNodeId === actor.id ? 'scene-viewport__actor--selected' : ''
                }`}
                style={buildActorStyle(actor)}
                onMouseDown={(event) => {
                  if (event.button !== 0) {
                    return
                  }

                  event.preventDefault()
                  event.stopPropagation()
                  onActorSelect(actor.id)
                  const worldPoint = getWorldPointFromClient(event.clientX, event.clientY)
                  const actorPixelPosition = {
                    x: sceneCoordToPixels(actor.x),
                    y: sceneCoordToPixels(actor.y)
                  }

                  updateDragState({
                    kind: 'actor',
                    nodeId: actor.id,
                    startX: actor.x,
                    startY: actor.y,
                    previewX: actor.x,
                    previewY: actor.y,
                    pointerOffsetX: worldPoint.x - actorPixelPosition.x,
                    pointerOffsetY: worldPoint.y - actorPixelPosition.y
                  })
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  onActorSelect(actor.id)
                }}
              >
                {preview ? (
                  <img
                    src={
                      preview.imageUrlsByPalette?.[actor.spritePaletteIndex ?? 0] ??
                      preview.imageUrl
                    }
                    alt=""
                    draggable={false}
                    className="scene-viewport__actor-sprite"
                  />
                ) : (
                  <span className="scene-viewport__actor-placeholder" aria-hidden="true">
                    <RetroActorIcon />
                  </span>
                )}

                {actor.followCamera && (
                  <span
                    className="scene-viewport__actor-badge"
                    aria-hidden="true"
                    title="Camera follow target"
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
