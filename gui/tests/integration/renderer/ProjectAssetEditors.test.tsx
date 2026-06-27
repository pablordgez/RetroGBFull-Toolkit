import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const tilesetPayload = (resourcePath = 'Main.rgbtileset.json', tileCount = 2) => ({
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

describe('project asset editor integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads, edits, saves, and handles close prompts for sprite assets', async () => {
    let closeListener: (() => void) | undefined

    vi.mocked(window.api.onEditorCloseRequested).mockImplementation((listener) => {
      closeListener = listener
      return () => undefined
    })
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
        selectedColor: 3
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
      expect(window.api.loadProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Sprites/Hero.rgbsprite.json'
      )
    })

    const widthInput = screen.getAllByRole('spinbutton')[0]
    fireEvent.change(widthInput, { target: { value: '16' } })
    fireEvent.blur(widthInput)
    fireEvent.click(screen.getByRole('checkbox', { name: /8x16 mode/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save*' })).toBeInTheDocument()
    })

    await act(async () => {
      closeListener?.()
    })

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Sprites/Hero.rgbsprite.json',
        expect.objectContaining({
          kind: 'sprite',
          width: 16,
          is8x16Mode: true
        })
      )
    })
    await waitFor(() => {
      expect(window.api.confirmEditorClose).toHaveBeenCalled()
    })
  })

  it('loads, saves, and removes tiles in the tileset editor', async () => {
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue(tilesetPayload('Tilesets/Main.rgbtileset.json', 2))
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
      expect(window.api.loadProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Tilesets/Main.rgbtileset.json'
      )
    })

    fireEvent.contextMenu(screen.getByTitle('Tile 0'))
    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Tilesets/Main.rgbtileset.json',
        expect.objectContaining({
          kind: 'tileset',
          tiles: [new Array(64).fill(1)],
          selectedTileIndex: 0
        })
      )
    })
  })

  it('requires a tileset for new tilemaps and persists the selection', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          name: 'Main',
          fileName: 'Main.rgbtileset.json',
          path: 'Main.rgbtileset.json',
          extension: 'json',
          resourceType: 'tileset'
        }
      ]
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(async (_projectPath, assetPath) => {
      if (assetPath === 'Maps/Room.rgbtilemap.json') {
        return {
          assetKind: 'tilemap',
          resourcePath: assetPath,
          document: {
            kind: 'tilemap',
            version: 1,
            width: 20,
            height: 18,
            grid: new Array(20 * 18).fill(0),
            tilesetPath: null,
            selectedTileIndex: 0,
            tool: 'brush'
          }
        }
      }

      return tilesetPayload()
    })
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

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'MainMain.rgbtileset.json' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Maps/Room.rgbtilemap.json',
        expect.objectContaining({
          kind: 'tilemap',
          tilesetPath: 'Main.rgbtileset.json'
        })
      )
    })
  })

  it('switches tilemap tilesets, clamps invalid tile indexes, and supports undo and redo', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          name: 'Large',
          fileName: 'Large.rgbtileset.json',
          path: 'Large.rgbtileset.json',
          extension: 'json',
          resourceType: 'tileset'
        },
        {
          type: 'file',
          name: 'Small',
          fileName: 'Small.rgbtileset.json',
          path: 'Small.rgbtileset.json',
          extension: 'json',
          resourceType: 'tileset'
        }
      ]
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(async (_projectPath, assetPath) => {
      if (assetPath === 'Maps/Room.rgbtilemap.json') {
        return {
          assetKind: 'tilemap',
          resourcePath: assetPath,
          document: {
            kind: 'tilemap',
            version: 1,
            width: 2,
            height: 1,
            grid: [3, 1],
            tilesetPath: 'Large.rgbtileset.json',
            selectedTileIndex: 3,
            tool: 'brush'
          }
        }
      }

      return tilesetPayload(assetPath, assetPath === 'Small.rgbtileset.json' ? 2 : 4)
    })
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
      expect(screen.getByText('Large')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select Tileset' }))
    fireEvent.click(await screen.findByRole('button', { name: 'SmallSmall.rgbtileset.json' }))

    await waitFor(() => {
      expect(screen.getByText('Small')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))
    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenLastCalledWith(
        '/projects/Alpha',
        'Maps/Room.rgbtilemap.json',
        expect.objectContaining({
          grid: [0, 1],
          selectedTileIndex: 0,
          tilesetPath: 'Small.rgbtileset.json'
        })
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save*' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenLastCalledWith(
        '/projects/Alpha',
        'Maps/Room.rgbtilemap.json',
        expect.objectContaining({
          grid: [3, 1],
          selectedTileIndex: 3,
          tilesetPath: 'Large.rgbtileset.json'
        })
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save*' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenLastCalledWith(
        '/projects/Alpha',
        'Maps/Room.rgbtilemap.json',
        expect.objectContaining({
          grid: [0, 1],
          selectedTileIndex: 0,
          tilesetPath: 'Small.rgbtileset.json'
        })
      )
    })
  })

  it('loads and saves window visibility settings through the shared tile-grid editor', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(async (_projectPath, assetPath) => {
      if (assetPath === 'UI/Main.rgbwindow.json') {
        return {
          assetKind: 'window',
          resourcePath: assetPath,
          document: {
            kind: 'window',
            version: 1,
            width: 20,
            height: 4,
            grid: new Array(80).fill(0),
            tilesetPath: 'Main.rgbtileset.json',
            selectedTileIndex: 0,
            tool: 'brush',
            windowVisibilityBands: [{ start: 0, end: 16 }]
          }
        }
      }

      return tilesetPayload()
    })
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

    await waitFor(() => {
      expect(window.api.loadProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'UI/Main.rgbwindow.json'
      )
    })

    expect(await screen.findByText('Bands: 1 / 8')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tile row 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'UI/Main.rgbwindow.json',
        expect.objectContaining({
          kind: 'window',
          windowVisibilityBands: [
            { start: 0, end: 16 },
            { start: 24, end: 32 }
          ]
        })
      )
    })
  })
})
