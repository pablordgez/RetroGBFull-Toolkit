import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from 'react'
import '../style/SpriteEditor.css'
import { PixelCanvas } from '../PixelEditor/PixelCanvas'
import { useViewport } from '../hooks/viewport/useViewport'
import { Tileset, type TilesetRef } from '../Tileset/Tileset'
import { useHistory } from '../hooks/history/useHistory'
import { useUndoRedoShortcuts } from '../hooks/history/useUndoRedoShortcuts'
import { useProjectAssetEditor } from '../hooks/useProjectAssetEditor'
import { floodFill } from '../utils/pixelAlgorithms'
import { applyGridChanges, resizeGrid } from '../utils/gridUtils'
import { EditorClosePrompt } from '../ProjectAssets/EditorClosePrompt'
import { renderTileToDataURL } from '../utils/imageUtils'
import {
  type TilemapAssetDocument,
  type TilesetAssetDocument,
  type WindowAssetDocument,
  type WindowSplitSettings,
  getProjectAssetDisplayName,
  normalizeWindowSplitSettings
} from '../../../../shared/projectAssets'

const DEFAULT_MAP_W = 20
const DEFAULT_MAP_H = 18

interface TilesetOption {
  name: string
  path: string
}

interface AppliedTilesetState {
  tilesetPath: string | null
  tilesetImages: (string | null)[]
  tilesetTileCount: number
  grid: number[]
  selectedTileIndex: number
}

type TileGridAssetKind = 'tilemap' | 'window'
type TileGridAssetDocument = TilemapAssetDocument | WindowAssetDocument

interface TileGridAssetEditorProps {
  assetKind: TileGridAssetKind
}

const isWindowAssetDocument = (document: TileGridAssetDocument): document is WindowAssetDocument => {
  return document.kind === 'window'
}

const getSplitGuideStyles = (
  row: number,
  pan: { x: number; y: number },
  scale: number,
  width: number
): CSSProperties => {
  return {
    left: `${pan.x}px`,
    top: `${pan.y + row * scale}px`,
    width: `${width * scale}px`
  }
}

const getSplitBadgeStyles = (
  row: number,
  pan: { x: number; y: number },
  scale: number
): CSSProperties => {
  return {
    left: `${pan.x + 8}px`,
    top: `${pan.y + row * scale + 8}px`
  }
}

const getWindowBottomRows = (windowBottomStart: number, height: number): number => {
  return windowBottomStart > 0 ? Math.max(0, height - windowBottomStart) : 0
}

const getWindowSplitInputState = (
  windowTopEnd: number,
  windowBottomStart: number,
  height: number
): { topRows: string; bottomRows: string } => {
  return {
    topRows: windowTopEnd.toString(),
    bottomRows: getWindowBottomRows(windowBottomStart, height).toString()
  }
}

const getWindowSplitSettingsFromEditorRows = (
  topRows: number,
  bottomRows: number,
  height: number
): WindowSplitSettings => {
  const clampRowCount = (value: number): number => {
    if (!Number.isFinite(value)) {
      return 0
    }

    return Math.max(0, Math.min(Math.max(0, Math.trunc(height)), Math.trunc(value)))
  }

  const nextTopRows = clampRowCount(topRows)

  if (nextTopRows === 0) {
    return normalizeWindowSplitSettings(0, 0, height)
  }

  const nextBottomRows = clampRowCount(bottomRows)

  if (nextBottomRows === 0) {
    return normalizeWindowSplitSettings(nextTopRows, 0, height)
  }

  const nextBottomStart = Math.max(0, Math.trunc(height) - nextBottomRows)
  return normalizeWindowSplitSettings(nextTopRows, nextBottomStart, height)
}

