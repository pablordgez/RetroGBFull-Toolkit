import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROJECT_ASSET_DRAG_MIME } from '../../../src/renderer/src/components/ProjectAssets/projectAssetDrag'
import { ProjectWorkspace } from '../../../src/renderer/src/components/ProjectWorkspace/ProjectWorkspace'

const renderWorkspace = (entry: string, { strictMode = false }: { strictMode?: boolean } = {}) => {
  const workspace = (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/project-editor" element={<ProjectWorkspace />} />
      </Routes>
    </MemoryRouter>
  )

  return render(strictMode ? <React.StrictMode>{workspace}</React.StrictMode> : workspace)
}

const renderWorkspaceAndWait = async (
  entry: string,
  options?: { strictMode?: boolean }
) => {
  const renderedWorkspace = renderWorkspace(entry, options)

  await waitFor(() => {
    expect(window.api.getProjectResources).toHaveBeenCalled()
  })

  return renderedWorkspace
}

const openProjectMenu = () => {
  fireEvent.click(screen.getByRole('menuitem', { name: 'Project' }))
}

const getShortcutLabel = (key: string) => {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? `\u2318${key}` : `Ctrl+${key}`
}

const createMockDataTransfer = () => {
  const data = new Map<string, string>()

  return {
    dropEffect: 'none',
    effectAllowed: 'none',
    get types() {
      return Array.from(data.keys())
    },
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value)
    }),
    getData: vi.fn((type: string) => data.get(type) ?? '')
  }
}

