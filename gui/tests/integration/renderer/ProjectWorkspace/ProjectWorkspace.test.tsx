import React from 'react'
import {
  act,
  fireEvent,
  render,
  screen,
  type RenderResult,
  waitFor,
  within
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROJECT_ASSET_DRAG_MIME } from '../../../../src/renderer/src/components/ProjectAssets/projectAssetDrag'
import { ProjectWorkspace } from '../../../../src/renderer/src/components/ProjectWorkspace/ProjectWorkspace'
import type { SceneAssetDocument } from '../../../../src/shared/projectAssetTypes'

interface MockDataTransfer {
  dropEffect: string
  effectAllowed: string
  readonly types: string[]
  setData: (type: string, value: string) => void
  getData: (type: string) => string
}

const renderWorkspace = (
  entry: string,
  { strictMode = false }: { strictMode?: boolean } = {}
): RenderResult => {
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
): Promise<RenderResult> => {
  const renderedWorkspace = renderWorkspace(entry, options)

  await waitFor(() => {
    expect(window.api.getProjectResources).toHaveBeenCalled()
  })

  return renderedWorkspace
}

const openProjectMenu = (): void => {
  fireEvent.click(screen.getByRole('menuitem', { name: 'Project' }))
}

const openDataMenu = (): void => {
  fireEvent.click(screen.getByRole('menuitem', { name: 'Data' }))
}

const openPreferencesMenu = (): void => {
  fireEvent.click(screen.getByRole('menuitem', { name: 'Preferences' }))
}

const openBuildMenu = (): void => {
  fireEvent.click(screen.getByRole('menuitem', { name: 'Build' }))
}

const getOpenMenu = (): HTMLElement => {
  const appMenu = screen
    .getAllByRole('menu')
    .find((menu) => menu.closest('.app-menu-bar__dropdown'))

  return appMenu ?? screen.getByRole('menu')
}

const openCreateMenu = (): void => {
  fireEvent.click(screen.getByRole('menuitem', { name: 'Create' }))
}

const getShortcutLabel = (key: string): string => {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? `\u2318${key}` : `Ctrl+${key}`
}

