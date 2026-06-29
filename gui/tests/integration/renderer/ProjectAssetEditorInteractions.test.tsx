import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/renderer/src/components/PixelEditor/PixelCanvas', () => ({
  PixelCanvas: (props: {
    onPixelInput: (
      x: number,
      y: number,
      type: 'down' | 'move' | 'up' | 'leave',
      button: number
    ) => void
    onPan: (deltaX: number, deltaY: number) => void
    onZoom: (factor: number, originX: number, originY: number) => void
  }) => (
    <div data-testid="mock-pixel-canvas">
      <button
        type="button"
        onClick={() => {
          props.onPixelInput(0, 0, 'down', 0)
          props.onPixelInput(1, 0, 'move', 0)
          props.onPixelInput(1, 0, 'up', 0)
        }}
      >
        Draw Pixels
      </button>
      <button
        type="button"
        onClick={() => {
          props.onPixelInput(0, 0, 'down', 2)
          props.onPixelInput(0, 0, 'up', 2)
        }}
      >
        Erase Pixels
      </button>
      <button
        type="button"
        onClick={() => {
          props.onPan(4, 5)
          props.onZoom(1.2, 6, 7)
        }}
      >
        Move View
      </button>
    </div>
  )
}))

import { SpriteEditor } from '../../../src/renderer/src/components/SpriteEditor/SpriteEditor'
import { TilemapEditor } from '../../../src/renderer/src/components/TilemapEditor/TilemapEditor'
import { WindowEditor } from '../../../src/renderer/src/components/TilemapEditor/WindowEditor'
import { TilesetEditor } from '../../../src/renderer/src/components/Tileset/TilesetEditor'

const palette = ['#9bbc0f', '#8bac0f', '#306230', '#0f380f']

const renderEditor = (entry: string, element: React.ReactElement) => {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="*" element={element} />
      </Routes>
    </MemoryRouter>
  )
}

const tilesetPayload = (resourcePath = 'Main.rgbtileset.json', tileCount = 3) => ({
  assetKind: 'tileset' as const,
  resourcePath,
  document: {
    kind: 'tileset' as const,
    version: 1,
    tiles: Array.from({ length: tileCount }, (_value, index) => new Array(64).fill(index)),
    palette,
    selectedColor: 3,
    selectedTileIndex: 0
  }
})

