import { describe, expect, it, vi } from 'vitest'
import {
  drawTilemapToCanvas,
  drawWindowToCanvas
  ,
  renderIndexedBitmapToDataUrl,
  renderSpriteDocumentPreview
} from '../../../src/renderer/src/components/SceneHierarchy/sceneRenderUtils'
import type {
  SpriteAssetDocument,
  TilemapAssetDocument,
  TilesetAssetDocument,
  WindowAssetDocument
} from '../../../src/shared/projectAssets'

describe('sceneRenderUtils', () => {
  it('returns an empty data url when the canvas context is unavailable', () => {
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValueOnce(null)

    expect(renderIndexedBitmapToDataUrl([0], 1, 1, ['#000000'])).toBe('')

    getContextSpy.mockRestore()
  })

  it('renders sprite previews using the current frame and falls back to the first frame', () => {
    const currentFrameDocument: SpriteAssetDocument = {
      kind: 'sprite',
      version: 1,
      width: 1,
      height: 1,
      fps: 8,
      is8x16Mode: false,
      currentFrame: 1,
      frames: [[0], [1]],
      palette: ['#000000', '#ffffff'],
      selectedColor: 0
    }
    const fallbackFrameDocument: SpriteAssetDocument = {
      ...currentFrameDocument,
      currentFrame: 4
    }

    expect(renderSpriteDocumentPreview(currentFrameDocument)).toContain('data:image/png')
    expect(renderSpriteDocumentPreview(fallbackFrameDocument)).toContain('data:image/png')
  })

  it('draws tilemaps and skips missing tile references', () => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    expect(context).not.toBeNull()

    const tilemap: TilemapAssetDocument = {
      kind: 'tilemap',
      version: 1,
      width: 2,
      height: 1,
      grid: [0, 3],
      tilesetPath: null,
      selectedTileIndex: 0,
      tool: 'brush'
    }
    const tileset: TilesetAssetDocument = {
      kind: 'tileset',
      version: 1,
      tiles: [new Array(64).fill(1)],
      palette: ['#000000', '#ffffff'],
      selectedColor: 0,
      selectedTileIndex: 0
    }

    drawTilemapToCanvas(canvas, tilemap, tileset)

    const putImageDataCalls = (context!.putImageData as unknown as { mock: { calls: unknown[][] } }).mock
      .calls as [ImageData, number, number][]

    expect(canvas.width).toBe(16)
    expect(canvas.height).toBe(8)
    expect(putImageDataCalls).toHaveLength(1)
    expect(putImageDataCalls[0][1]).toBe(0)
    expect(putImageDataCalls[0][2]).toBe(0)
  })

  it('draws only the visible window rows and keeps the bottom section aligned to its source rows', () => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    expect(context).not.toBeNull()

    const tileset: TilesetAssetDocument = {
      kind: 'tileset',
      version: 1,
      tiles: [new Array(64).fill(0), new Array(64).fill(1)],
      palette: ['#000000', '#ffffff'],
      selectedColor: 0,
      selectedTileIndex: 0
    }

    const grid = new Array(20 * 18).fill(1)

    for (let tileY = 15; tileY < 18; tileY += 1) {
      for (let tileX = 0; tileX < 20; tileX += 1) {
        grid[tileY * 20 + tileX] = 0
      }
    }

    const windowDocument: WindowAssetDocument = {
      kind: 'window',
      version: 1,
      width: 20,
      height: 18,
      grid,
      tilesetPath: 'Tilesets/Main.rgbtileset.json',
      selectedTileIndex: 0,
      tool: 'brush',
      windowTopEnd: 2,
      windowBottomStart: 15
    }

    drawWindowToCanvas(canvas, windowDocument, tileset)

    const putImageDataCalls = (context!.putImageData as unknown as { mock: { calls: unknown[][] } }).mock
      .calls as [ImageData, number, number][]

    expect(putImageDataCalls.some(([, x, y]) => x === 0 && y === 0)).toBe(true)
    expect(putImageDataCalls.some(([, x, y]) => x === 0 && y === 8)).toBe(true)
    expect(putImageDataCalls.some(([, x, y]) => x === 0 && y === 16)).toBe(false)
    expect(putImageDataCalls.some(([, x, y]) => x === 0 && y === 14 * 8)).toBe(false)
    expect(putImageDataCalls.some(([, x, y]) => x === 0 && y === 15 * 8)).toBe(true)
    expect(putImageDataCalls.some(([, x, y]) => x === 0 && y === 17 * 8)).toBe(true)

    const topRowCall = putImageDataCalls.find(([, x, y]) => x === 0 && y === 0)
    const bottomRowCall = putImageDataCalls.find(([, x, y]) => x === 0 && y === 15 * 8)

    expect(topRowCall).toBeDefined()
    expect(bottomRowCall).toBeDefined()
    expect(Array.from(topRowCall![0].data.slice(0, 4))).toEqual([255, 255, 255, 255])
    expect(Array.from(bottomRowCall![0].data.slice(0, 4))).toEqual([0, 0, 0, 255])
  })

  it('renders a full-screen window when the top band covers the whole window', () => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    expect(context).not.toBeNull()

    const tileset: TilesetAssetDocument = {
      kind: 'tileset',
      version: 1,
      tiles: [new Array(64).fill(1)],
      palette: ['#000000', '#ffffff'],
      selectedColor: 0,
      selectedTileIndex: 0
    }
    const windowDocument: WindowAssetDocument = {
      kind: 'window',
      version: 1,
      width: 20,
      height: 18,
      grid: new Array(20 * 18).fill(0),
      tilesetPath: 'Tilesets/Main.rgbtileset.json',
      selectedTileIndex: 0,
      tool: 'brush',
      windowTopEnd: 0,
      windowBottomStart: 0
    }

    drawWindowToCanvas(canvas, windowDocument, tileset)

    const putImageDataCalls = (context!.putImageData as unknown as { mock: { calls: unknown[][] } }).mock
      .calls as [ImageData, number, number][]

    expect(putImageDataCalls.some(([, x, y]) => x === 0 && y === 17 * 8)).toBe(true)
  })
})