describe('<ProjectWorkspace />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.api.openProjectAssetEditor).mockResolvedValue(true)
    vi.mocked(window.api.getRecentProjects).mockResolvedValue([])
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'MockProject',
      projectPath: '/projects/MockProject',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.scanProjectDirectory).mockResolvedValue({
      trackedCount: 0,
      removedCount: 0
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders an empty gray workspace surface with a bottom dock pane', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    expect(screen.getByTestId('project-workspace-surface')).toBeInTheDocument()
    expect(screen.getByTestId('resource-management-pane')).toBeInTheDocument()
    expect(screen.getByText('Create or load a new scene to start working')).toBeInTheDocument()
  })

  it('opens a project from the integrated project menu', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.openProjectFromDialog).mockResolvedValue({
      ok: true,
      canceled: false,
      message: 'Opened "Beta".'
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    openProjectMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open project...' }))

    await waitFor(() => {
      expect(window.api.openProjectFromDialog).toHaveBeenCalledTimes(1)
    })
  })

  it('loads recent projects from the project menu submenu', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.getRecentProjects).mockResolvedValue([
      {
        name: 'Beta',
        path: '/projects/Beta',
        lastOpenedAt: '2026-03-27T12:00:00.000Z'
      }
    ])
    vi.mocked(window.api.loadRecentProject).mockResolvedValue({
      ok: true,
      canceled: false,
      message: 'Opened "Beta".'
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    openProjectMenu()
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Recent projects...' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Beta' }))

    await waitFor(() => {
      expect(window.api.loadRecentProject).toHaveBeenCalledWith('/projects/Beta')
    })
  })

  it('closes the project from the integrated project menu', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    openProjectMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close project' }))

    await waitFor(() => {
      expect(window.api.closeCurrentProject).toHaveBeenCalledTimes(1)
    })
  })

  it('opens the project folder in the file explorer and rescans tracked resources from the project menu', async () => {
    vi.mocked(window.api.getProjectResources)
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: []
      })
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          { type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }
        ]
      })
    vi.mocked(window.api.scanProjectDirectory).mockResolvedValue({
      trackedCount: 1,
      removedCount: 0
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )
    const initialResourceLoadCount = vi.mocked(window.api.getProjectResources).mock.calls.length

    openProjectMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open project in file explorer' }))

    await waitFor(() => {
      expect(window.api.openProjectInFileExplorer).toHaveBeenCalledWith('/projects/Alpha')
    })

    openProjectMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Scan project directory' }))

    await waitFor(() => {
      expect(window.api.scanProjectDirectory).toHaveBeenCalledWith('/projects/Alpha')
    })
    await waitFor(() => {
      expect(window.api.getProjectResources.mock.calls.length).toBeGreaterThan(
        initialResourceLoadCount
      )
    })
    expect(await screen.findByText('Tracked 1 new resource.')).toBeInTheDocument()
    expect(await screen.findByText('Sprites')).toBeInTheDocument()
  })

  it('resizes the bottom asset manager pane when the separator is dragged', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })

    const boundingRect = {
      x: 0,
      y: 0,
      width: 1280,
      height: 900,
      top: 0,
      right: 1280,
      bottom: 900,
      left: 0,
      toJSON: () => ''
    }

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => boundingRect)

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const dockPaneWrapper = screen
      .getByTestId('resource-management-pane')
      .closest('.resizable-pane-layout__pane')
    const separator = screen.getByRole('separator', { name: 'Resize bottom pane' })

    expect(dockPaneWrapper).toHaveStyle({ height: '220px' })

    fireEvent.pointerDown(separator, { clientY: 620, clientX: 200 })
    fireEvent.pointerMove(window, { clientY: 700, clientX: 200 })
    fireEvent.pointerUp(window)

    expect(dockPaneWrapper).toHaveStyle({ height: '200px' })
  })

  it('opens the resource management context menu with the new submenu entries', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    fireEvent.contextMenu(screen.getByTestId('resource-management-pane'), {
      clientX: 80,
      clientY: 120
    })

    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'New...' }))

    expect(screen.getByRole('menuitem', { name: 'Folder' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sprite' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Tileset' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Tilemap' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Window' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Script' })).toBeInTheDocument()
  })

  it('creates a folder and immediately opens inline rename mode', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.createProjectResource).mockResolvedValue({
      resourceType: 'folder',
      resourcePath: 'New Folder',
      resourceName: 'New Folder',
      parentPath: '',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'New Folder',
            path: 'New Folder',
            parentPath: null
          }
        ]
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    fireEvent.contextMenu(screen.getByTestId('resource-management-pane'), {
      clientX: 80,
      clientY: 120
    })
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'New...' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Folder' }))

    expect(window.api.createProjectResource).toHaveBeenCalledWith('/projects/Alpha', 'folder', '')
    expect(await screen.findByLabelText('Folder name for New Folder')).toHaveValue('New Folder')
  })

  it('creates sprite assets and opens them in the matching editor on double click', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.createProjectResource).mockResolvedValue({
      resourceType: 'sprite',
      resourcePath: 'New Sprite.rgbsprite.json',
      resourceName: 'New Sprite',
      parentPath: '',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          {
            type: 'file',
            name: 'New Sprite',
            fileName: 'New Sprite.rgbsprite.json',
            path: 'New Sprite.rgbsprite.json',
            extension: 'json',
            resourceType: 'sprite'
          }
        ]
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    fireEvent.contextMenu(screen.getByTestId('resource-management-pane'), {
      clientX: 80,
      clientY: 120
    })
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'New...' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sprite' }))

    expect(window.api.createProjectResource).toHaveBeenCalledWith('/projects/Alpha', 'sprite', '')
    expect(await screen.findByLabelText('Sprite name for New Sprite')).toHaveValue('New Sprite')

    const renameInput = screen.getByLabelText('Sprite name for New Sprite')
    fireEvent.blur(renameInput)

    const spriteTile = await screen.findByText('New Sprite')
    fireEvent.doubleClick(spriteTile.closest('button')!)

    await waitFor(() => {
      expect(window.api.openProjectAssetEditor).toHaveBeenCalledWith(
        'sprite',
        '/projects/Alpha',
        'New Sprite.rgbsprite.json'
      )
    })
  })

  it('creates window assets and opens them in the matching editor on double click', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.createProjectResource).mockResolvedValue({
      resourceType: 'window',
      resourcePath: 'New Window.rgbwindow.json',
      resourceName: 'New Window',
      parentPath: '',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          {
            type: 'file',
            name: 'New Window',
            fileName: 'New Window.rgbwindow.json',
            path: 'New Window.rgbwindow.json',
            extension: 'json',
            resourceType: 'window'
          }
        ]
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    fireEvent.contextMenu(screen.getByTestId('resource-management-pane'), {
      clientX: 80,
      clientY: 120
    })
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'New...' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Window' }))

    expect(window.api.createProjectResource).toHaveBeenCalledWith('/projects/Alpha', 'window', '')
    expect(await screen.findByLabelText('Window name for New Window')).toHaveValue('New Window')

    const renameInput = screen.getByLabelText('Window name for New Window')
    fireEvent.blur(renameInput)

    const windowTile = await screen.findByText('New Window')
    fireEvent.doubleClick(windowTile.closest('button')!)

    await waitFor(() => {
      expect(window.api.openProjectAssetEditor).toHaveBeenCalledWith(
        'window',
        '/projects/Alpha',
        'New Window.rgbwindow.json'
      )
    })
  })

  it('opens folders on double click and goes back to the parent view', async () => {
    vi.mocked(window.api.getProjectResources)
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          { type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }
        ]
      })
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: 'Sprites',
        parentPath: '',
        items: [
          {
            type: 'file',
            id: 'asset-1',
            name: 'Hero',
            fileName: 'Hero.rgbsprite.json',
            path: 'Sprites/Hero.rgbsprite.json',
            parentPath: 'Sprites',
            extension: 'json',
            resourceType: 'sprite'
          }
        ]
      })
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          { type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }
        ]
      })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const folderLabel = await screen.findByText('Sprites')
    fireEvent.doubleClick(folderLabel.closest('button')!)

    await waitFor(() => {
      expect(window.api.getProjectResources).toHaveBeenCalledWith('/projects/Alpha', 'Sprites')
    })
    expect(await screen.findByRole('button', { name: 'Back' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() => {
      expect(window.api.getProjectResources).toHaveBeenLastCalledWith('/projects/Alpha', '')
    })
  })

  it('shows a friendly error and removes a missing folder after double click', async () => {
    vi.mocked(window.api.getProjectResources)
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          { type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }
        ]
      })
      .mockRejectedValueOnce(
        new Error('The folder "Sprites" could not be found, so it was removed from the project.')
      )
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: []
      })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    fireEvent.doubleClick(screen.getByText('Sprites').closest('button')!)

    expect(
      await screen.findByText(
        'The folder "Sprites" could not be found, so it was removed from the project.'
      )
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Sprites')).not.toBeInTheDocument()
    })
  })

  it('shows a friendly error and removes a missing asset after double click', async () => {
    vi.mocked(window.api.getProjectResources)
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          {
            type: 'file',
            name: 'Hero',
            fileName: 'Hero.rgbsprite.json',
            path: 'Hero.rgbsprite.json',
            extension: 'json',
            resourceType: 'sprite'
          }
        ]
      })
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: []
      })
    vi.mocked(window.api.openProjectAssetEditor).mockRejectedValueOnce(
      new Error('The asset "Hero" could not be found, so it was removed from the project.')
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    fireEvent.doubleClick(screen.getByText('Hero').closest('button')!)

    expect(
      await screen.findByText(
        'The asset "Hero" could not be found, so it was removed from the project.'
      )
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Hero')).not.toBeInTheDocument()
    })
  })

  it('renames and deletes folders from the folder context menu', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        { type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }
      ]
    })
    vi.mocked(window.api.renameProjectResource).mockResolvedValue({
      resourceType: 'folder',
      resourcePath: 'Sprites HD',
      resourceName: 'Sprites HD',
      parentPath: '',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Sprites HD',
            path: 'Sprites HD',
            parentPath: null
          }
        ]
      }
    })
    vi.mocked(window.api.deleteProjectResource).mockResolvedValue({
      resourceType: 'folder',
      resourcePath: 'Sprites HD',
      resourceName: 'Sprites HD',
      parentPath: '',
      deletionId: 'delete-sprites-hd',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: []
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const folderLabel = await screen.findByText('Sprites')
    fireEvent.contextMenu(folderLabel, { clientX: 120, clientY: 160 })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))

    const renameInput = await screen.findByLabelText('Folder name for Sprites')
    fireEvent.change(renameInput, { target: { value: 'Sprites HD' } })
    fireEvent.keyDown(renameInput, { key: 'Enter' })

    await waitFor(() => {
      expect(window.api.renameProjectResource).toHaveBeenCalledWith(
        '/projects/Alpha',
        'folder',
        'Sprites',
        'Sprites HD'
      )
    })

    const renamedFolderLabel = await screen.findByText('Sprites HD')
    fireEvent.contextMenu(renamedFolderLabel, { clientX: 120, clientY: 160 })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(window.api.deleteProjectResource).toHaveBeenCalledWith(
        '/projects/Alpha',
        'folder',
        'Sprites HD'
      )
    })
    expect(screen.queryByText('Sprites HD')).not.toBeInTheDocument()
  })

  it('shows copy, cut, and paste entries with shortcuts in the asset context menu', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          name: 'Hero',
          fileName: 'Hero.rgbsprite.json',
          path: 'Hero.rgbsprite.json',
          extension: 'json',
          resourceType: 'sprite'
        }
      ]
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    fireEvent.contextMenu(screen.getByText('Hero'), { clientX: 120, clientY: 160 })

    expect(await screen.findByRole('menuitem', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Cut' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Paste' })).toBeInTheDocument()
    expect(screen.getByText(getShortcutLabel('C'))).toBeInTheDocument()
    expect(screen.getByText(getShortcutLabel('X'))).toBeInTheDocument()
    expect(screen.getByText(getShortcutLabel('V'))).toBeInTheDocument()
  })

  it('copies a selected asset with the keyboard shortcut and pastes a duplicate into the current folder', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          name: 'Hero',
          fileName: 'Hero.rgbsprite.json',
          path: 'Hero.rgbsprite.json',
          extension: 'json',
          resourceType: 'sprite'
        }
      ]
    })
    vi.mocked(window.api.transferProjectResource).mockResolvedValue({
      resourceType: 'sprite',
      resourcePath: 'Hero 2.rgbsprite.json',
      resourceName: 'Hero 2',
      parentPath: '',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          {
            type: 'file',
            name: 'Hero',
            fileName: 'Hero.rgbsprite.json',
            path: 'Hero.rgbsprite.json',
            extension: 'json',
            resourceType: 'sprite'
          },
          {
            type: 'file',
            name: 'Hero 2',
            fileName: 'Hero 2.rgbsprite.json',
            path: 'Hero 2.rgbsprite.json',
            extension: 'json',
            resourceType: 'sprite'
          }
        ]
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    fireEvent.click(screen.getByText('Hero').closest('button')!)
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

    await waitFor(() => {
      expect(window.api.transferProjectResource).toHaveBeenCalledWith(
        '/projects/Alpha',
        'sprite',
        'Hero.rgbsprite.json',
        '',
        'copy'
      )
    })
    expect(await screen.findByText('Hero 2')).toBeInTheDocument()
  })

  it('cuts an asset from the context menu and pastes it into the opened folder', async () => {
    vi.mocked(window.api.getProjectResources)
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          { type: 'folder', id: 'folder-1', name: 'Archive', path: 'Archive', parentPath: null },
          {
            type: 'file',
            name: 'Hero',
            fileName: 'Hero.rgbsprite.json',
            path: 'Hero.rgbsprite.json',
            extension: 'json',
            resourceType: 'sprite'
          }
        ]
      })
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: 'Archive',
        parentPath: '',
        items: []
      })
    vi.mocked(window.api.transferProjectResource).mockResolvedValue({
      resourceType: 'sprite',
      resourcePath: 'Archive/Hero.rgbsprite.json',
      resourceName: 'Hero',
      parentPath: 'Archive',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: 'Archive',
        parentPath: '',
        items: [
          {
            type: 'file',
            name: 'Hero',
            fileName: 'Hero.rgbsprite.json',
            path: 'Archive/Hero.rgbsprite.json',
            extension: 'json',
            resourceType: 'sprite'
          }
        ]
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    fireEvent.contextMenu(screen.getByText('Hero'), { clientX: 120, clientY: 160 })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cut' }))

    fireEvent.doubleClick(screen.getByText('Archive').closest('button')!)

    await waitFor(() => {
      expect(window.api.getProjectResources).toHaveBeenCalledWith('/projects/Alpha', 'Archive')
    })

    fireEvent.contextMenu(screen.getByTestId('resource-management-pane'), {
      clientX: 80,
      clientY: 120
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Paste' }))

    await waitFor(() => {
      expect(window.api.transferProjectResource).toHaveBeenCalledWith(
        '/projects/Alpha',
        'sprite',
        'Hero.rgbsprite.json',
        'Archive',
        'move'
      )
    })
    expect(await screen.findByText('Hero')).toBeInTheDocument()
  })

  it('cuts a folder and pastes it into another folder', async () => {
    vi.mocked(window.api.transferProjectResource).mockClear()
    vi.mocked(window.api.getProjectResources)
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          { type: 'folder', id: 'folder-1', name: 'Archive', path: 'Archive', parentPath: null },
          { type: 'folder', id: 'folder-2', name: 'Sprites', path: 'Sprites', parentPath: null }
        ]
      })
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: 'Archive',
        parentPath: '',
        items: []
      })
    vi.mocked(window.api.transferProjectResource).mockResolvedValue({
      resourceType: 'folder',
      resourcePath: 'Archive/Sprites',
      resourceName: 'Sprites',
      parentPath: 'Archive',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: 'Archive',
        parentPath: '',
        items: [
          {
            type: 'folder',
            id: 'folder-2',
            name: 'Sprites',
            path: 'Archive/Sprites',
            parentPath: 'Archive'
          }
        ]
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    fireEvent.contextMenu(screen.getByText('Sprites'), { clientX: 120, clientY: 160 })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cut' }))

    fireEvent.doubleClick(screen.getByText('Archive').closest('button')!)

    await waitFor(() => {
      expect(window.api.getProjectResources).toHaveBeenCalledWith('/projects/Alpha', 'Archive')
    })

    fireEvent.contextMenu(screen.getByTestId('resource-management-pane'), {
      clientX: 80,
      clientY: 120
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Paste' }))

    await waitFor(() => {
      expect(window.api.transferProjectResource).toHaveBeenCalledWith(
        '/projects/Alpha',
        'folder',
        'Sprites',
        'Archive',
        'move'
      )
    })
    expect(await screen.findByText('Sprites')).toBeInTheDocument()
  })

  it('undoes and redoes asset creation by restoring the same hidden resource', async () => {
    vi.mocked(window.api.createProjectResource).mockClear()
    vi.mocked(window.api.deleteProjectResource).mockClear()
    vi.mocked(window.api.restoreDeletedProjectResource).mockClear()

    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.createProjectResource).mockResolvedValueOnce({
      resourceType: 'sprite',
      resourcePath: 'New Sprite.rgbsprite.json',
      resourceName: 'New Sprite',
      parentPath: '',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          {
            type: 'file',
            name: 'New Sprite',
            fileName: 'New Sprite.rgbsprite.json',
            path: 'New Sprite.rgbsprite.json',
            extension: 'json',
            resourceType: 'sprite'
          }
        ]
      }
    })
    vi.mocked(window.api.deleteProjectResource).mockResolvedValue({
      resourceType: 'sprite',
      resourcePath: 'New Sprite.rgbsprite.json',
      resourceName: 'New Sprite',
      parentPath: '',
      deletionId: 'delete-new-sprite',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: []
      }
    })
    vi.mocked(window.api.restoreDeletedProjectResource).mockResolvedValue({
      resourceType: 'sprite',
      resourcePath: 'New Sprite.rgbsprite.json',
      resourceName: 'New Sprite',
      parentPath: '',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          {
            type: 'file',
            name: 'New Sprite',
            fileName: 'New Sprite.rgbsprite.json',
            path: 'New Sprite.rgbsprite.json',
            extension: 'json',
            resourceType: 'sprite'
          }
        ]
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    fireEvent.contextMenu(screen.getByTestId('resource-management-pane'), {
      clientX: 80,
      clientY: 120
    })
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'New...' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sprite' }))

    const renameInput = await screen.findByLabelText('Sprite name for New Sprite')
    fireEvent.blur(renameInput)
    await waitFor(() => {
      expect(screen.queryByLabelText('Sprite name for New Sprite')).not.toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(window.api.deleteProjectResource).toHaveBeenLastCalledWith(
        '/projects/Alpha',
        'sprite',
        'New Sprite.rgbsprite.json',
        undefined
      )
    })
    expect(screen.queryByText('New Sprite')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })

    await waitFor(() => {
      expect(window.api.restoreDeletedProjectResource).toHaveBeenLastCalledWith(
        '/projects/Alpha',
        'delete-new-sprite'
      )
    })
    expect(window.api.createProjectResource).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('New Sprite')).toBeInTheDocument()
  })

  it('undoes folder deletion by restoring from hidden history storage', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        { type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }
      ]
    })
    vi.mocked(window.api.deleteProjectResource).mockResolvedValue({
      resourceType: 'folder',
      resourcePath: 'Sprites',
      resourceName: 'Sprites',
      parentPath: '',
      deletionId: 'delete-sprites',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: []
      }
    })
    vi.mocked(window.api.restoreDeletedProjectResource).mockResolvedValue({
      resourceType: 'folder',
      resourcePath: 'Sprites',
      resourceName: 'Sprites',
      parentPath: '',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          { type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }
        ]
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const folderLabel = await screen.findByText('Sprites')
    fireEvent.contextMenu(folderLabel, { clientX: 120, clientY: 160 })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(window.api.deleteProjectResource).toHaveBeenCalledWith(
        '/projects/Alpha',
        'folder',
        'Sprites'
      )
    })
    expect(screen.queryByText('Sprites')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(window.api.restoreDeletedProjectResource).toHaveBeenCalledWith(
        '/projects/Alpha',
        'delete-sprites'
      )
    })
    expect(await screen.findByText('Sprites')).toBeInTheDocument()
  })

  it('drops a tilemap resource onto the scene viewport to assign it to the open scene', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          name: 'Room Scene',
          fileName: 'Room Scene.rgbscene.json',
          path: 'Scenes/Room Scene.rgbscene.json',
          extension: 'json',
          resourceType: 'scene'
        },
        {
          type: 'file',
          name: 'Overworld',
          fileName: 'Overworld.rgbtilemap.json',
          path: 'Maps/Overworld.rgbtilemap.json',
          extension: 'json',
          resourceType: 'tilemap'
        }
      ]
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath) => {
        if (assetPath === 'Scenes/Room Scene.rgbscene.json') {
          return {
            assetKind: 'scene' as const,
            resourcePath: assetPath,
            document: {
              kind: 'scene' as const,
              version: 1,
              tilemapPath: null,
              windowPath: null,
              nodes: []
            }
          }
        }

        if (assetPath === 'Maps/Overworld.rgbtilemap.json') {
          return {
            assetKind: 'tilemap' as const,
            resourcePath: assetPath,
            document: {
              kind: 'tilemap' as const,
              version: 1,
              width: 20,
              height: 18,
              grid: new Array(20 * 18).fill(0),
              tilesetPath: null,
              selectedTileIndex: 0,
              tool: 'brush' as const
            }
          }
        }

        throw new Error(`Unexpected asset load: ${assetPath}`)
      }
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const resourcePane = screen.getByTestId('resource-management-pane')
    fireEvent.doubleClick(within(resourcePane).getByText('Room Scene').closest('button')!)

    await screen.findByText('Load a tilemap to visualize the scene bounds.')

    const tilemapButton = within(resourcePane).getByText('Overworld').closest('button')!
    const viewportSurface = screen.getByTestId('scene-viewport-surface')
    const dataTransfer = createMockDataTransfer()

    fireEvent.dragStart(tilemapButton, { dataTransfer })
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      PROJECT_ASSET_DRAG_MIME,
      JSON.stringify({
        kind: 'tilemap',
        path: 'Maps/Overworld.rgbtilemap.json'
      })
    )

    fireEvent.dragEnter(viewportSurface, { dataTransfer })
    fireEvent.dragOver(viewportSurface, { dataTransfer })
    fireEvent.drop(viewportSurface, { dataTransfer, clientX: 24, clientY: 24 })

    await waitFor(() => {
      expect(window.api.loadProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Maps/Overworld.rgbtilemap.json'
      )
    })
    expect(
      within(screen.getByTestId('project-workspace-scene-sidebar')).getByText(
        'Overworld.rgbtilemap.json'
      )
    ).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-sidebar')).getByText('No tilemap loaded')
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-sidebar')).getByText(
          'Overworld.rgbtilemap.json'
        )
      ).toBeInTheDocument()
    })
  })

  it('drops a window resource onto the scene viewport to assign it to the open scene', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          name: 'Room Scene',
          fileName: 'Room Scene.rgbscene.json',
          path: 'Scenes/Room Scene.rgbscene.json',
          extension: 'json',
          resourceType: 'scene'
        },
        {
          type: 'file',
          name: 'HUD',
          fileName: 'HUD.rgbwindow.json',
          path: 'UI/HUD.rgbwindow.json',
          extension: 'json',
          resourceType: 'window'
        }
      ]
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath) => {
        if (assetPath === 'Scenes/Room Scene.rgbscene.json') {
          return {
            assetKind: 'scene' as const,
            resourcePath: assetPath,
            document: {
              kind: 'scene' as const,
              version: 1,
              tilemapPath: null,
              windowPath: null,
              nodes: []
            }
          }
        }

        if (assetPath === 'UI/HUD.rgbwindow.json') {
          return {
            assetKind: 'window' as const,
            resourcePath: assetPath,
            document: {
              kind: 'window' as const,
              version: 1,
              width: 20,
              height: 4,
              grid: new Array(80).fill(0),
              tilesetPath: null,
              selectedTileIndex: 0,
              tool: 'brush' as const,
              windowTopEnd: 2,
              windowBottomStart: 0
            }
          }
        }

        throw new Error(`Unexpected asset load: ${assetPath}`)
      }
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const resourcePane = screen.getByTestId('resource-management-pane')
    fireEvent.doubleClick(within(resourcePane).getByText('Room Scene').closest('button')!)

    await screen.findByText('Load a tilemap to visualize the scene bounds.')

    const windowButton = within(resourcePane).getByText('HUD').closest('button')!
    const viewportSurface = screen.getByTestId('scene-viewport-surface')
    const dataTransfer = createMockDataTransfer()

    fireEvent.dragStart(windowButton, { dataTransfer })
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      PROJECT_ASSET_DRAG_MIME,
      JSON.stringify({
        kind: 'window',
        path: 'UI/HUD.rgbwindow.json'
      })
    )

    fireEvent.dragEnter(viewportSurface, { dataTransfer })
    fireEvent.dragOver(viewportSurface, { dataTransfer })
    fireEvent.drop(viewportSurface, { dataTransfer, clientX: 24, clientY: 24 })

    await waitFor(() => {
      expect(window.api.loadProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'UI/HUD.rgbwindow.json'
      )
    })
    expect(
      within(screen.getByTestId('project-workspace-scene-sidebar')).getByText('HUD.rgbwindow.json')
    ).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-sidebar')).getByText('No window loaded')
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-sidebar')).getByText(
          'HUD.rgbwindow.json'
        )
      ).toBeInTheDocument()
    })
  })

  it('undoes consecutive scene resource assignments with one Ctrl+Z per step', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          name: 'Room Scene',
          fileName: 'Room Scene.rgbscene.json',
          path: 'Scenes/Room Scene.rgbscene.json',
          extension: 'json',
          resourceType: 'scene'
        },
        {
          type: 'file',
          name: 'Overworld',
          fileName: 'Overworld.rgbtilemap.json',
          path: 'Maps/Overworld.rgbtilemap.json',
          extension: 'json',
          resourceType: 'tilemap'
        },
        {
          type: 'file',
          name: 'HUD',
          fileName: 'HUD.rgbwindow.json',
          path: 'UI/HUD.rgbwindow.json',
          extension: 'json',
          resourceType: 'window'
        }
      ]
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath) => {
        if (assetPath === 'Scenes/Room Scene.rgbscene.json') {
          return {
            assetKind: 'scene' as const,
            resourcePath: assetPath,
            document: {
              kind: 'scene' as const,
              version: 1,
              tilemapPath: null,
              windowPath: null,
              nodes: []
            }
          }
        }

        if (assetPath === 'Maps/Overworld.rgbtilemap.json') {
          return {
            assetKind: 'tilemap' as const,
            resourcePath: assetPath,
            document: {
              kind: 'tilemap' as const,
              version: 1,
              width: 20,
              height: 18,
              grid: new Array(20 * 18).fill(0),
              tilesetPath: null,
              selectedTileIndex: 0,
              tool: 'brush' as const
            }
          }
        }

        if (assetPath === 'UI/HUD.rgbwindow.json') {
          return {
            assetKind: 'window' as const,
            resourcePath: assetPath,
            document: {
              kind: 'window' as const,
              version: 1,
              width: 20,
              height: 4,
              grid: new Array(80).fill(0),
              tilesetPath: null,
              selectedTileIndex: 0,
              tool: 'brush' as const,
              windowTopEnd: 2,
              windowBottomStart: 0
            }
          }
        }

        throw new Error(`Unexpected asset load: ${assetPath}`)
      }
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const resourcePane = screen.getByTestId('resource-management-pane')
    fireEvent.doubleClick(within(resourcePane).getByText('Room Scene').closest('button')!)

    await screen.findByText('Load a tilemap to visualize the scene bounds.')

    const viewportSurface = screen.getByTestId('scene-viewport-surface')
    const tilemapDataTransfer = createMockDataTransfer()
    const windowDataTransfer = createMockDataTransfer()

    fireEvent.dragStart(within(resourcePane).getByText('Overworld').closest('button')!, {
      dataTransfer: tilemapDataTransfer
    })
    fireEvent.dragEnter(viewportSurface, { dataTransfer: tilemapDataTransfer })
    fireEvent.dragOver(viewportSurface, { dataTransfer: tilemapDataTransfer })
    fireEvent.drop(viewportSurface, {
      dataTransfer: tilemapDataTransfer,
      clientX: 24,
      clientY: 24
    })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-sidebar')).getByText(
          'Overworld.rgbtilemap.json'
        )
      ).toBeInTheDocument()
    })

    fireEvent.dragStart(within(resourcePane).getByText('HUD').closest('button')!, {
      dataTransfer: windowDataTransfer
    })
    fireEvent.dragEnter(viewportSurface, { dataTransfer: windowDataTransfer })
    fireEvent.dragOver(viewportSurface, { dataTransfer: windowDataTransfer })
    fireEvent.drop(viewportSurface, {
      dataTransfer: windowDataTransfer,
      clientX: 24,
      clientY: 24
    })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-sidebar')).getByText(
          'HUD.rgbwindow.json'
        )
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-sidebar')).getByText('No window loaded')
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-sidebar')).getByText('No tilemap loaded')
      ).toBeInTheDocument()
    })
  })

  it('drops an actor resource onto the scene viewport to insert it into the hierarchy', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          name: 'Room Scene',
          fileName: 'Room Scene.rgbscene.json',
          path: 'Scenes/Room Scene.rgbscene.json',
          extension: 'json',
          resourceType: 'scene'
        },
        {
          type: 'file',
          name: 'Hero',
          fileName: 'Hero.rgbactor.json',
          path: 'Actors/Hero.rgbactor.json',
          extension: 'json',
          resourceType: 'actor'
        }
      ]
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath) => {
        if (assetPath === 'Scenes/Room Scene.rgbscene.json') {
          return {
            assetKind: 'scene' as const,
            resourcePath: assetPath,
            document: {
              kind: 'scene' as const,
              version: 1,
              tilemapPath: null,
              windowPath: null,
              nodes: []
            }
          }
        }

        if (assetPath === 'Actors/Hero.rgbactor.json') {
          return {
            assetKind: 'actor' as const,
            resourcePath: assetPath,
            document: {
              kind: 'actor' as const,
              version: 1,
              root: {
                id: 'hero-root',
                type: 'actor' as const,
                name: 'Hero',
                isCollapsed: false,
                spritePath: null,
                x: 0,
                y: 0,
                followCamera: true,
                children: [
                  {
                    id: 'hero-collision',
                    type: 'collision' as const,
                    name: 'Hitbox',
                    isCollapsed: false,
                    x: 0,
                    y: 0,
                    width: 128,
                    height: 128,
                    isBlocking: true,
                    children: []
                  }
                ]
              }
            }
          }
        }

        throw new Error(`Unexpected asset load: ${assetPath}`)
      }
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const resourcePane = screen.getByTestId('resource-management-pane')
    fireEvent.doubleClick(within(resourcePane).getByText('Room Scene').closest('button')!)

    await screen.findByText('Load a tilemap to visualize the scene bounds.')

    const actorButton = within(resourcePane).getByText('Hero').closest('button')!
    const viewportSurface = screen.getByTestId('scene-viewport-surface')
    const dataTransfer = createMockDataTransfer()

    fireEvent.dragStart(actorButton, { dataTransfer })
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      PROJECT_ASSET_DRAG_MIME,
      JSON.stringify({
        kind: 'actor',
        path: 'Actors/Hero.rgbactor.json'
      })
    )

    fireEvent.dragEnter(viewportSurface, { dataTransfer })
    fireEvent.dragOver(viewportSurface, { dataTransfer })
    fireEvent.drop(viewportSurface, { dataTransfer, clientX: 24, clientY: 24 })

    await waitFor(() => {
      expect(window.api.loadProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Actors/Hero.rgbactor.json'
      )
    })
    expect(
      await within(screen.getByTestId('project-workspace-scene-sidebar')).findByText('Hero')
    ).toBeInTheDocument()
    expect(
      await within(screen.getByTestId('project-workspace-scene-sidebar')).findByText('Hitbox')
    ).toBeInTheDocument()
  })

  it('shows actor and collision inspector controls for scene selections', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          name: 'Room Scene',
          fileName: 'Room Scene.rgbscene.json',
          path: 'Scenes/Room Scene.rgbscene.json',
          extension: 'json',
          resourceType: 'scene'
        }
      ]
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath) => {
        if (assetPath === 'Scenes/Room Scene.rgbscene.json') {
          return {
            assetKind: 'scene' as const,
            resourcePath: assetPath,
            document: {
              kind: 'scene' as const,
              version: 1,
              tilemapPath: null,
              windowPath: null,
              nodes: [
                {
                  id: 'hero-node',
                  type: 'actor' as const,
                  name: 'Hero',
                  isCollapsed: false,
                  spritePath: null,
                  x: 0,
                  y: 0,
                  followCamera: false,
                  children: []
                },
                {
                  id: 'wall-node',
                  type: 'collision' as const,
                  name: 'Wall',
                  isCollapsed: false,
                  x: 16,
                  y: 16,
                  width: 128,
                  height: 128,
                  isBlocking: true,
                  children: []
                }
              ]
            }
          }
        }

        throw new Error(`Unexpected asset load: ${assetPath}`)
      }
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const resourcePane = screen.getByTestId('resource-management-pane')
    fireEvent.doubleClick(within(resourcePane).getByText('Room Scene').closest('button')!)

    await screen.findByText('Hero')
    fireEvent.click(within(screen.getByTestId('project-workspace-scene-sidebar')).getByText('Hero'))

    expect(screen.getByLabelText('Follow camera')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('scene-collision-wall-node'))

    expect(screen.getByLabelText('Blocking')).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('8').length).toBeGreaterThan(0)
  })

  it('undoes consecutive actor drags with one Ctrl+Z per step', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          name: 'Room Scene',
          fileName: 'Room Scene.rgbscene.json',
          path: 'Scenes/Room Scene.rgbscene.json',
          extension: 'json',
          resourceType: 'scene'
        }
      ]
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath) => {
        if (assetPath === 'Scenes/Room Scene.rgbscene.json') {
          return {
            assetKind: 'scene' as const,
            resourcePath: assetPath,
            document: {
              kind: 'scene' as const,
              version: 1,
              tilemapPath: null,
              windowPath: null,
              nodes: [
                {
                  id: 'hero-node',
                  type: 'actor' as const,
                  name: 'Hero',
                  isCollapsed: false,
                  spritePath: null,
                  x: 0,
                  y: 0,
                  followCamera: false,
                  children: []
                }
              ]
            }
          }
        }

        throw new Error(`Unexpected asset load: ${assetPath}`)
      }
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const resourcePane = screen.getByTestId('resource-management-pane')
    fireEvent.doubleClick(within(resourcePane).getByText('Room Scene').closest('button')!)

    await waitFor(() => {
      expect(document.querySelector('.scene-viewport__actor')).not.toBeNull()
    })

    const actorButton = document.querySelector('.scene-viewport__actor') as HTMLButtonElement

    fireEvent.click(actorButton)

    const dragActorTo = async (
      from: { x: number; y: number },
      to: { x: number; y: number }
    ): Promise<{ left: string; top: string }> => {
      fireEvent.pointerDown(actorButton, {
        button: 0,
        clientX: from.x,
        clientY: from.y
      })
      fireEvent.mouseDown(actorButton, {
        button: 0,
        clientX: from.x,
        clientY: from.y
      })
      fireEvent.pointerMove(window, {
        clientX: to.x,
        clientY: to.y
      })
      fireEvent.pointerUp(window)

      await waitFor(() => {
        const movedActorButton = document.querySelector('.scene-viewport__actor') as HTMLButtonElement
        expect(movedActorButton.style.left !== '0px' || movedActorButton.style.top !== '0px').toBe(
          true
        )
      })

      const movedActorButton = document.querySelector('.scene-viewport__actor') as HTMLButtonElement

      return {
        left: movedActorButton.style.left,
        top: movedActorButton.style.top
      }
    }

    const firstPosition = await dragActorTo(
      { x: 16, y: 16 },
      { x: 24, y: 24 }
    )
    const secondPosition = await dragActorTo(
      { x: 24, y: 24 },
      { x: 40, y: 32 }
    )

    expect(secondPosition).not.toEqual(firstPosition)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      const movedActorButton = document.querySelector('.scene-viewport__actor') as HTMLButtonElement
      expect(movedActorButton.style.left).toBe(firstPosition.left)
      expect(movedActorButton.style.top).toBe(firstPosition.top)
    })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      const movedActorButton = document.querySelector('.scene-viewport__actor') as HTMLButtonElement
      expect(movedActorButton.style.left).toBe('0px')
      expect(movedActorButton.style.top).toBe('0px')
    })
  })

  it('undoes consecutive actor drags with one Ctrl+Z per step in StrictMode', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          name: 'Room Scene',
          fileName: 'Room Scene.rgbscene.json',
          path: 'Scenes/Room Scene.rgbscene.json',
          extension: 'json',
          resourceType: 'scene'
        }
      ]
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath) => {
        if (assetPath === 'Scenes/Room Scene.rgbscene.json') {
          return {
            assetKind: 'scene' as const,
            resourcePath: assetPath,
            document: {
              kind: 'scene' as const,
              version: 1,
              tilemapPath: null,
              windowPath: null,
              nodes: [
                {
                  id: 'hero-node',
                  type: 'actor' as const,
                  name: 'Hero',
                  isCollapsed: false,
                  spritePath: null,
                  x: 0,
                  y: 0,
                  followCamera: false,
                  children: []
                }
              ]
            }
          }
        }

        throw new Error(`Unexpected asset load: ${assetPath}`)
      }
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha',
      { strictMode: true }
    )

    const resourcePane = screen.getByTestId('resource-management-pane')
    fireEvent.doubleClick(within(resourcePane).getByText('Room Scene').closest('button')!)

    await waitFor(() => {
      expect(document.querySelector('.scene-viewport__actor')).not.toBeNull()
    })

    const actorButton = document.querySelector('.scene-viewport__actor') as HTMLButtonElement

    fireEvent.click(actorButton)

    const dragActorTo = async (
      from: { x: number; y: number },
      to: { x: number; y: number }
    ): Promise<{ left: string; top: string }> => {
      fireEvent.pointerDown(actorButton, {
        button: 0,
        clientX: from.x,
        clientY: from.y
      })
      fireEvent.mouseDown(actorButton, {
        button: 0,
        clientX: from.x,
        clientY: from.y
      })
      fireEvent.pointerMove(window, {
        clientX: to.x,
        clientY: to.y
      })
      fireEvent.pointerUp(window)

      await waitFor(() => {
        const movedActorButton = document.querySelector('.scene-viewport__actor') as HTMLButtonElement
        expect(movedActorButton.style.left !== '0px' || movedActorButton.style.top !== '0px').toBe(
          true
        )
      })

      const movedActorButton = document.querySelector('.scene-viewport__actor') as HTMLButtonElement

      return {
        left: movedActorButton.style.left,
        top: movedActorButton.style.top
      }
    }

    const firstPosition = await dragActorTo(
      { x: 16, y: 16 },
      { x: 24, y: 24 }
    )
    const secondPosition = await dragActorTo(
      { x: 24, y: 24 },
      { x: 40, y: 32 }
    )

    expect(secondPosition).not.toEqual(firstPosition)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      const movedActorButton = document.querySelector('.scene-viewport__actor') as HTMLButtonElement
      expect(movedActorButton.style.left).toBe(firstPosition.left)
      expect(movedActorButton.style.top).toBe(firstPosition.top)
    })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      const movedActorButton = document.querySelector('.scene-viewport__actor') as HTMLButtonElement
      expect(movedActorButton.style.left).toBe('0px')
      expect(movedActorButton.style.top).toBe('0px')
    })
  })

  it('saves actor resources with collision children and strips followCamera', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          name: 'Room Scene',
          fileName: 'Room Scene.rgbscene.json',
          path: 'Scenes/Room Scene.rgbscene.json',
          extension: 'json',
          resourceType: 'scene'
        }
      ]
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath) => {
        if (assetPath === 'Scenes/Room Scene.rgbscene.json') {
          return {
            assetKind: 'scene' as const,
            resourcePath: assetPath,
            document: {
              kind: 'scene' as const,
              version: 1,
              tilemapPath: null,
              windowPath: null,
              nodes: [
                {
                  id: 'hero-node',
                  type: 'actor' as const,
                  name: 'Hero',
                  isCollapsed: false,
                  spritePath: null,
                  x: 0,
                  y: 0,
                  followCamera: true,
                  children: [
                    {
                      id: 'hero-collision',
                      type: 'collision' as const,
                      name: 'Hitbox',
                      isCollapsed: false,
                      x: 0,
                      y: 0,
                      width: 128,
                      height: 128,
                      isBlocking: true,
                      children: []
                    }
                  ]
                }
              ]
            }
          }
        }

        throw new Error(`Unexpected asset load: ${assetPath}`)
      }
    )
    vi.mocked(window.api.createProjectResource).mockResolvedValue({
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: 'Scenes',
        parentPath: '',
        items: []
      },
      resourceType: 'actor',
      resourcePath: 'Scenes/Hero.rgbactor.json',
      resourceName: 'Hero',
      parentPath: 'Scenes'
    })
    vi.mocked(window.api.saveProjectAssetFile).mockResolvedValue({
      assetKind: 'actor',
      resourcePath: 'Scenes/Hero.rgbactor.json',
      document: {
        kind: 'actor',
        version: 1,
        root: {
          id: 'hero-node',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: null,
          x: 0,
          y: 0,
          followCamera: false,
          children: [
            {
              id: 'hero-collision',
              type: 'collision',
              name: 'Hitbox',
              isCollapsed: false,
              x: 0,
              y: 0,
              width: 128,
              height: 128,
              isBlocking: true,
              children: []
            }
          ]
        }
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const resourcePane = screen.getByTestId('resource-management-pane')
    fireEvent.doubleClick(within(resourcePane).getByText('Room Scene').closest('button')!)
    await screen.findByText('Load a tilemap to visualize the scene bounds.')

    const heroButton = await within(
      screen.getByTestId('project-workspace-scene-sidebar')
    ).findByText('Hero')
    fireEvent.contextMenu(heroButton.closest('.scene-hierarchy-pane__row')!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Save As Resource' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalled()
    })

    expect(vi.mocked(window.api.saveProjectAssetFile).mock.calls[0][2]).toMatchObject({
      kind: 'actor',
      root: {
        type: 'actor',
        followCamera: false,
        children: [
          {
            type: 'collision',
            isBlocking: true
          }
        ]
      }
    })
  })
})