export const TileGridAssetEditor = ({ assetKind }: TileGridAssetEditorProps) => {
  const assetLabel = assetKind === 'window' ? 'Window' : 'Tilemap'
  const [mapWidth, setMapWidth] = useState(DEFAULT_MAP_W)
  const [mapHeight, setMapHeight] = useState(DEFAULT_MAP_H)
  const [grid, setGrid] = useState<number[]>(new Array(DEFAULT_MAP_W * DEFAULT_MAP_H).fill(0))
  const [tilesetPath, setTilesetPath] = useState<string | null>(null)
  const [tilesetImages, setTilesetImages] = useState<(string | null)[]>([])
  const [tilesetTileCount, setTilesetTileCount] = useState(0)
  const [selectedTileIndex, setSelectedTileIndex] = useState(0)
  const [tool, setTool] = useState<'brush' | 'fill'>('brush')
  const [windowTopEnd, setWindowTopEnd] = useState(0)
  const [windowBottomStart, setWindowBottomStart] = useState(0)
  const [windowSplitInput, setWindowSplitInput] = useState({
    topRows: '0',
    bottomRows: '0'
  })
  const [inputSize, setInputSize] = useState({
    w: DEFAULT_MAP_W.toString(),
    h: DEFAULT_MAP_H.toString()
  })
  const [isTilesetPickerOpen, setIsTilesetPickerOpen] = useState(false)
  const [isTilesetPickerLoading, setIsTilesetPickerLoading] = useState(false)
  const [isTilesetSelectionRequired, setIsTilesetSelectionRequired] = useState(false)
  const [tilesetPickerError, setTilesetPickerError] = useState<string | null>(null)
  const [tilesetOptions, setTilesetOptions] = useState<TilesetOption[]>([])
  const [isSwitchingTileset, setIsSwitchingTileset] = useState(false)

  const tilesetRef = useRef<TilesetRef>(null)
  const activeDrawButtonRef = useRef(0)
  const { viewportSize, scale, pan, containerRef, fitToScreen, handleZoom, handlePan } =
    useViewport(mapWidth, mapHeight)
  const { record, undo, redo, canUndo, canRedo } = useHistory()

  const assetDocument = useMemo((): TileGridAssetDocument => {
    if (assetKind === 'window') {
      const splitSettings = normalizeWindowSplitSettings(windowTopEnd, windowBottomStart, mapHeight)

      return {
        kind: 'window',
        version: 1,
        width: mapWidth,
        height: mapHeight,
        grid,
        tilesetPath,
        selectedTileIndex,
        tool,
        ...splitSettings
      }
    }

    return {
      kind: 'tilemap',
      version: 1,
      width: mapWidth,
      height: mapHeight,
      grid,
      tilesetPath,
      selectedTileIndex,
      tool
    }
  }, [
    assetKind,
    grid,
    mapHeight,
    mapWidth,
    selectedTileIndex,
    tilesetPath,
    tool,
    windowBottomStart,
    windowTopEnd
  ])

  const applyDocument = useCallback((nextDocument: TileGridAssetDocument) => {
    setMapWidth(nextDocument.width)
    setMapHeight(nextDocument.height)
    setInputSize({
      w: nextDocument.width.toString(),
      h: nextDocument.height.toString()
    })
    setGrid(nextDocument.grid)
    setTilesetPath(nextDocument.tilesetPath)
    setSelectedTileIndex(nextDocument.selectedTileIndex)
    setTool(nextDocument.tool)

    if (isWindowAssetDocument(nextDocument)) {
      const splitSettings = normalizeWindowSplitSettings(
        nextDocument.windowTopEnd,
        nextDocument.windowBottomStart,
        nextDocument.height
      )
      setWindowTopEnd(splitSettings.windowTopEnd)
      setWindowBottomStart(splitSettings.windowBottomStart)
      setWindowSplitInput(
        getWindowSplitInputState(
          splitSettings.windowTopEnd,
          splitSettings.windowBottomStart,
          nextDocument.height
        )
      )
    } else {
      setWindowTopEnd(0)
      setWindowBottomStart(0)
      setWindowSplitInput({
        topRows: '0',
        bottomRows: '0'
      })
    }
  }, [])

  const {
    assetPath,
    isClosePromptOpen,
    isDirty,
    isLoaded,
    isSaving,
    projectPath,
    saveAsset,
    statusMessage,
    setStatusMessage,
    handleCloseDecision
  } = useProjectAssetEditor({
    expectedKind: assetKind,
    document: assetDocument,
    applyDocument
  })

  useUndoRedoShortcuts(undo, redo)

  const buildTilesetImages = useCallback((tilesetDocument: TilesetAssetDocument): string[] => {
    return tilesetDocument.tiles.map((tile) =>
      renderTileToDataURL(Uint8Array.from(tile), 8, 8, tilesetDocument.palette)
    )
  }, [])

  const applyTilesetState = useCallback(
    (nextState: AppliedTilesetState) => {
      setTilesetPath(nextState.tilesetPath)
      setTilesetImages(nextState.tilesetImages)
      setTilesetTileCount(nextState.tilesetTileCount)
      setGrid(nextState.grid)
      setSelectedTileIndex(nextState.selectedTileIndex)
      setStatusMessage(null)
    },
    [setStatusMessage]
  )

  const listTilesetOptions = useCallback(
    async (currentPath = ''): Promise<TilesetOption[]> => {
      if (!projectPath) {
        return []
      }

      const resourceView = await window.api.getProjectResources(projectPath, currentPath)
      const localTilesets = resourceView.items
        .filter((resource): resource is typeof resource & { type: 'file'; resourceType: 'tileset' } => {
          return resource.type === 'file' && resource.resourceType === 'tileset'
        })
        .map((resource) => ({
          name: resource.name,
          path: resource.path
        }))

      const nestedTilesets = await Promise.all(
        resourceView.items
          .filter((resource): resource is typeof resource & { type: 'folder' } => {
            return resource.type === 'folder'
          })
          .map((resource) => listTilesetOptions(resource.path))
      )

      return [...localTilesets, ...nestedTilesets.flat()].sort((left, right) =>
        left.path.localeCompare(right.path)
      )
    },
    [projectPath]
  )

  const openTilesetPicker = useCallback(
    async (isRequired: boolean) => {
      setIsTilesetPickerOpen(true)
      setIsTilesetSelectionRequired(isRequired)
      setIsTilesetPickerLoading(true)
      setTilesetPickerError(null)

      try {
        const nextTilesetOptions = await listTilesetOptions()
        setTilesetOptions(nextTilesetOptions)
      } catch (error) {
        console.error(`[${assetKind}-editor] listTilesetOptions failed`, error)
        setTilesetPickerError(
          error instanceof Error
            ? error.message
            : 'Something went wrong while loading the available tilesets. Please try again.'
        )
      } finally {
        setIsTilesetPickerLoading(false)
      }
    },
    [assetKind, listTilesetOptions]
  )

  useEffect(() => {
    if (!tilesetPath) {
      setTilesetImages([])
      setTilesetTileCount(0)
      return
    }

    let isCancelled = false

    const loadTileset = async () => {
      try {
        const payload = await window.api.loadProjectAssetFile(projectPath, tilesetPath)

        if (isCancelled) {
          return
        }

        if (payload.assetKind !== 'tileset') {
          throw new Error('The selected tileset reference is not valid.')
        }

        const tilesetDocument = payload.document as TilesetAssetDocument
        const nextTilesetImages = buildTilesetImages(tilesetDocument)
        const nextTileCount = tilesetDocument.tiles.length

        setTilesetImages(nextTilesetImages)
        setTilesetTileCount(nextTileCount)

        if (nextTileCount > 0 && selectedTileIndex >= nextTileCount) {
          setSelectedTileIndex(0)
        }
      } catch (error) {
        console.error(`[${assetKind}-editor] loadProjectAssetFile failed`, error)
        setStatusMessage(
          error instanceof Error
            ? error.message
            : 'Something went wrong while loading the selected tileset. Please try again.'
        )
        setTilesetImages([])
        setTilesetTileCount(0)
      }
    }

    void loadTileset()

    return () => {
      isCancelled = true
    }
  }, [assetKind, buildTilesetImages, projectPath, selectedTileIndex, setStatusMessage, tilesetPath])

  useEffect(() => {
    tilesetImages.forEach((imageUrl, index) => {
      if (!imageUrl) {
        return
      }

      tilesetRef.current?.updateTile(index, imageUrl)
    })
  }, [tilesetImages])

  useEffect(() => {
    if (!isLoaded || !projectPath || tilesetPath || isTilesetPickerOpen) {
      return
    }

    void openTilesetPicker(true)
  }, [isLoaded, isTilesetPickerOpen, openTilesetPicker, projectPath, tilesetPath])

  const handleSelectTileset = useCallback(
    async (nextTilesetPath: string) => {
      if (!projectPath) {
        return
      }

      setIsSwitchingTileset(true)

      try {
        const payload = await window.api.loadProjectAssetFile(projectPath, nextTilesetPath)

        if (payload.assetKind !== 'tileset') {
          throw new Error('The selected asset is not a tileset.')
        }

        const nextTilesetDocument = payload.document as TilesetAssetDocument
        const nextTilesetImages = buildTilesetImages(nextTilesetDocument)
        const nextTileCount = nextTilesetDocument.tiles.length
        const nextGrid = grid.map((tileIndex) =>
          tileIndex >= 0 && tileIndex < nextTileCount ? tileIndex : 0
        )
        const nextSelectedTileIndex =
          nextTileCount > 0 && selectedTileIndex >= 0 && selectedTileIndex < nextTileCount
            ? selectedTileIndex
            : 0

        const previousState: AppliedTilesetState = {
          tilesetPath,
          tilesetImages,
          tilesetTileCount,
          grid: [...grid],
          selectedTileIndex
        }
        const nextState: AppliedTilesetState = {
          tilesetPath: nextTilesetPath,
          tilesetImages: nextTilesetImages,
          tilesetTileCount: nextTileCount,
          grid: nextGrid,
          selectedTileIndex: nextSelectedTileIndex
        }

        if (
          previousState.tilesetPath !== nextState.tilesetPath ||
          previousState.selectedTileIndex !== nextState.selectedTileIndex ||
          previousState.grid.some((value, index) => value !== nextState.grid[index])
        ) {
          record({
            undo: () => {
              applyTilesetState(previousState)
            },
            redo: () => {
              applyTilesetState(nextState)
            }
          })
        }

        applyTilesetState(nextState)
        setIsTilesetPickerOpen(false)
        setIsTilesetSelectionRequired(false)
      } catch (error) {
        console.error(`[${assetKind}-editor] handleSelectTileset failed`, error)
        setTilesetPickerError(
          error instanceof Error
            ? error.message
            : 'Something went wrong while selecting the tileset. Please try again.'
        )
      } finally {
        setIsSwitchingTileset(false)
      }
    },
    [
      applyTilesetState,
      assetKind,
      buildTilesetImages,
      grid,
      projectPath,
      record,
      selectedTileIndex,
      tilesetImages,
      tilesetPath,
      tilesetTileCount
    ]
  )

  const performFloodFill = useCallback(
    (x: number, y: number, targetTile: number) => {
      const startTile = grid[y * mapWidth + x]
      if (startTile === targetTile) {
        return
      }

      const pixelsToFill = floodFill(x, y, mapWidth, mapHeight, (gx, gy) => grid[gy * mapWidth + gx])

      if (pixelsToFill.length === 0) {
        return
      }

      const changes = pixelsToFill.map((pixel) => ({
        index: pixel.index,
        oldTile: grid[pixel.index],
        newTile: targetTile
      }))

      setGrid((previousGrid) => {
        const operations = pixelsToFill.map((pixel) => ({ index: pixel.index, color: targetTile }))
        return applyGridChanges(previousGrid, operations) as number[]
      })

      record({
        undo: () => {
          setGrid((previousGrid) => {
            const operations = changes.map((change) => ({
              index: change.index,
              color: change.oldTile
            }))
            return applyGridChanges(previousGrid, operations) as number[]
          })
        },
        redo: () => {
          setGrid((previousGrid) => {
            const operations = changes.map((change) => ({
              index: change.index,
              color: change.newTile
            }))
            return applyGridChanges(previousGrid, operations) as number[]
          })
        }
      })
    },
    [grid, mapHeight, mapWidth, record]
  )

  const isDrawingRef = useRef(false)
  const historyBufferRef = useRef<Map<number, number>>(new Map())

  const handleTileInput = useCallback(
    (x: number, y: number, type: 'down' | 'move' | 'up' | 'leave', button: number) => {
      if (type === 'up' || type === 'leave') {
        if (isDrawingRef.current) {
          isDrawingRef.current = false
          if (historyBufferRef.current.size > 0) {
            const appliedButton = activeDrawButtonRef.current
            const changes = Array.from(historyBufferRef.current.entries()).map(([index, oldTile]) => ({
              index,
              oldTile,
              newTile: appliedButton === 2 ? 0 : selectedTileIndex
            }))

            record({
              undo: () => {
                setGrid((previousGrid) => {
                  const nextGrid = [...previousGrid]
                  changes.forEach((change) => {
                    nextGrid[change.index] = change.oldTile
                  })
                  return nextGrid
                })
              },
              redo: () => {
                setGrid((previousGrid) => {
                  const nextGrid = [...previousGrid]
                  changes.forEach((change) => {
                    nextGrid[change.index] = change.newTile
                  })
                  return nextGrid
                })
              }
            })
          }
          historyBufferRef.current.clear()
        }
        return
      }

      if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight || tilesetTileCount <= 0) {
        return
      }

      const targetTile = button === 2 ? 0 : selectedTileIndex

      if (tool === 'fill' && type === 'down') {
        performFloodFill(x, y, targetTile)
        return
      }

      if (tool === 'fill') {
        return
      }

      if (type === 'down') {
        isDrawingRef.current = true
        activeDrawButtonRef.current = button
        historyBufferRef.current.clear()
      }

      if (isDrawingRef.current) {
        const index = y * mapWidth + x
        setGrid((previousGrid) => {
          const currentTile = previousGrid[index]

          if (currentTile !== targetTile) {
            if (!historyBufferRef.current.has(index)) {
              historyBufferRef.current.set(index, currentTile)
            }
            return applyGridChanges(previousGrid, [{ index, color: targetTile }]) as number[]
          }

          return previousGrid
        })
      }
    },
    [mapHeight, mapWidth, performFloodFill, record, selectedTileIndex, tilesetTileCount, tool]
  )

  const activeTilesetLabel = tilesetPath
    ? getProjectAssetDisplayName(tilesetPath.split('/').pop() ?? 'Tileset')
    : 'No tileset selected'

  const applyWindowSplit = useCallback(
    (nextTopRows: number, nextBottomRows: number) => {
      const nextSplitSettings = getWindowSplitSettingsFromEditorRows(
        nextTopRows,
        nextBottomRows,
        mapHeight
      )

      if (
        nextSplitSettings.windowTopEnd === windowTopEnd &&
        nextSplitSettings.windowBottomStart === windowBottomStart
      ) {
        setWindowSplitInput(
          getWindowSplitInputState(
            nextSplitSettings.windowTopEnd,
            nextSplitSettings.windowBottomStart,
            mapHeight
          )
        )
        return
      }

      const previousSplitSettings = {
        windowTopEnd,
        windowBottomStart
      }

      record({
        undo: () => {
          setWindowTopEnd(previousSplitSettings.windowTopEnd)
          setWindowBottomStart(previousSplitSettings.windowBottomStart)
          setWindowSplitInput(
            getWindowSplitInputState(
              previousSplitSettings.windowTopEnd,
              previousSplitSettings.windowBottomStart,
              mapHeight
            )
          )
        },
        redo: () => {
          setWindowTopEnd(nextSplitSettings.windowTopEnd)
          setWindowBottomStart(nextSplitSettings.windowBottomStart)
          setWindowSplitInput(
            getWindowSplitInputState(
              nextSplitSettings.windowTopEnd,
              nextSplitSettings.windowBottomStart,
              mapHeight
            )
          )
        }
      })

      setWindowTopEnd(nextSplitSettings.windowTopEnd)
      setWindowBottomStart(nextSplitSettings.windowBottomStart)
      setWindowSplitInput(
        getWindowSplitInputState(
          nextSplitSettings.windowTopEnd,
          nextSplitSettings.windowBottomStart,
          mapHeight
        )
      )
    },
    [mapHeight, record, windowBottomStart, windowTopEnd]
  )

  const handleResize = () => {
    const nextWidth = Number.parseInt(inputSize.w, 10)
    const nextHeight = Number.parseInt(inputSize.h, 10)

    if (
      Number.isNaN(nextWidth) ||
      Number.isNaN(nextHeight) ||
      (nextWidth === mapWidth && nextHeight === mapHeight)
    ) {
      return
    }

    const previousWidth = mapWidth
    const previousHeight = mapHeight
    const previousGrid = [...grid]
    const nextGrid = Array.from(resizeGrid(grid, mapWidth, mapHeight, nextWidth, nextHeight, 0))
    const previousSplitSettings = normalizeWindowSplitSettings(
      windowTopEnd,
      windowBottomStart,
      previousHeight
    )
    const nextSplitSettings = normalizeWindowSplitSettings(windowTopEnd, windowBottomStart, nextHeight)

    record({
      undo: () => {
        setMapWidth(previousWidth)
        setMapHeight(previousHeight)
        setGrid(previousGrid)
        setInputSize({
          w: previousWidth.toString(),
          h: previousHeight.toString()
        })
        setWindowTopEnd(previousSplitSettings.windowTopEnd)
        setWindowBottomStart(previousSplitSettings.windowBottomStart)
        setWindowSplitInput(
          getWindowSplitInputState(
            previousSplitSettings.windowTopEnd,
            previousSplitSettings.windowBottomStart,
            previousHeight
          )
        )
      },
      redo: () => {
        setMapWidth(nextWidth)
        setMapHeight(nextHeight)
        setGrid(nextGrid)
        setInputSize({
          w: nextWidth.toString(),
          h: nextHeight.toString()
        })
        setWindowTopEnd(nextSplitSettings.windowTopEnd)
        setWindowBottomStart(nextSplitSettings.windowBottomStart)
        setWindowSplitInput(
          getWindowSplitInputState(
            nextSplitSettings.windowTopEnd,
            nextSplitSettings.windowBottomStart,
            nextHeight
          )
        )
      }
    })

    setMapWidth(nextWidth)
    setMapHeight(nextHeight)
    setGrid(nextGrid)
    setWindowTopEnd(nextSplitSettings.windowTopEnd)
    setWindowBottomStart(nextSplitSettings.windowBottomStart)
    setWindowSplitInput(
      getWindowSplitInputState(
        nextSplitSettings.windowTopEnd,
        nextSplitSettings.windowBottomStart,
        nextHeight
      )
    )
    fitToScreen()
  }

  const windowSplitModeLabel = useMemo(() => {
    if (windowTopEnd === 0) {
      return 'Full window'
    }

    if (windowBottomStart === 0) {
      return 'Top-only window'
    }

    return 'Top and bottom window'
  }, [windowBottomStart, windowTopEnd])

  const windowBottomRows = useMemo(
    () => getWindowBottomRows(windowBottomStart, mapHeight),
    [mapHeight, windowBottomStart]
  )

  return (
    <div className="main-layout">
      <div className="sidebar">
        <h3>{assetLabel} Editor</h3>

        {assetKind === 'tilemap' && (
          <div className="toolbox">
            <div className="input-row">
              <label>
                W:{' '}
                <input
                  value={inputSize.w}
                  onChange={(event) => setInputSize({ ...inputSize, w: event.target.value })}
                  onBlur={handleResize}
                />
              </label>
              <label>
                H:{' '}
                <input
                  value={inputSize.h}
                  onChange={(event) => setInputSize({ ...inputSize, h: event.target.value })}
                  onBlur={handleResize}
                />
              </label>
            </div>
          </div>
        )}

        <div className="toolbox">
          <h3>Tools</h3>
          <div className="button-row">
            <button
              style={{
                fontWeight: tool === 'brush' ? 'bold' : 'normal',
                backgroundColor: tool === 'brush' ? '#ddd' : undefined
              }}
              onClick={() => setTool('brush')}
            >
              Brush
            </button>
            <button
              style={{
                fontWeight: tool === 'fill' ? 'bold' : 'normal',
                backgroundColor: tool === 'fill' ? '#ddd' : undefined
              }}
              onClick={() => setTool('fill')}
            >
              Fill
            </button>
          </div>
        </div>

        {assetKind === 'window' && (
          <div className="toolbox">
            <h3>Window Split</h3>
            <p className="editor-modal-copy tilemap-editor__split-copy">{windowSplitModeLabel}</p>
            <div className="input-row">
              <label>
                Top Rows:{' '}
                <input
                  type="number"
                  min="0"
                  max={mapHeight.toString()}
                  value={windowSplitInput.topRows}
                  onChange={(event) => {
                    setWindowSplitInput((currentState) => ({
                      ...currentState,
                      topRows: event.target.value
                    }))
                  }}
                  onBlur={() => {
                    applyWindowSplit(
                      Number.parseInt(windowSplitInput.topRows || '0', 10),
                      Number.parseInt(windowSplitInput.bottomRows || '0', 10)
                    )
                  }}
                />
              </label>
              <label>
                Bottom Rows:{' '}
                <input
                  type="number"
                  min="0"
                  max={mapHeight.toString()}
                  value={windowSplitInput.bottomRows}
                  onChange={(event) => {
                    setWindowSplitInput((currentState) => ({
                      ...currentState,
                      bottomRows: event.target.value
                    }))
                  }}
                  onBlur={() => {
                    applyWindowSplit(
                      Number.parseInt(windowSplitInput.topRows || '0', 10),
                      Number.parseInt(windowSplitInput.bottomRows || '0', 10)
                    )
                  }}
                />
              </label>
            </div>
            <p className="tilemap-editor__split-hint">
              Top rows count from the top edge. Bottom rows count from the bottom edge. A zero
              top split still means a full window in the saved engine data.
            </p>
            <p className="tilemap-editor__split-hint">Window size is fixed to the 20x18 screen.</p>
          </div>
        )}

        <div className="toolbox">
          <h3>Misc</h3>
          {statusMessage && <div className="editor-status">{statusMessage}</div>}
          <div className="button-row">
            <button disabled={!canUndo} onClick={undo}>
              Undo
            </button>
            <button disabled={!canRedo} onClick={redo}>
              Redo
            </button>
          </div>
          <div className="button-row">
            <button onClick={() => void saveAsset()} disabled={!isLoaded || isSaving}>
              {isSaving ? 'Saving...' : isDirty ? 'Save*' : 'Save'}
            </button>
          </div>
          <div className="zoom-controls">
            <p className="zoom-text">Zoom: {Math.round(scale * 5)}%</p>
            <button onClick={fitToScreen} className="reset-btn">
              Reset View
            </button>
          </div>
        </div>

        <h3>Tileset</h3>
        <div className="toolbox">
          <p className="editor-modal-copy tilemap-editor__tileset-label">{activeTilesetLabel}</p>
          <div className="button-row" style={{ marginBottom: 0 }}>
            <button
              type="button"
              onClick={() => {
                void openTilesetPicker(false)
              }}
              disabled={isSwitchingTileset || isSaving}
            >
              {tilesetPath ? 'Select Tileset' : 'Choose Tileset'}
            </button>
          </div>
        </div>
        <div className="toolbox" style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}>
          <Tileset
            key={`${tilesetPath ?? 'no-tileset'}:${tilesetTileCount}`}
            ref={tilesetRef}
            onSelectTile={setSelectedTileIndex}
            selectedIndex={selectedTileIndex}
            className="tilemap-tileset"
            allowAdd={false}
          />
        </div>
      </div>

      <div
        ref={containerRef}
        className="grid-container"
        style={{ overflow: 'hidden', backgroundColor: '#202020' }}
      >
        <PixelCanvas
          grid={grid}
          width={mapWidth}
          height={mapHeight}
          tileset={tilesetImages}
          palette={[]}
          viewportSize={viewportSize}
          scale={scale}
          pan={pan}
          onPixelInput={handleTileInput}
          onPan={handlePan}
          onZoom={handleZoom}
          gridColor="rgba(15, 56, 15, 0.3)"
          eraserIndex={-1}
        />

        {assetKind === 'window' && windowTopEnd > 0 && (
          <div className="tilemap-editor__split-overlay" aria-hidden="true">
            <div
              className="tilemap-editor__split-section tilemap-editor__split-section--visible"
              style={{
                left: `${pan.x}px`,
                top: `${pan.y}px`,
                width: `${mapWidth * scale}px`,
                height: `${windowTopEnd * scale}px`
              }}
            />

            {windowBottomStart > windowTopEnd && (
              <>
                <div
                  className="tilemap-editor__split-section tilemap-editor__split-section--hidden"
                  style={{
                    left: `${pan.x}px`,
                    top: `${pan.y + windowTopEnd * scale}px`,
                    width: `${mapWidth * scale}px`,
                    height: `${(windowBottomStart - windowTopEnd) * scale}px`
                  }}
                />
                <div
                  className="tilemap-editor__split-section tilemap-editor__split-section--visible"
                  style={{
                    left: `${pan.x}px`,
                    top: `${pan.y + windowBottomStart * scale}px`,
                    width: `${mapWidth * scale}px`,
                    height: `${Math.max(0, (mapHeight - windowBottomStart) * scale)}px`
                  }}
                />
              </>
            )}

            {windowBottomStart === 0 && (
              <div
                className="tilemap-editor__split-section tilemap-editor__split-section--hidden"
                style={{
                  left: `${pan.x}px`,
                  top: `${pan.y + windowTopEnd * scale}px`,
                  width: `${mapWidth * scale}px`,
                  height: `${Math.max(0, (mapHeight - windowTopEnd) * scale)}px`
                }}
              />
            )}

            <div
              className="tilemap-editor__split-guide tilemap-editor__split-guide--top"
              style={getSplitGuideStyles(windowTopEnd, pan, scale, mapWidth)}
            />
            <div
              className="tilemap-editor__split-badge tilemap-editor__split-badge--top"
              style={getSplitBadgeStyles(windowTopEnd, pan, scale)}
            >
              Top Rows: {windowTopEnd}
            </div>

            {windowBottomStart > 0 && (
              <>
                <div
                  className="tilemap-editor__split-guide tilemap-editor__split-guide--bottom"
                  style={getSplitGuideStyles(windowBottomStart, pan, scale, mapWidth)}
                />
                <div
                  className="tilemap-editor__split-badge tilemap-editor__split-badge--bottom"
                  style={getSplitBadgeStyles(windowBottomStart, pan, scale)}
                >
                  Bottom Rows: {windowBottomRows}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {isClosePromptOpen && (
        <EditorClosePrompt
          assetLabel={getProjectAssetDisplayName(assetPath.split('/').pop() ?? assetLabel)}
          isBusy={isSaving}
          onCloseDecision={(decision) => {
            void handleCloseDecision(decision)
          }}
        />
      )}

      {isTilesetPickerOpen && (
        <div className="editor-modal-backdrop">
          <div className="editor-modal" role="dialog" aria-modal="true">
            <h2>{isTilesetSelectionRequired ? 'Choose A Tileset' : 'Select Tileset'}</h2>
            <p className="editor-modal-copy">
              {isTilesetSelectionRequired
                ? `This ${assetKind} needs a tileset before you can edit it.`
                : `Choose which tileset this ${assetKind} should use.`}
            </p>

            {tilesetPickerError && (
              <div className="editor-status" style={{ marginTop: '16px', marginBottom: 0 }}>
                {tilesetPickerError}
              </div>
            )}

            <div className="tilemap-editor__tileset-list" role="list">
              {isTilesetPickerLoading && (
                <div className="tilemap-editor__tileset-option tilemap-editor__tileset-option--empty">
                  Loading tilesets...
                </div>
              )}

              {!isTilesetPickerLoading && tilesetOptions.length === 0 && (
                <div className="tilemap-editor__tileset-option tilemap-editor__tileset-option--empty">
                  No tilesets were found in this project yet.
                </div>
              )}

              {!isTilesetPickerLoading &&
                tilesetOptions.map((option) => (
                  <button
                    key={option.path}
                    type="button"
                    className="tilemap-editor__tileset-option"
                    onClick={() => {
                      void handleSelectTileset(option.path)
                    }}
                    disabled={isSwitchingTileset}
                  >
                    <span>{option.name}</span>
                    <span className="tilemap-editor__tileset-path">{option.path}</span>
                  </button>
                ))}
            </div>

            <div className="editor-modal-actions">
              <button
                type="button"
                onClick={() => {
                  void openTilesetPicker(isTilesetSelectionRequired)
                }}
                disabled={isTilesetPickerLoading || isSwitchingTileset}
              >
                Refresh
              </button>
              {!isTilesetSelectionRequired && (
                <button
                  type="button"
                  onClick={() => {
                    setIsTilesetPickerOpen(false)
                    setTilesetPickerError(null)
                  }}
                  disabled={isSwitchingTileset}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
