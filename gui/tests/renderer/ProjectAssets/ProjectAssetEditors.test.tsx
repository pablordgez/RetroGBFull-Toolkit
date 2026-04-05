import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpriteEditor } from '../../../src/renderer/src/components/SpriteEditor/SpriteEditor'
import { TilesetEditor } from '../../../src/renderer/src/components/Tileset/TilesetEditor'
import { TilemapEditor } from '../../../src/renderer/src/components/TilemapEditor/TilemapEditor'
import { WindowEditor } from '../../../src/renderer/src/components/TilemapEditor/WindowEditor'

const renderEditor = (entry: string, element: React.ReactElement) => {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="*" element={element} />
      </Routes>
    </MemoryRouter>
  )
}

describe('project asset editors', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads and saves sprite assets from the project file', async () => {
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'sprite',
      resourcePath: 'Sprites/Hero.rgbsprite.json',
      document: {
        kind: 'sprite',
        version: 1,
        width: 16,
        height: 16,
        fps: 8,
        is8x16Mode: false,
        currentFrame: 0,
        frames: [new Array(256).fill(2)],
        palette: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
        selectedColor: 2
      }
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(async (_projectPath, _assetPath, document) => ({
      assetKind: 'sprite',
      resourcePath: 'Sprites/Hero.rgbsprite.json',
      document
    }))

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

    expect(screen.getAllByDisplayValue('16')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Sprites/Hero.rgbsprite.json',
        expect.objectContaining({
          kind: 'sprite',
          width: 16,
          height: 16
        })
      )
    })
  })

  it('replaces export with save in the tileset and tilemap editors', async () => {
    vi.mocked(window.api.loadProjectAssetFile)
      .mockResolvedValueOnce({
        assetKind: 'tileset',
        resourcePath: 'Tilesets/Main.rgbtileset.json',
        document: {
          kind: 'tileset',
          version: 1,
          tiles: [new Array(64).fill(3)],
          palette: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
          selectedColor: 3,
          selectedTileIndex: 0
        }
      })
      .mockResolvedValueOnce({
        assetKind: 'tilemap',
        resourcePath: 'Maps/Room.rgbtilemap.json',
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
      })

    const { unmount } = renderEditor(
      '/tileset-editor?projectPath=%2Fprojects%2FAlpha&assetPath=Tilesets%2FMain.rgbtileset.json',
      <TilesetEditor />
    )

    await waitFor(() => {
      expect(window.api.loadProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Tilesets/Main.rgbtileset.json'
      )
    })

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'EXPORT DATA' })).not.toBeInTheDocument()

    unmount()

    renderEditor(
      '/tilemap-editor?projectPath=%2Fprojects%2FAlpha&assetPath=Maps%2FRoom.rgbtilemap.json',
      <TilemapEditor />
    )

    await waitFor(() => {
      expect(window.api.loadProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Maps/Room.rgbtilemap.json'
      )
    })

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'EXPORT DATA' })).not.toBeInTheDocument()
  })

  it('prompts to save sprite changes before closing an edited asset', async () => {
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
        palette: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
        selectedColor: 3
      }
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(async (_projectPath, _assetPath, document) => ({
      assetKind: 'sprite',
      resourcePath: 'Sprites/Hero.rgbsprite.json',
      document
    }))

    renderEditor(
      '/sprite-editor?projectPath=%2Fprojects%2FAlpha&assetPath=Sprites%2FHero.rgbsprite.json',
      <SpriteEditor />
    )

    await waitFor(() => {
      expect(window.api.loadProjectAssetFile).toHaveBeenCalled()
    })

    const widthInput = screen.getAllByRole('spinbutton')[0]
    fireEvent.change(widthInput, { target: { value: '16' } })
    fireEvent.blur(widthInput)

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
          width: 16
        })
      )
    })
    await waitFor(() => {
      expect(window.api.confirmEditorClose).toHaveBeenCalled()
    })
  })

  it('requires choosing a tileset the first time a tilemap is opened', async () => {
    vi.mocked(window.api.getProjectResources).mockReset()
    vi.mocked(window.api.loadProjectAssetFile).mockReset()
    vi.mocked(window.api.saveProjectAssetFile).mockReset()

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
          resourcePath: 'Maps/Room.rgbtilemap.json',
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

      return {
        assetKind: 'tileset',
        resourcePath: 'Main.rgbtileset.json',
        document: {
          kind: 'tileset',
          version: 1,
          tiles: [new Array(64).fill(0), new Array(64).fill(1)],
          palette: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
          selectedColor: 3,
          selectedTileIndex: 0
        }
      }
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(async (_projectPath, _assetPath, document) => ({
      assetKind: 'tilemap',
      resourcePath: 'Maps/Room.rgbtilemap.json',
      document
    }))

    renderEditor(
      '/tilemap-editor?projectPath=%2Fprojects%2FAlpha&assetPath=Maps%2FRoom.rgbtilemap.json',
      <TilemapEditor />
    )

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('This tilemap needs a tileset before you can edit it.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'MainMain.rgbtileset.json' }))

    await waitFor(() => {
      expect(window.api.loadProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Main.rgbtileset.json'
      )
    })
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

  it('clamps out of bounds tiles when switching tilesets and supports undo redo', async () => {
    vi.mocked(window.api.getProjectResources).mockReset()
    vi.mocked(window.api.loadProjectAssetFile).mockReset()
    vi.mocked(window.api.saveProjectAssetFile).mockReset()

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
          resourcePath: 'Maps/Room.rgbtilemap.json',
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

      if (assetPath === 'Large.rgbtileset.json') {
        return {
          assetKind: 'tileset',
          resourcePath: 'Large.rgbtileset.json',
          document: {
            kind: 'tileset',
            version: 1,
            tiles: [
              new Array(64).fill(0),
              new Array(64).fill(1),
              new Array(64).fill(2),
              new Array(64).fill(3)
            ],
            palette: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
            selectedColor: 3,
            selectedTileIndex: 0
          }
        }
      }

      return {
        assetKind: 'tileset',
        resourcePath: 'Small.rgbtileset.json',
        document: {
          kind: 'tileset',
          version: 1,
          tiles: [new Array(64).fill(0), new Array(64).fill(1)],
          palette: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
          selectedColor: 3,
          selectedTileIndex: 0
        }
      }
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(async (_projectPath, _assetPath, document) => ({
      assetKind: 'tilemap',
      resourcePath: 'Maps/Room.rgbtilemap.json',
      document
    }))

    renderEditor(
      '/tilemap-editor?projectPath=%2Fprojects%2FAlpha&assetPath=Maps%2FRoom.rgbtilemap.json',
      <TilemapEditor />
    )

    await waitFor(() => {
      expect(window.api.loadProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Large.rgbtileset.json'
      )
    })

    expect(screen.getByText('Large')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select Tileset' }))
    fireEvent.click(await screen.findByRole('button', { name: 'SmallSmall.rgbtileset.json' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Small')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))
    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenLastCalledWith(
        '/projects/Alpha',
        'Maps/Room.rgbtilemap.json',
        expect.objectContaining({
          kind: 'tilemap',
          tilesetPath: 'Small.rgbtileset.json',
          grid: [0, 1],
          selectedTileIndex: 0
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
          kind: 'tilemap',
          tilesetPath: 'Large.rgbtileset.json',
          grid: [3, 1],
          selectedTileIndex: 3
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
          kind: 'tilemap',
          tilesetPath: 'Small.rgbtileset.json',
          grid: [0, 1],
          selectedTileIndex: 0
        })
      )
    })
  })

  it('loads and saves window assets and normalizes split settings', async () => {
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
            windowTopEnd: 2,
            windowBottomStart: 0
          }
        }
      }

      return {
        assetKind: 'tileset',
        resourcePath: 'Main.rgbtileset.json',
        document: {
          kind: 'tileset',
          version: 1,
          tiles: [new Array(64).fill(0), new Array(64).fill(1)],
          palette: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
          selectedColor: 3,
          selectedTileIndex: 0
        }
      }
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(async (_projectPath, _assetPath, document) => ({
      assetKind: 'window',
      resourcePath: 'UI/Main.rgbwindow.json',
      document
    }))

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

    const bottomInput = screen.getByRole('spinbutton', { name: /bottom rows/i })
    fireEvent.change(bottomInput, { target: { value: '1' } })
    fireEvent.blur(bottomInput)

    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'UI/Main.rgbwindow.json',
        expect.objectContaining({
          kind: 'window',
          windowTopEnd: 2,
          windowBottomStart: 3
        })
      )
    })
  })
})
