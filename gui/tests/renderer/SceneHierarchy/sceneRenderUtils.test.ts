import { describe, expect, it } from 'vitest'
import {
  drawWindowToCanvas
} from '../../../src/renderer/src/components/SceneHierarchy/sceneRenderUtils'
import type { TilesetAssetDocument, WindowAssetDocument } from '../../../src/shared/projectAssets'

describe('sceneRenderUtils', () => {
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
})
