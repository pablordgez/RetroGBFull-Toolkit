import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace } from '../../../src/renderer/src/components/ProjectWorkspace/ProjectWorkspace'

const renderWorkspace = (entry: string) => {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/project-editor" element={<ProjectWorkspace />} />
      </Routes>
    </MemoryRouter>
  )
}

const renderWorkspaceAndWait = async (entry: string) => {
  const renderedWorkspace = renderWorkspace(entry)

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
    vi.mocked(window.api.scanProjectDirectory).mockResolvedValue({ trackedCount: 0, removedCount: 0 })
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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

    expect(screen.getByTestId('project-workspace-surface')).toBeInTheDocument()
    expect(screen.getByTestId('resource-management-pane')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

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
        items: [{ type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }]
      })
    vi.mocked(window.api.scanProjectDirectory).mockResolvedValue({ trackedCount: 1, removedCount: 0 })

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')
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
      expect(window.api.getProjectResources.mock.calls.length).toBeGreaterThan(initialResourceLoadCount)
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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

    const dockPaneWrapper = screen.getByTestId('resource-management-pane').closest('.resizable-pane-layout__pane')
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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

    fireEvent.contextMenu(screen.getByTestId('resource-management-pane'), {
      clientX: 80,
      clientY: 120
    })

    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'New...' }))

    expect(screen.getByRole('menuitem', { name: 'Folder' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sprite' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Tileset' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Tilemap' })).toBeInTheDocument()
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
        items: [{ type: 'folder', id: 'folder-1', name: 'New Folder', path: 'New Folder', parentPath: null }]
      }
    })

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

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

  it('opens folders on double click and goes back to the parent view', async () => {
    vi.mocked(window.api.getProjectResources)
      .mockResolvedValueOnce({
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [{ type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }]
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
        items: [{ type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }]
      })

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

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
        items: [{ type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }]
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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

    fireEvent.doubleClick(screen.getByText('Sprites').closest('button')!)

    expect(
      await screen.findByText('The folder "Sprites" could not be found, so it was removed from the project.')
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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

    fireEvent.doubleClick(screen.getByText('Hero').closest('button')!)

    expect(
      await screen.findByText('The asset "Hero" could not be found, so it was removed from the project.')
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
      items: [{ type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }]
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
        items: [{ type: 'folder', id: 'folder-1', name: 'Sprites HD', path: 'Sprites HD', parentPath: null }]
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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

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
      expect(window.api.deleteProjectResource).toHaveBeenCalledWith('/projects/Alpha', 'folder', 'Sprites HD')
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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

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
        items: [{ type: 'folder', id: 'folder-2', name: 'Sprites', path: 'Archive/Sprites', parentPath: 'Archive' }]
      }
    })

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

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
    vi.mocked(window.api.createProjectResource)
      .mockResolvedValueOnce({
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

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

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
      items: [{ type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }]
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
        items: [{ type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }]
      }
    })

    await renderWorkspaceAndWait('/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha')

    const folderLabel = await screen.findByText('Sprites')
    fireEvent.contextMenu(folderLabel, { clientX: 120, clientY: 160 })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(window.api.deleteProjectResource).toHaveBeenCalledWith('/projects/Alpha', 'folder', 'Sprites')
    })
    expect(screen.queryByText('Sprites')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(window.api.restoreDeletedProjectResource).toHaveBeenCalledWith('/projects/Alpha', 'delete-sprites')
    })
    expect(await screen.findByText('Sprites')).toBeInTheDocument()
  })
})