const createMockDataTransfer = (): MockDataTransfer => {
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

const createSceneDocument = (
  overrides: Partial<SceneAssetDocument> = {}
): SceneAssetDocument => ({
  kind: 'scene',
  version: 1,
  tilemapPath: null,
  windowPath: null,
  nodes: [],
  ...overrides
})

const openResourceFromPane = async (name: string): Promise<HTMLElement> => {
  const resourcePane = screen.getByTestId('resource-management-pane')
  const resourceLabel = await within(resourcePane).findByText(name)
  const resourceButton = resourceLabel.closest('button')

  if (!resourceButton) {
    throw new Error(`Expected resource "${name}" to be rendered as a button.`)
  }

  fireEvent.doubleClick(resourceButton)
  return resourcePane
}

const resetWorkspaceApiMocks = (): void => {
  vi.mocked(window.api.openProjectAssetEditor).mockReset()
  vi.mocked(window.api.getRecentProjects).mockReset()
  vi.mocked(window.api.getAppPreferences).mockReset()
  vi.mocked(window.api.saveAppPreferences).mockReset()
  vi.mocked(window.api.openDocumentation).mockReset()
  vi.mocked(window.api.getRuntimePlatform).mockReset()
  vi.mocked(window.api.getGbdkToolchainStatus).mockReset()
  vi.mocked(window.api.installLatestGbdkToolchain).mockReset()
  vi.mocked(window.api.getMakeToolchainStatus).mockReset()
  vi.mocked(window.api.installLatestMakeToolchain).mockReset()
  vi.mocked(window.api.getProjectResources).mockReset()
  vi.mocked(window.api.scanProjectDirectory).mockReset()
  vi.mocked(window.api.onEditorCloseRequested).mockReset()
  vi.mocked(window.api.confirmEditorClose).mockReset()
}

describe('<ProjectWorkspace />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWorkspaceApiMocks()
    vi.mocked(window.api.openProjectAssetEditor).mockResolvedValue(true)
    vi.mocked(window.api.getRecentProjects).mockResolvedValue([])
    vi.mocked(window.api.getAppPreferences).mockResolvedValue({
      scriptEditorTheme: 'light',
      coordinateUnit: 'gui',
      childCoordinateOrigin: 'relative',
      autoBankScriptFunctions: true
    })
    vi.mocked(window.api.saveAppPreferences).mockResolvedValue({
      scriptEditorTheme: 'light',
      coordinateUnit: 'gui',
      childCoordinateOrigin: 'relative',
      autoBankScriptFunctions: true
    })
    vi.mocked(window.api.openDocumentation).mockResolvedValue(true)
    vi.mocked(window.api.getRuntimePlatform).mockResolvedValue('linux')
    vi.mocked(window.api.getGbdkToolchainStatus).mockResolvedValue({
      installed: true,
      installPath: '/toolchains/gbdk',
      executablePath: '/toolchains/gbdk/bin/lcc',
      version: null,
      source: 'development-root',
      message: 'GBDK is available at /toolchains/gbdk.'
    })
    vi.mocked(window.api.installLatestGbdkToolchain).mockResolvedValue({
      installed: true,
      installPath: '/toolchains/gbdk',
      executablePath: '/toolchains/gbdk/bin/lcc',
      version: 'gbdk-4.5.0',
      source: 'development-root',
      message: 'Installed gbdk-4.5.0 to /toolchains/gbdk.',
      releaseTag: 'gbdk-4.5.0',
      assetName: 'gbdk-win64.zip',
      replacedExisting: false
    })
    vi.mocked(window.api.getMakeToolchainStatus).mockResolvedValue({
      installed: true,
      installPath: '/toolchains/make',
      executablePath: '/toolchains/make/bin/make',
      version: '4.4.1',
      source: 'runtime-managed',
      message: 'GNU Make is available at /toolchains/make/bin/make.'
    })
    vi.mocked(window.api.installLatestMakeToolchain).mockResolvedValue({
      installed: true,
      installPath: '/toolchains/make',
      executablePath: '/toolchains/make/bin/make',
      version: '4.4.1',
      source: 'runtime-managed',
      message: 'Installed GNU Make 4.4.1 to /toolchains/make.',
      releaseVersion: '4.4.1',
      archiveName: 'make-4.4.1.tar.gz',
      replacedExisting: false
    })
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
    vi.mocked(window.api.onEditorCloseRequested).mockImplementation(() => () => undefined)
    vi.mocked(window.api.confirmEditorClose).mockResolvedValue(true)
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

  it('shows the missing GBDK banner and installs from the banner action', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.getGbdkToolchainStatus).mockResolvedValue({
      installed: false,
      installPath: '/toolchains/gbdk',
      executablePath: '/toolchains/gbdk/bin/lcc',
      version: null,
      source: 'runtime-managed',
      message: 'GBDK was not found at /toolchains/gbdk.'
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    expect(await screen.findByText('GBDK is missing')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Install GBDK' }))

    await waitFor(() => {
      expect(window.api.installLatestGbdkToolchain).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Installed gbdk-4.5.0 from gbdk-win64.zip.')).toBeInTheDocument()
  })

  it('shows the missing GNU Make banner and installs from the banner action', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.getMakeToolchainStatus).mockResolvedValue({
      installed: false,
      installPath: '/toolchains/make',
      executablePath: '/toolchains/make/bin/make',
      version: null,
      source: 'runtime-managed',
      message: 'GNU Make was not found at /toolchains/make.'
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    expect(await screen.findByText('GNU Make is missing')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try Install Anyway' }))

    await waitFor(() => {
      expect(window.api.installLatestMakeToolchain).toHaveBeenCalledTimes(1)
    })
    expect(
      await screen.findByText('Installed GNU Make 4.4.1 from make-4.4.1.tar.gz.')
    ).toBeInTheDocument()
  })

  it('opens the GNU Make setup guide from the missing-toolchain banner', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.getMakeToolchainStatus).mockResolvedValue({
      installed: false,
      installPath: '/toolchains/make',
      executablePath: '/toolchains/make/bin/make',
      version: null,
      source: 'runtime-managed',
      message: 'GNU Make was not found at /toolchains/make.'
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Open Setup Guide' }))

    expect(await screen.findByRole('dialog', { name: 'GNU Make Setup Guide' })).toBeInTheDocument()
    expect(screen.getByText('sudo apt update && sudo apt install -y make')).toBeInTheDocument()
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

  it('opens the project folder when the project path summary is clicked', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Open /projects/Alpha in file explorer' }))

    await waitFor(() => {
      expect(window.api.openProjectInFileExplorer).toHaveBeenCalledWith('/projects/Alpha')
    })
  })

  it('opens the documentation from the menu bar docs action', async () => {
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

    fireEvent.click(screen.getByRole('menuitem', { name: 'Open documentation in browser' }))

    await waitFor(() => {
      expect(window.api.openDocumentation).toHaveBeenCalledTimes(1)
    })
  })

  it('loads and saves workspace preferences through app preferences', async () => {
    vi.mocked(window.api.getAppPreferences).mockResolvedValue({
      scriptEditorTheme: 'dark',
      coordinateUnit: 'core',
      childCoordinateOrigin: 'absolute',
      autoBankScriptFunctions: true
    })
    vi.mocked(window.api.saveAppPreferences).mockImplementation(async (preferences) => ({
      scriptEditorTheme: preferences.scriptEditorTheme ?? 'dark',
      coordinateUnit: preferences.coordinateUnit ?? 'core',
      childCoordinateOrigin: preferences.childCoordinateOrigin ?? 'absolute',
      autoBankScriptFunctions: preferences.autoBankScriptFunctions ?? true
    }))

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    await waitFor(() => {
      expect(window.api.getAppPreferences).toHaveBeenCalled()
    })

    openPreferencesMenu()
    expect(
      within(getOpenMenu()).getByRole('menuitemcheckbox', {
        name: 'Display GUI pixel coordinates'
      })
    ).toHaveAttribute('aria-checked', 'false')
    expect(
      within(getOpenMenu()).getByRole('menuitemcheckbox', {
        name: 'Display child coordinates as absolute'
      })
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      within(getOpenMenu()).getByRole('menuitemcheckbox', {
        name: 'Auto-add BANKED to script functions'
      })
    ).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(
      within(getOpenMenu()).getByRole('menuitemcheckbox', {
        name: 'Display GUI pixel coordinates'
      })
    )

    await waitFor(() => {
      expect(window.api.saveAppPreferences).toHaveBeenCalledWith({
        coordinateUnit: 'gui',
        childCoordinateOrigin: 'absolute',
        autoBankScriptFunctions: true
      })
    })

    fireEvent.click(
      within(getOpenMenu()).getByRole('menuitemcheckbox', {
        name: 'Display child coordinates as absolute'
      })
    )

    await waitFor(() => {
      expect(window.api.saveAppPreferences).toHaveBeenCalledWith({
        coordinateUnit: 'gui',
        childCoordinateOrigin: 'relative',
        autoBankScriptFunctions: true
      })
    })

    fireEvent.click(
      within(getOpenMenu()).getByRole('menuitemcheckbox', {
        name: 'Auto-add BANKED to script functions'
      })
    )

    await waitFor(() => {
      expect(window.api.saveAppPreferences).toHaveBeenCalledWith({
        coordinateUnit: 'gui',
        childCoordinateOrigin: 'relative',
        autoBankScriptFunctions: false
      })
    })
  })

  it('shows a file explorer action in the resource context menu and opens the selected resource', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'folder',
          id: 'folder-1',
          name: 'Sprites',
          path: 'Sprites',
          parentPath: null
        },
        {
          type: 'file',
          name: 'Hero',
          fileName: 'Hero.rgbsprite.json',
          path: 'Sprites/Hero.rgbsprite.json',
          extension: 'json',
          resourceType: 'sprite'
        }
      ]
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const resourcePane = screen.getByTestId('resource-management-pane')
    const heroLabel = await within(resourcePane).findByText('Hero')

    fireEvent.contextMenu(heroLabel, { clientX: 120, clientY: 160 })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Show In File Explorer' }))

    await waitFor(() => {
      expect(window.api.showProjectResourceInFileExplorer).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Sprites/Hero.rgbsprite.json'
      )
    })
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
    expect(screen.queryByRole('menuitem', { name: 'Actor' })).not.toBeInTheDocument()
  })

  it('creates a folder from the Create menu in the current resource path', async () => {
    vi.mocked(window.api.getProjectResources).mockImplementation(
      async (_projectPath, currentPath = '') => {
        if (currentPath === 'Sprites') {
          return {
            projectName: 'Alpha',
            projectPath: '/projects/Alpha',
            currentPath: 'Sprites',
            parentPath: '',
            items: []
          }
        }

        return {
          projectName: 'Alpha',
          projectPath: '/projects/Alpha',
          currentPath: '',
          parentPath: null,
          items: [
            {
              type: 'folder',
              id: 'folder-1',
              name: 'Sprites',
              path: 'Sprites',
              parentPath: null
            }
          ]
        }
      }
    )
    vi.mocked(window.api.createProjectResource).mockResolvedValue({
      resourceType: 'folder',
      resourcePath: 'Sprites/New Folder',
      resourceName: 'New Folder',
      parentPath: 'Sprites',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: 'Sprites',
        parentPath: '',
        items: [
          {
            type: 'folder',
            id: 'folder-2',
            name: 'New Folder',
            path: 'Sprites/New Folder',
            parentPath: 'Sprites'
          }
        ]
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    await openResourceFromPane('Sprites')
    await screen.findByText('/Sprites')

    openCreateMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Folder' }))

    expect(window.api.createProjectResource).toHaveBeenCalledWith(
      '/projects/Alpha',
      'folder',
      'Sprites'
    )
    expect(await screen.findByLabelText('Folder name for New Folder')).toHaveValue('New Folder')
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
    const backLabel = await screen.findByText('Back')
    const backButton = backLabel.closest('button')

    expect(backButton).toBeInTheDocument()
    fireEvent.click(backButton!)

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

  it('opens the save-data editor and builds project code from the code menu', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.buildProjectCode).mockResolvedValue({
      writtenFiles: ['src/Saves/SaveData.h'],
      saveDataEntryCount: 2,
      spriteCount: 1,
      tilesetCount: 0,
      tilemapCount: 0,
      windowCount: 0,
      musicCount: 0,
      sceneCount: 0,
      actorScriptCount: 0,
      sceneScriptCount: 0
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    openDataMenu()
    fireEvent.click(within(getOpenMenu()).getByRole('menuitem', { name: 'Edit Save Data...' }))

    await waitFor(() => {
      expect(window.api.openProjectSaveDataEditor).toHaveBeenCalledWith('/projects/Alpha')
    })

    openBuildMenu()
    fireEvent.click(within(getOpenMenu()).getByRole('menuitem', { name: 'Build' }))

    await waitFor(() => {
      expect(window.api.buildProjectCode).toHaveBeenCalledWith('/projects/Alpha', {
        autoBankScriptFunctions: true
      })
    })

    expect(
      await screen.findByText(
        'Built project code for 2 save entries, 1 sprite, 0 tilesets, 0 tilemaps, 0 windows, 0 music assets, and 0 scenes.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Build in progress')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss message' })).toBeInTheDocument()
  })

  it('builds and compiles the project from the build menu', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.buildAndCompileProject).mockResolvedValue({
      buildResult: {
        writtenFiles: ['src/Saves/SaveData.h'],
        saveDataEntryCount: 2,
        spriteCount: 1,
        tilesetCount: 0,
        tilemapCount: 0,
        windowCount: 0,
        musicCount: 0,
        sceneCount: 0,
        actorScriptCount: 0,
        sceneScriptCount: 0
      },
      compileResult: {
        romPath: 'obj/Example.gb',
        outputSummary: 'Build complete.'
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    openBuildMenu()
    fireEvent.click(within(getOpenMenu()).getByRole('menuitem', { name: 'Build + Compile' }))

    await waitFor(() => {
      expect(window.api.buildAndCompileProject).toHaveBeenCalledWith('/projects/Alpha', {
        autoBankScriptFunctions: true
      })
    })

    expect(
      await screen.findByText('Built project code and compiled obj/Example.gb.')
    ).toBeInTheDocument()
  })

  it('prompts before building when the open scene has unsaved changes', async () => {
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
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'scene',
      resourcePath: 'Scenes/Room Scene.rgbscene.json',
      document: createSceneDocument()
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    await openResourceFromPane('Room Scene')
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Actor' }))
    expect(await screen.findByText('Unsaved changes.')).toBeInTheDocument()

    openBuildMenu()
    fireEvent.click(within(getOpenMenu()).getByRole('menuitem', { name: 'Build' }))

    expect(
      await screen.findByRole('dialog', { name: 'Unsaved changes in "Room Scene"' })
    ).toBeInTheDocument()
    expect(window.api.buildProjectCode).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(window.api.buildProjectCode).not.toHaveBeenCalled()

    openBuildMenu()
    fireEvent.click(within(getOpenMenu()).getByRole('menuitem', { name: 'Build' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Proceed Without Saving' }))

    await waitFor(() => {
      expect(window.api.buildProjectCode).toHaveBeenCalledWith('/projects/Alpha', {
        autoBankScriptFunctions: true
      })
    })
    expect(window.api.saveProjectAssetFile).not.toHaveBeenCalled()
  })

  it('can save the open scene before building and compiling', async () => {
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
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'scene',
      resourcePath: 'Scenes/Room Scene.rgbscene.json',
      document: createSceneDocument()
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath, document) => ({
        assetKind: 'scene' as const,
        resourcePath: assetPath,
        document
      })
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    await openResourceFromPane('Room Scene')
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Actor' }))

    openBuildMenu()
    fireEvent.click(within(getOpenMenu()).getByRole('menuitem', { name: 'Build + Compile' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save and Proceed' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Scenes/Room Scene.rgbscene.json',
        expect.objectContaining({
          kind: 'scene',
          nodes: [expect.objectContaining({ type: 'actor' })]
        })
      )
    })
    await waitFor(() => {
      expect(window.api.buildAndCompileProject).toHaveBeenCalledWith('/projects/Alpha', {
        autoBankScriptFunctions: true
      })
    })
    expect(
      await screen.findByText('Built project code and compiled obj/Example.gb.')
    ).toBeInTheDocument()
  })

  it('prompts before closing the project window when the open scene has unsaved changes', async () => {
    let closeListener: (() => void) | undefined

    vi.mocked(window.api.onEditorCloseRequested).mockImplementation((listener) => {
      closeListener = listener
      return () => undefined
    })
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
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'scene',
      resourcePath: 'Scenes/Room Scene.rgbscene.json',
      document: createSceneDocument()
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath, document) => ({
        assetKind: 'scene' as const,
        resourcePath: assetPath,
        document
      })
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    await openResourceFromPane('Room Scene')
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Actor' }))

    expect(closeListener).toBeDefined()
    act(() => {
      closeListener?.()
    })

    expect(
      await screen.findByRole('dialog', { name: 'Save changes to "Room Scene"?' })
    ).toBeInTheDocument()
    expect(window.api.confirmEditorClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(window.api.confirmEditorClose).not.toHaveBeenCalled()

    act(() => {
      closeListener?.()
    })
    const closePrompt = await screen.findByRole('dialog', {
      name: 'Save changes to "Room Scene"?'
    })
    fireEvent.click(within(closePrompt).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Scenes/Room Scene.rgbscene.json',
        expect.objectContaining({
          kind: 'scene',
          nodes: [expect.objectContaining({ type: 'actor' })]
        })
      )
      expect(window.api.confirmEditorClose).toHaveBeenCalledTimes(1)
    })
  })

  it('shows live compile progress with a spinner while build and compile is running', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })

    let progressListener:
      | ((payload: {
          projectPath: string
          stage: 'build' | 'clean' | 'compile'
          message: string
        }) => void)
      | undefined
    vi.mocked(window.api.onProjectBuildProgress).mockImplementation((listener) => {
      progressListener = listener
      return () => undefined
    })

    let resolveBuildAndCompile:
      | ((value: Awaited<ReturnType<typeof window.api.buildAndCompileProject>>) => void)
      | null = null
    vi.mocked(window.api.buildAndCompileProject).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBuildAndCompile = resolve
        })
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    openBuildMenu()
    fireEvent.click(within(getOpenMenu()).getByRole('menuitem', { name: 'Build + Compile' }))

    await waitFor(() => {
      expect(window.api.buildAndCompileProject).toHaveBeenCalledWith('/projects/Alpha', {
        autoBankScriptFunctions: true
      })
    })

    expect(await screen.findByText('Building project code...')).toBeInTheDocument()
    expect(screen.getByLabelText('Build in progress')).toBeInTheDocument()

    progressListener?.({
      projectPath: '/projects/Alpha',
      stage: 'compile',
      message: 'lcc -o obj/Example.gb obj/main.o'
    })

    expect(
      await screen.findByText('Compiling... lcc -o obj/Example.gb obj/main.o')
    ).toBeInTheDocument()

    resolveBuildAndCompile?.({
      buildResult: {
        writtenFiles: ['src/Saves/SaveData.h'],
        saveDataEntryCount: 2,
        spriteCount: 1,
        tilesetCount: 0,
        tilemapCount: 0,
        windowCount: 0,
        musicCount: 0,
        sceneCount: 0,
        actorScriptCount: 0,
        sceneScriptCount: 0
      },
      compileResult: {
        romPath: 'obj/Example.gb',
        outputSummary: 'Build complete.'
      }
    })

    await waitFor(() => {
      expect(screen.queryByLabelText('Build in progress')).not.toBeInTheDocument()
    })
  })

  it('lets the user dismiss build errors', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: []
    })
    vi.mocked(window.api.buildProjectCode).mockRejectedValue(new Error('Build failed on purpose.'))

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    openBuildMenu()
    fireEvent.click(within(getOpenMenu()).getByRole('menuitem', { name: 'Build' }))

    expect(await screen.findByText('Build failed on purpose.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }))

    await waitFor(() => {
      expect(screen.queryByText('Build failed on purpose.')).not.toBeInTheDocument()
    })
  })

  it('opens the bank dialog for bankable resources and saves a new bank', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        {
          type: 'file',
          id: 'sprite-1',
          name: 'Hero',
          fileName: 'Hero.rgbsprite.json',
          path: 'Hero.rgbsprite.json',
          parentPath: null,
          extension: 'json',
          resourceType: 'sprite',
          bank: 255
        }
      ]
    })
    vi.mocked(window.api.updateProjectResourceBank).mockResolvedValue({
      resourceType: 'sprite',
      resourcePath: 'Hero.rgbsprite.json',
      resourceName: 'Hero',
      parentPath: '',
      bank: 23,
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: [
          {
            type: 'file',
            id: 'sprite-1',
            name: 'Hero',
            fileName: 'Hero.rgbsprite.json',
            path: 'Hero.rgbsprite.json',
            parentPath: null,
            extension: 'json',
            resourceType: 'sprite',
            bank: 23
          }
        ]
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const heroButton = (await screen.findByText('Hero')).closest('button')

    if (!heroButton) {
      throw new Error('Expected Hero resource button.')
    }

    fireEvent.contextMenu(heroButton, { clientX: 120, clientY: 120 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bank...' }))
    fireEvent.change(screen.getByDisplayValue('255'), { target: { value: '23' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.updateProjectResourceBank).toHaveBeenCalledWith(
        '/projects/Alpha',
        'sprite',
        'Hero.rgbsprite.json',
        23
      )
    })
  })

  it('marks a scene as the starting scene from the resource context menu', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      startingScenePath: null,
      items: [
        {
          type: 'file',
          id: 'scene-1',
          name: 'Intro',
          fileName: 'Intro.rgbscene.json',
          path: 'Intro.rgbscene.json',
          parentPath: null,
          extension: 'json',
          resourceType: 'scene',
          bank: null
        }
      ]
    })
    vi.mocked(window.api.updateProjectStartingScene).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      startingScenePath: 'Intro.rgbscene.json',
      items: [
        {
          type: 'file',
          id: 'scene-1',
          name: 'Intro',
          fileName: 'Intro.rgbscene.json',
          path: 'Intro.rgbscene.json',
          parentPath: null,
          extension: 'json',
          resourceType: 'scene',
          bank: null
        }
      ]
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const introButton = (await screen.findByText('Intro')).closest('button')

    if (!introButton) {
      throw new Error('Expected Intro resource button.')
    }

    fireEvent.contextMenu(introButton, { clientX: 120, clientY: 120 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Set As Starting Scene' }))

    await waitFor(() => {
      expect(window.api.updateProjectStartingScene).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Intro.rgbscene.json'
      )
    })
  })

  it('sanitizes rename conflict errors and automatically reverts to the previous name', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        { type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }
      ]
    })
    vi.mocked(window.api.renameProjectResource)
      .mockRejectedValueOnce(
        new Error(
          `Error invoking remote method 'project:resources:rename': Error: A resource named "Actors" already exists elsewhere in the project.`
        )
      )
      .mockResolvedValueOnce({
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
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))

    const renameInput = await screen.findByLabelText('Folder name for Sprites')
    fireEvent.change(renameInput, { target: { value: 'Actors' } })
    fireEvent.keyDown(renameInput, { key: 'Enter' })

    await waitFor(() => {
      expect(window.api.renameProjectResource).toHaveBeenNthCalledWith(
        1,
        '/projects/Alpha',
        'folder',
        'Sprites',
        'Actors'
      )
      expect(window.api.renameProjectResource).toHaveBeenNthCalledWith(
        2,
        '/projects/Alpha',
        'folder',
        'Sprites',
        'Sprites'
      )
    })
    expect(
      await screen.findByText('That name is already in use. Reverted to "Sprites".')
    ).toBeInTheDocument()
    expect(screen.queryByText(/Error invoking remote method/i)).not.toBeInTheDocument()
  })

  it('uses an incremented fallback name when reverting the previous name still conflicts', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue({
      projectName: 'Alpha',
      projectPath: '/projects/Alpha',
      currentPath: '',
      parentPath: null,
      items: [
        { type: 'folder', id: 'folder-1', name: 'Sprites', path: 'Sprites', parentPath: null }
      ]
    })
    vi.mocked(window.api.renameProjectResource)
      .mockRejectedValueOnce(
        new Error('A resource named "Actors" already exists elsewhere in the project.')
      )
      .mockRejectedValueOnce(
        new Error('A resource named "Sprites" already exists elsewhere in the project.')
      )
      .mockResolvedValueOnce({
        resourceType: 'folder',
        resourcePath: 'Sprites 2',
        resourceName: 'Sprites 2',
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
              name: 'Sprites 2',
              path: 'Sprites 2',
              parentPath: null
            }
          ]
        }
      })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const folderLabel = await screen.findByText('Sprites')
    fireEvent.contextMenu(folderLabel, { clientX: 120, clientY: 160 })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))

    const renameInput = await screen.findByLabelText('Folder name for Sprites')
    fireEvent.change(renameInput, { target: { value: 'Actors' } })
    fireEvent.blur(renameInput)

    await waitFor(() => {
      expect(window.api.renameProjectResource).toHaveBeenNthCalledWith(
        1,
        '/projects/Alpha',
        'folder',
        'Sprites',
        'Actors'
      )
      expect(window.api.renameProjectResource).toHaveBeenNthCalledWith(
        2,
        '/projects/Alpha',
        'folder',
        'Sprites',
        'Sprites'
      )
      expect(window.api.renameProjectResource).toHaveBeenNthCalledWith(
        3,
        '/projects/Alpha',
        'folder',
        'Sprites',
        'Sprites 2'
      )
    })
    expect(
      await screen.findByText('That name is already in use. Renamed to "Sprites 2" instead.')
    ).toBeInTheDocument()
    expect(await screen.findByText('Sprites 2')).toBeInTheDocument()
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

    const resourcePane = screen.getByTestId('resource-management-pane')
    const heroLabel = await within(resourcePane).findByText('Hero')

    fireEvent.contextMenu(heroLabel, { clientX: 120, clientY: 160 })

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

    const heroButton = (
      await within(screen.getByTestId('resource-management-pane')).findByText('Hero')
    ).closest('button')

    if (!heroButton) {
      throw new Error('Expected Hero resource button.')
    }

    fireEvent.click(heroButton)
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

    const resourcePane = screen.getByTestId('resource-management-pane')
    const heroLabel = await within(resourcePane).findByText('Hero')

    fireEvent.contextMenu(heroLabel, { clientX: 120, clientY: 160 })
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

    const resourcePane = await openResourceFromPane('Room Scene')

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
      within(screen.getByTestId('project-workspace-scene-inspector')).getByText('Overworld')
    ).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-inspector')).getByText(
          'No tilemap selected'
        )
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-inspector')).getByText('Overworld')
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
              windowVisibilityBands: [{ start: 0, end: 16 }]
            }
          }
        }

        throw new Error(`Unexpected asset load: ${assetPath}`)
      }
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const resourcePane = await openResourceFromPane('Room Scene')

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
      within(screen.getByTestId('project-workspace-scene-inspector')).getByText('HUD')
    ).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-inspector')).getByText(
          'No window selected'
        )
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-inspector')).getByText('HUD')
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
              windowVisibilityBands: [{ start: 0, end: 16 }]
            }
          }
        }

        throw new Error(`Unexpected asset load: ${assetPath}`)
      }
    )

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const resourcePane = await openResourceFromPane('Room Scene')

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
        within(screen.getByTestId('project-workspace-scene-inspector')).getByText('Overworld')
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
        within(screen.getByTestId('project-workspace-scene-inspector')).getByText('HUD')
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-inspector')).getByText(
          'No window selected'
        )
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('project-workspace-scene-inspector')).getByText(
          'No tilemap selected'
        )
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

    const resourcePane = await openResourceFromPane('Room Scene')

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

    await openResourceFromPane('Room Scene')

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

    await openResourceFromPane('Room Scene')

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
        const movedActorButton = document.querySelector(
          '.scene-viewport__actor'
        ) as HTMLButtonElement
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

    const firstPosition = await dragActorTo({ x: 16, y: 16 }, { x: 24, y: 24 })
    const secondPosition = await dragActorTo({ x: 24, y: 24 }, { x: 40, y: 32 })

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

    await openResourceFromPane('Room Scene')

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
        const movedActorButton = document.querySelector(
          '.scene-viewport__actor'
        ) as HTMLButtonElement
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

    const firstPosition = await dragActorTo({ x: 16, y: 16 }, { x: 24, y: 24 })
    const secondPosition = await dragActorTo({ x: 24, y: 24 }, { x: 40, y: 32 })

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

  it('saves actor resources into the current resource folder and strips followCamera', async () => {
    vi.mocked(window.api.getProjectResources).mockImplementation(
      async (_projectPath, currentPath = '') => {
        if (currentPath === 'Actors') {
          return {
            projectName: 'Alpha',
            projectPath: '/projects/Alpha',
            currentPath: 'Actors',
            parentPath: '',
            items: []
          }
        }

        return {
          projectName: 'Alpha',
          projectPath: '/projects/Alpha',
          currentPath: '',
          parentPath: null,
          items: [
            {
              type: 'folder',
              id: 'actors-folder',
              name: 'Actors',
              path: 'Actors',
              parentPath: null
            },
            {
              type: 'file',
              name: 'Room Scene',
              fileName: 'Room Scene.rgbscene.json',
              path: 'Scenes/Room Scene.rgbscene.json',
              extension: 'json',
              resourceType: 'scene'
            }
          ]
        }
      }
    )
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
        currentPath: 'Actors',
        parentPath: '',
        items: []
      },
      resourceType: 'actor',
      resourcePath: 'Actors/Hero.rgbactor.json',
      resourceName: 'Hero',
      parentPath: 'Actors'
    })
    vi.mocked(window.api.saveProjectAssetFile).mockResolvedValue({
      assetKind: 'actor',
      resourcePath: 'Actors/Hero.rgbactor.json',
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

    const resourcePane = await openResourceFromPane('Room Scene')
    await screen.findByText('Load a tilemap to visualize the scene bounds.')
    fireEvent.doubleClick(within(resourcePane).getByText('Actors').closest('button')!)
    await screen.findByText('/Actors')

    const heroButton = await within(
      screen.getByTestId('project-workspace-scene-sidebar')
    ).findByText('Hero')
    fireEvent.contextMenu(heroButton.closest('.scene-hierarchy-pane__row')!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Save As Resource' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalled()
    })

    expect(window.api.createProjectResource).toHaveBeenCalledWith(
      '/projects/Alpha',
      'actor',
      'Actors',
      'Hero'
    )
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
    expect(vi.mocked(window.api.saveProjectAssetFile).mock.calls[0][1]).toBe(
      'Actors/Hero.rgbactor.json'
    )
    expect(
      (
        vi.mocked(window.api.saveProjectAssetFile).mock.calls[0][2] as {
          root: Record<string, unknown>
        }
      ).root
    ).toHaveProperty('resourcePath', undefined)
  })

  it('prompts to overwrite or save new when saving a linked actor resource', async () => {
    vi.mocked(window.api.getProjectResources).mockImplementation(
      async (_projectPath, currentPath = '') => {
        if (currentPath === 'Archive') {
          return {
            projectName: 'Alpha',
            projectPath: '/projects/Alpha',
            currentPath: 'Archive',
            parentPath: '',
            items: []
          }
        }

        return {
          projectName: 'Alpha',
          projectPath: '/projects/Alpha',
          currentPath: '',
          parentPath: null,
          items: [
            {
              type: 'folder',
              id: 'archive-folder',
              name: 'Archive',
              path: 'Archive',
              parentPath: null
            },
            {
              type: 'file',
              name: 'Room Scene',
              fileName: 'Room Scene.rgbscene.json',
              path: 'Scenes/Room Scene.rgbscene.json',
              extension: 'json',
              resourceType: 'scene'
            }
          ]
        }
      }
    )
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
                  resourcePath: 'Actors/Hero.rgbactor.json',
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
    vi.mocked(window.api.saveProjectAssetFile).mockResolvedValue({
      assetKind: 'actor',
      resourcePath: 'Actors/Hero.rgbactor.json',
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
          children: []
        }
      }
    })

    await renderWorkspaceAndWait(
      '/project-editor?projectName=Alpha&projectPath=%2Fprojects%2FAlpha'
    )

    const resourcePane = await openResourceFromPane('Room Scene')
    await screen.findByText('Load a tilemap to visualize the scene bounds.')
    fireEvent.doubleClick(within(resourcePane).getByText('Archive').closest('button')!)
    await screen.findByText('/Archive')

    const heroButton = await within(
      screen.getByTestId('project-workspace-scene-sidebar')
    ).findByText('Hero')
    fireEvent.contextMenu(heroButton.closest('.scene-hierarchy-pane__row')!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Save As Resource' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save New' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overwrite' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Actors/Hero.rgbactor.json',
        expect.any(Object)
      )
    })

    expect(window.api.createProjectResource).not.toHaveBeenCalled()
  })
})