describe('project asset editor interaction integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records sprite paint, animation, resize, undo, redo, save, and play flows', async () => {
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'sprite',
      resourcePath: 'Sprites/Hero.rgbsprite.json',
      document: {
        kind: 'sprite',
        version: 1,
        width: 8,
        height: 8,
        fps: 6,
        is8x16Mode: false,
        currentFrame: 0,
        frames: [new Array(64).fill(0)],
        palette,
        selectedColor: 2
      }
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(
      async (_projectPath, _assetPath, document) => ({
        assetKind: 'sprite',
        resourcePath: 'Sprites/Hero.rgbsprite.json',
        document
      })
    )

    renderEditor(
      '/sprite-editor?projectPath=%2Fprojects%2FAlpha&assetPath=Sprites%2FHero.rgbsprite.json',
      <SpriteEditor />
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Draw Pixels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Erase Pixels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move View' }))
    fireEvent.click(screen.getByTitle('Add Frame'))
    fireEvent.click(screen.getByRole('button', { name: '◀' }))
    fireEvent.click(screen.getByRole('button', { name: '▶' }))
    fireEvent.change(screen.getByDisplayValue('6'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: '►' }))
    fireEvent.click(screen.getByTitle('Delete Frame'))

    const heightInput = screen.getAllByRole('spinbutton')[1]
    fireEvent.change(heightInput, { target: { value: '24' } })
    fireEvent.keyDown(heightInput, { key: 'Enter' })

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Sprites/Hero.rgbsprite.json',
        expect.objectContaining({
          kind: 'sprite',
          fps: 12
        })
      )
    })
  })

  it('records tileset paint, tile creation, tile removal, undo, redo, and save flows', async () => {
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue(
      tilesetPayload('Tilesets/Main.rgbtileset.json', 1)
    )
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(
      async (_projectPath, _assetPath, document) => ({
        assetKind: 'tileset',
        resourcePath: 'Tilesets/Main.rgbtileset.json',
        document
      })
    )

    renderEditor(
      '/tileset-editor?projectPath=%2Fprojects%2FAlpha&assetPath=Tilesets%2FMain.rgbtileset.json',
      <TilesetEditor />
    )

    await waitFor(() => {
      expect(screen.getByTitle('Tile 0')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Draw Pixels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }))
    fireEvent.click(screen.getByRole('button', { name: 'Erase Pixels' }))
    fireEvent.click(screen.getByText('+'))
    fireEvent.contextMenu(screen.getByTitle('Tile 0'))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Tilesets/Main.rgbtileset.json',
        expect.objectContaining({
          kind: 'tileset'
        })
      )
    })
  })

  it('paints, fills, resizes, and handles picker errors in tilemaps', async () => {
    vi.mocked(window.api.getProjectResources).mockRejectedValueOnce(
      new Error('Tilesets unavailable')
    )
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath) => {
        if (assetPath === 'Maps/Room.rgbtilemap.json') {
          return {
            assetKind: 'tilemap',
            resourcePath: assetPath,
            document: {
              kind: 'tilemap',
              version: 1,
              width: 2,
              height: 2,
              grid: [0, 0, 1, 1],
              tilesetPath: 'Main.rgbtileset.json',
              selectedTileIndex: 1,
              tool: 'brush'
            }
          }
        }

        return tilesetPayload()
      }
    )
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(
      async (_projectPath, _assetPath, document) => ({
        assetKind: 'tilemap',
        resourcePath: 'Maps/Room.rgbtilemap.json',
        document
      })
    )

    renderEditor(
      '/tilemap-editor?projectPath=%2Fprojects%2FAlpha&assetPath=Maps%2FRoom.rgbtilemap.json',
      <TilemapEditor />
    )

    await waitFor(() => {
      expect(screen.getByText('Main')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Draw Pixels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }))
    fireEvent.click(screen.getByRole('button', { name: 'Draw Pixels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Brush' }))
    fireEvent.click(screen.getByRole('button', { name: 'Erase Pixels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move View' }))
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '3' } })
    fireEvent.blur(screen.getAllByRole('textbox')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Select Tileset' }))

    expect(await screen.findByText('Tilesets unavailable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))
    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Maps/Room.rgbtilemap.json',
        expect.objectContaining({
          kind: 'tilemap',
          width: 3,
          tool: 'brush'
        })
      )
    })
  })

  it('saves window visibility bands from tile row toggles', async () => {
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath) => {
        if (assetPath === 'UI/Main.rgbwindow.json') {
          return {
            assetKind: 'window',
            resourcePath: assetPath,
            document: {
              kind: 'window',
              version: 1,
              width: 20,
              height: 6,
              grid: new Array(120).fill(0),
              tilesetPath: 'Main.rgbtileset.json',
              selectedTileIndex: 0,
              tool: 'brush',
              windowVisibilityBands: [{ start: 0, end: 144 }]
            }
          }
        }

        return tilesetPayload()
      }
    )
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(
      async (_projectPath, _assetPath, document) => ({
        assetKind: 'window',
        resourcePath: 'UI/Main.rgbwindow.json',
        document
      })
    )

    renderEditor(
      '/window-editor?projectPath=%2Fprojects%2FAlpha&assetPath=UI%2FMain.rgbwindow.json',
      <WindowEditor />
    )

    expect(await screen.findByText('Bands: 1 / 8')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'All Off' }))
    expect(await screen.findByText('Bands: 0 / 8')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tile row 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tile row 2' }))
    expect(await screen.findByText('Bands: 2 / 8')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Save\*?$/ }))
    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'UI/Main.rgbwindow.json',
        expect.objectContaining({
          kind: 'window',
          windowVisibilityBands: [
            { start: 0, end: 8 },
            { start: 16, end: 24 }
          ]
        })
      )
    })
  })
})
