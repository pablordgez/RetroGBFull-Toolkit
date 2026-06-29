import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
  type WindowVisibilityBand,
  WINDOW_VISIBILITY_MAX_BANDS,
  WINDOW_VISIBILITY_SCREEN_HEIGHT,
  WINDOW_VISIBILITY_TILE_ROWS,
  WINDOW_VISIBILITY_TILE_SIZE,
  getProjectAssetDisplayName,
  normalizeWindowVisibilityTileBands
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

const isWindowAssetDocument = (
  document: TileGridAssetDocument
): document is WindowAssetDocument => {
  return document.kind === 'window'
}

const getWindowVisibilityTileRows = (bands: WindowVisibilityBand[]): boolean[] => {
  const rows = new Array(WINDOW_VISIBILITY_TILE_ROWS).fill(false)

  normalizeWindowVisibilityTileBands(bands).forEach((band) => {
    for (
      let row = band.start / WINDOW_VISIBILITY_TILE_SIZE;
      row < band.end / WINDOW_VISIBILITY_TILE_SIZE;
      row += 1
    ) {
      rows[row] = true
    }
  })

  return rows
}

const getWindowVisibilityBandsFromTileRows = (rows: boolean[]): WindowVisibilityBand[] => {
  const bands: WindowVisibilityBand[] = []
  let start: number | null = null

  for (let row = 0; row <= WINDOW_VISIBILITY_TILE_ROWS; row += 1) {
    const isVisible = rows[row] ?? false

    if (isVisible && start === null) {
      start = row
    } else if (!isVisible && start !== null) {
      bands.push({
        start: start * WINDOW_VISIBILITY_TILE_SIZE,
        end: row * WINDOW_VISIBILITY_TILE_SIZE
      })
      start = null
    }
  }

  return normalizeWindowVisibilityTileBands(bands)
}

