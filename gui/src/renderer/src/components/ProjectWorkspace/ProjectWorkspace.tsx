import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import '../style/SpriteEditor.css'
import { ResourceManagementPane } from '../Docking/ResourceManagementPane'
import { ResizablePaneLayout } from '../Layout/ResizablePaneLayout'
import { AppMenuBar, AppMenuDefinition, AppMenuItem } from '../MenuBar/AppMenuBar'
import { EditorClosePrompt } from '../ProjectAssets/EditorClosePrompt'
import { SceneEditorWorkspace } from './SceneEditorWorkspace'
import { useSceneWorkspaceSession } from './useSceneWorkspaceSession'
import './ProjectWorkspace.css'
import type { GbdkToolchainStatus } from '../../../../shared/projectGbdk'

interface RecentProject {
  name: string
  path: string
  lastOpenedAt: string
}

interface ProjectDirectoryScanResult {
  trackedCount: number
  removedCount: number
}

type WorkspaceStatusTone = 'error' | 'info'

interface WorkspaceStatus {
  tone: WorkspaceStatusTone
  text: string
}

const GENERIC_WORKSPACE_ERRORS = {
  open: 'Something went wrong while opening the project. Please try again.',
  recentList: 'Something went wrong while loading recent projects.',
  close: 'Something went wrong while closing the project. Please try again.',
  fileExplorer: 'Something went wrong while opening the project folder.',
  scan: 'Something went wrong while scanning the project directory.',
  copyCore: 'Something went wrong while copying the engine core.',
  buildCode: 'Something went wrong while building project code.',
  openSaveData: 'Something went wrong while opening the save-data editor.',
  openTags: 'Something went wrong while opening the tag editor.'
} as const

const formatScanStatusMessage = (result: ProjectDirectoryScanResult): string => {
  const messageParts: string[] = []

  if (result.trackedCount > 0) {
    messageParts.push(
      `Tracked ${result.trackedCount} new resource${result.trackedCount === 1 ? '' : 's'}.`
    )
  }

  if (result.removedCount > 0) {
    messageParts.push(
      `Removed ${result.removedCount} missing item${result.removedCount === 1 ? '' : 's'}.`
    )
  }

  if (messageParts.length === 0) {
    return 'Project scan did not find any changes.'
  }

  return messageParts.join(' ')
}

export const ProjectWorkspace = (): ReactElement => {
  const [searchParams] = useSearchParams()
  const projectName = searchParams.get('projectName') ?? 'Project Workspace'
  const projectPath = searchParams.get('projectPath') ?? ''
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [resourceManagerCurrentPath, setResourceManagerCurrentPath] = useState('')
  const [statusMessage, setStatusMessage] = useState<WorkspaceStatus | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [gbdkStatus, setGbdkStatus] = useState<GbdkToolchainStatus | null>(null)
  const [isInstallingGbdk, setIsInstallingGbdk] = useState(false)

  const showStatus = (tone: WorkspaceStatusTone, text: string): void => {
    setStatusMessage({ tone, text })
  }

  const {
    activeScenePath,
    activeSceneDocument,
    activeSceneLabel,
    isSceneDirty,
    sceneStatusMessage,
    isSceneSaving,
    isSceneLoading,
    isSceneClosePromptOpen,
    openScene,
    updateSceneDocument,
    saveActiveScene,
    handleSceneCloseDecision,
    handleTrackedResourceMutation
  } = useSceneWorkspaceSession({
    projectPath,
    onError: (message) => {
      showStatus('error', message)
    }
  })

  const loadRecentProjects = useCallback(async () => {
    try {
      const projects = await window.api.getRecentProjects()
      setRecentProjects(projects)
    } catch (error) {
      console.error('[project-workspace] getRecentProjects failed', error)
      showStatus('error', GENERIC_WORKSPACE_ERRORS.recentList)
    }
  }, [])

  useEffect(() => {
    void loadRecentProjects()
  }, [loadRecentProjects])

  useEffect(() => {
    const loadGbdkStatus = async () => {
      try {
        setGbdkStatus(await window.api.getGbdkToolchainStatus())
      } catch (error) {
        console.error('[project-workspace] getGbdkToolchainStatus failed', error)
      }
    }

    void loadGbdkStatus()
  }, [projectPath])

  const handleOpenProject = useCallback(async () => {
    setIsBusy(true)

    try {
      const response = await window.api.openProjectFromDialog()

      if (!response.canceled && !response.ok) {
        showStatus('error', response.message)
      }
    } catch (error) {
      console.error('[project-workspace] openProjectFromDialog failed', error)
      showStatus('error', GENERIC_WORKSPACE_ERRORS.open)
    } finally {
      setIsBusy(false)
    }
  }, [])

  const handleLoadRecentProject = useCallback(async (nextProjectPath: string) => {
    setIsBusy(true)

    try {
      const response = await window.api.loadRecentProject(nextProjectPath)

      if (!response.canceled && !response.ok) {
        showStatus('error', response.message)
      }
    } catch (error) {
      console.error('[project-workspace] loadRecentProject failed', error)
      showStatus('error', GENERIC_WORKSPACE_ERRORS.open)
    } finally {
      setIsBusy(false)
    }
  }, [])

  const handleCloseProject = useCallback(async () => {
    setIsBusy(true)

    try {
      await window.api.closeCurrentProject()
    } catch (error) {
      console.error('[project-workspace] closeCurrentProject failed', error)
      showStatus('error', GENERIC_WORKSPACE_ERRORS.close)
    } finally {
      setIsBusy(false)
    }
  }, [])

  const handleOpenProjectInExplorer = useCallback(async () => {
    if (!projectPath) {
      return
    }

    setIsBusy(true)

    try {
      await window.api.openProjectInFileExplorer(projectPath)
    } catch (error) {
      console.error('[project-workspace] openProjectInFileExplorer failed', error)
      showStatus(
        'error',
        error instanceof Error ? error.message : GENERIC_WORKSPACE_ERRORS.fileExplorer
      )
    } finally {
      setIsBusy(false)
    }
  }, [projectPath])

  const handleScanProjectDirectory = useCallback(async () => {
    if (!projectPath) {
      return
    }

    setIsBusy(true)

    try {
      const result = await window.api.scanProjectDirectory(projectPath)
      setRefreshVersion((currentVersion) => currentVersion + 1)
      showStatus('info', formatScanStatusMessage(result))
    } catch (error) {
      console.error('[project-workspace] scanProjectDirectory failed', error)
      showStatus('error', error instanceof Error ? error.message : GENERIC_WORKSPACE_ERRORS.scan)
    } finally {
      setIsBusy(false)
    }
  }, [projectPath])

  const handleCopyEngineCore = useCallback(async () => {
    if (!projectPath) {
      return
    }

    setIsBusy(true)

    try {
      const result = await window.api.copyProjectEngineCore(projectPath)
      showStatus(
        'info',
        `Copied ${result.copiedPaths.length} core item${result.copiedPaths.length === 1 ? '' : 's'} and skipped ${result.skippedPaths.length}.`
      )
      setRefreshVersion((currentVersion) => currentVersion + 1)
    } catch (error) {
      console.error('[project-workspace] copyProjectEngineCore failed', error)
      showStatus('error', error instanceof Error ? error.message : GENERIC_WORKSPACE_ERRORS.copyCore)
    } finally {
      setIsBusy(false)
    }
  }, [projectPath])

  const handleBuildProjectCode = useCallback(async () => {
    if (!projectPath) {
      return
    }

    setIsBusy(true)

    try {
      const result = await window.api.buildProjectCode(projectPath)
      showStatus(
        'info',
        `Built project code for ${result.saveDataEntryCount} save entr${result.saveDataEntryCount === 1 ? 'y' : 'ies'}, ${result.spriteCount} sprites, ${result.tilesetCount} tilesets, ${result.tilemapCount} tilemaps, ${result.windowCount} windows, ${result.musicCount} music assets, and ${result.sceneCount} scenes.`
      )
      setRefreshVersion((currentVersion) => currentVersion + 1)
    } catch (error) {
      console.error('[project-workspace] buildProjectCode failed', error)
      showStatus(
        'error',
        error instanceof Error ? error.message : GENERIC_WORKSPACE_ERRORS.buildCode
      )
    } finally {
      setIsBusy(false)
    }
  }, [projectPath])

  const handleOpenSaveDataEditor = useCallback(async () => {
    if (!projectPath) {
      return
    }

    setIsBusy(true)

    try {
      await window.api.openProjectSaveDataEditor(projectPath)
    } catch (error) {
      console.error('[project-workspace] openProjectSaveDataEditor failed', error)
      showStatus(
        'error',
        error instanceof Error ? error.message : GENERIC_WORKSPACE_ERRORS.openSaveData
      )
    } finally {
      setIsBusy(false)
    }
  }, [projectPath])

  const handleInstallGbdk = useCallback(async () => {
    setIsInstallingGbdk(true)

    try {
      const result = await window.api.installLatestGbdkToolchain()
      setGbdkStatus(result)
      showStatus('info', `Installed ${result.releaseTag} from ${result.assetName}.`)
    } catch (error) {
      console.error('[project-workspace] installLatestGbdkToolchain failed', error)
      showStatus(
        'error',
        error instanceof Error ? error.message : 'Something went wrong while installing GBDK.'
      )
    } finally {
      setIsInstallingGbdk(false)
    }
  }, [])

  const handleOpenTagEditor = useCallback(async () => {
    if (!projectPath) {
      return
    }

    setIsBusy(true)

    try {
      await window.api.openProjectTagEditor(projectPath)
    } catch (error) {
      console.error('[project-workspace] openProjectTagEditor failed', error)
      showStatus('error', error instanceof Error ? error.message : GENERIC_WORKSPACE_ERRORS.openTags)
    } finally {
      setIsBusy(false)
    }
  }, [projectPath])

  useEffect(() => {
    if (!activeScenePath || !activeSceneDocument) {
      return
    }

    const handleSaveShortcut = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') {
        return
      }

      event.preventDefault()
      void saveActiveScene()
    }

    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  }, [activeSceneDocument, activeScenePath, saveActiveScene])

  const recentProjectItems = useMemo((): AppMenuItem[] => {
    if (recentProjects.length === 0) {
      return [{ id: 'recent-empty', label: 'No recent projects', disabled: true }]
    }

    return recentProjects.map((project) => ({
      id: project.path,
      label: project.name,
      disabled: isBusy || project.path === projectPath,
      onSelect: () => void handleLoadRecentProject(project.path)
    }))
  }, [handleLoadRecentProject, isBusy, projectPath, recentProjects])

  const menus = useMemo((): AppMenuDefinition[] => {
    return [
      {
        id: 'project-menu',
        label: 'Project',
        onOpen: () => {
          void loadRecentProjects()
        },
        items: [
          {
            id: 'open-project',
            label: 'Open project...',
            disabled: isBusy,
            onSelect: () => void handleOpenProject()
          },
          {
            id: 'recent-projects',
            label: 'Recent projects...',
            disabled: isBusy,
            children: recentProjectItems
          },
          {
            id: 'close-project',
            label: 'Close project',
            disabled: isBusy,
            onSelect: () => void handleCloseProject()
          },
          {
            id: 'open-project-in-explorer',
            label: 'Open project in file explorer',
            disabled: isBusy || !projectPath,
            onSelect: () => void handleOpenProjectInExplorer()
          },
          {
            id: 'scan-project-directory',
            label: 'Scan project directory',
            disabled: isBusy || !projectPath,
            onSelect: () => void handleScanProjectDirectory()
          }
        ]
      },
      {
        id: 'code-menu',
        label: 'Code',
        items: [
          {
            id: 'edit-save-data',
            label: 'Edit Save Data...',
            disabled: isBusy || !projectPath,
            onSelect: () => void handleOpenSaveDataEditor()
          },
          {
            id: 'edit-tags',
            label: 'Edit Tags...',
            disabled: isBusy || !projectPath,
            onSelect: () => void handleOpenTagEditor()
          },
          {
            id: 'copy-engine-core',
            label: 'Copy Engine Core',
            disabled: isBusy || isInstallingGbdk || !projectPath,
            onSelect: () => void handleCopyEngineCore()
          },
          {
            id: 'install-gbdk',
            label:
              isInstallingGbdk || !gbdkStatus?.installed
                ? 'Install GBDK'
                : 'Reinstall GBDK',
            disabled: isBusy || isInstallingGbdk,
            onSelect: () => void handleInstallGbdk()
          },
          {
            id: 'build-project-code',
            label: 'Build Project Code',
            disabled: isBusy || isInstallingGbdk || !projectPath,
            onSelect: () => void handleBuildProjectCode()
          }
        ]
      }
    ]
  }, [
    handleBuildProjectCode,
    handleCloseProject,
    handleCopyEngineCore,
    handleInstallGbdk,
    handleOpenSaveDataEditor,
    handleOpenTagEditor,
    handleOpenProject,
    handleOpenProjectInExplorer,
    handleScanProjectDirectory,
    gbdkStatus?.installed,
    isBusy,
    isInstallingGbdk,
    loadRecentProjects,
    projectPath,
    recentProjectItems
  ])

  return (
    <div className="project-workspace">
      <div className="project-workspace__topbar">
        <div className="project-workspace__menu-cluster">
          <AppMenuBar menus={menus} />
        </div>

        <div className="project-workspace__project-summary">
          <strong>{projectName}</strong>
          <span>{projectPath}</span>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`project-workspace__status project-workspace__status--${statusMessage.tone}`}
          role="status"
        >
          {statusMessage.text}
        </div>
      )}

      {gbdkStatus && !gbdkStatus.installed && (
        <div className="project-workspace__gbdk-banner" role="status">
          <div className="project-workspace__gbdk-copy">
            <strong>GBDK is missing</strong>
            <span>{gbdkStatus.installPath}</span>
          </div>
          <button type="button" onClick={() => void handleInstallGbdk()} disabled={isBusy || isInstallingGbdk}>
            {isInstallingGbdk ? 'Installing GBDK...' : 'Install GBDK'}
          </button>
        </div>
      )}

      <div className="project-workspace__layout">
        <ResizablePaneLayout
          className="project-workspace__resizable-layout"
          pane={
            <ResourceManagementPane
              className="project-workspace__resource-pane"
              onOpenScene={openScene}
              onCurrentPathChange={setResourceManagerCurrentPath}
              onResourceMutation={handleTrackedResourceMutation}
              projectPath={projectPath}
              refreshVersion={refreshVersion}
            />
          }
          initialPaneSize={220}
          minPaneSize={140}
          maxPaneSizeRatio={0.6}
          resizeHandleLabel="Resize bottom pane"
        >
          <SceneEditorWorkspace
            key={activeScenePath ?? 'no-scene'}
            projectPath={projectPath}
            scenePath={activeScenePath}
            scene={activeSceneDocument}
            resourceManagerCurrentPath={resourceManagerCurrentPath}
            sceneLabel={activeSceneLabel}
            isDirty={Boolean(isSceneDirty)}
            isSaving={isSceneSaving || isSceneLoading}
            statusMessage={sceneStatusMessage}
            onSceneChange={updateSceneDocument}
            onSave={() => {
              void saveActiveScene()
            }}
            onStatus={showStatus}
            onResourcesChanged={() => {
              setRefreshVersion((currentVersion) => currentVersion + 1)
            }}
          />
        </ResizablePaneLayout>
      </div>

      {isSceneClosePromptOpen && activeSceneLabel && (
        <EditorClosePrompt
          assetLabel={activeSceneLabel}
          isBusy={isSceneSaving || isSceneLoading}
          onCloseDecision={(decision) => {
            void handleSceneCloseDecision(decision)
          }}
        />
      )}
    </div>
  )
}