const getWindowVisibilityBandCountAfterToggle = (
  bands: WindowVisibilityBand[],
  row: number
): number => {
  const rows = getWindowVisibilityTileRows(bands)
  rows[row] = !rows[row]
  return getWindowVisibilityBandsFromTileRows(rows).length
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
  const [windowVisibilityBands, setWindowVisibilityBands] = useState<WindowVisibilityBand[]>([
    { start: 0, end: WINDOW_VISIBILITY_SCREEN_HEIGHT }
  ])
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
      return {
        kind: 'window',
        version: 1,
        width: mapWidth,
        height: mapHeight,
        grid,
        tilesetPath,
        selectedTileIndex,
        tool,
        windowVisibilityBands: normalizeWindowVisibilityTileBands(windowVisibilityBands)
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
    windowVisibilityBands
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
      setWindowVisibilityBands(normalizeWindowVisibilityTileBands(nextDocument.windowVisibilityBands))
    } else {
      setWindowVisibilityBands([{ start: 0, end: WINDOW_VISIBILITY_SCREEN_HEIGHT }])
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
        .filter(
          (resource): resource is typeof resource & { type: 'file'; resourceType: 'tileset' } => {
            return resource.type === 'file' && resource.resourceType === 'tileset'
          }
        )
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

      const pixelsToFill = floodFill(
        x,
        y,
        mapWidth,
        mapHeight,
        (gx, gy) => grid[gy * mapWidth + gx]
      )

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
            const changes = Array.from(historyBufferRef.current.entries()).map(
              ([index, oldTile]) => ({
                index,
                oldTile,
                newTile: appliedButton === 2 ? 0 : selectedTileIndex
              })
            )

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

  const applyWindowVisibilityBands = useCallback(
    (nextBands: WindowVisibilityBand[]) => {
      const normalizedBands = normalizeWindowVisibilityTileBands(nextBands)
      const previousBands = normalizeWindowVisibilityTileBands(windowVisibilityBands)

      if (JSON.stringify(normalizedBands) === JSON.stringify(previousBands)) {
        return
      }

      record({
        undo: () => {
          setWindowVisibilityBands(previousBands)
        },
        redo: () => {
          setWindowVisibilityBands(normalizedBands)
        }
      })

      setWindowVisibilityBands(normalizedBands)
    },
    [record, windowVisibilityBands]
  )

  const handleWindowTileRowToggle = useCallback(
    (row: number) => {
      const rows = getWindowVisibilityTileRows(windowVisibilityBands)
      rows[row] = !rows[row]
      const nextBands = getWindowVisibilityBandsFromTileRows(rows)

      if (nextBands.length > WINDOW_VISIBILITY_MAX_BANDS) {
        setStatusMessage(`Window visibility is limited to ${WINDOW_VISIBILITY_MAX_BANDS} bands.`)
        return
      }

      setStatusMessage(null)
      applyWindowVisibilityBands(nextBands)
    },
    [applyWindowVisibilityBands, setStatusMessage, windowVisibilityBands]
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

    record({
      undo: () => {
        setMapWidth(previousWidth)
        setMapHeight(previousHeight)
        setGrid(previousGrid)
        setInputSize({
          w: previousWidth.toString(),
          h: previousHeight.toString()
        })
      },
      redo: () => {
        setMapWidth(nextWidth)
        setMapHeight(nextHeight)
        setGrid(nextGrid)
        setInputSize({
          w: nextWidth.toString(),
          h: nextHeight.toString()
        })
      }
    })

    setMapWidth(nextWidth)
    setMapHeight(nextHeight)
    setGrid(nextGrid)
    fitToScreen()
  }

  const normalizedWindowVisibilityBands = useMemo(
    () => normalizeWindowVisibilityTileBands(windowVisibilityBands),
    [windowVisibilityBands]
  )
  const windowVisibilityTileRows = useMemo(
    () => getWindowVisibilityTileRows(normalizedWindowVisibilityBands),
    [normalizedWindowVisibilityBands]
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
            <h3>Window Visibility</h3>
            <p className="editor-modal-copy tilemap-editor__split-copy">
              Bands: {normalizedWindowVisibilityBands.length} / {WINDOW_VISIBILITY_MAX_BANDS}
            </p>
            <div className="button-row">
              <button
                type="button"
                onClick={() =>
                  applyWindowVisibilityBands([
                    { start: 0, end: WINDOW_VISIBILITY_SCREEN_HEIGHT }
                  ])
                }
              >
                All On
              </button>
              <button type="button" onClick={() => applyWindowVisibilityBands([])}>
                All Off
              </button>
            </div>
            <p className="tilemap-editor__split-hint">
              Toggle tile rows in the rail beside the window preview.
            </p>
            <p className="tilemap-editor__split-hint">Fixed to 20x18.</p>
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
        <div
          className="toolbox"
          style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}
        >
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
          testId={`${assetKind}-editor-canvas`}
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

        {assetKind === 'window' && (
          <div className="tilemap-editor__split-overlay">
            {normalizedWindowVisibilityBands.map((band, index) => (
              <div
                key={`${band.start}-${band.end}-${index}`}
                className="tilemap-editor__split-section tilemap-editor__split-section--visible"
                style={{
                  left: `${pan.x}px`,
                  top: `${pan.y + (band.start / 8) * scale}px`,
                  width: `${mapWidth * scale}px`,
                  height: `${((band.end - band.start) / 8) * scale}px`
                }}
              />
            ))}

            <div
              className="tilemap-editor__tile-row-rail"
              style={{
                left: `${pan.x + mapWidth * scale + 12}px`,
                top: `${pan.y}px`,
                height: `${mapHeight * scale}px`
              }}
            >
              {Array.from({ length: WINDOW_VISIBILITY_TILE_ROWS }, (_, row) => {
                const isVisible = windowVisibilityTileRows[row]
                const wouldExceed =
                  !isVisible &&
                  getWindowVisibilityBandCountAfterToggle(
                    normalizedWindowVisibilityBands,
                    row
                  ) > WINDOW_VISIBILITY_MAX_BANDS

                return (
                  <button
                    key={row}
                    type="button"
                    className={`tilemap-editor__tile-row-toggle ${
                      isVisible ? 'tilemap-editor__tile-row-toggle--visible' : ''
                    }`}
                    style={{
                      top: `${(row / WINDOW_VISIBILITY_TILE_ROWS) * 100}%`
                    }}
                    aria-label={`Tile row ${row}`}
                    title={`Tile row ${row}`}
                    disabled={wouldExceed}
                    onClick={() => handleWindowTileRowToggle(row)}
                  />
                )
              })}
            </div>
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
                ? `Choose a tileset to edit this ${assetKind}.`
                : `Choose a tileset for this ${assetKind}.`}
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
                  No tilesets found.
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
