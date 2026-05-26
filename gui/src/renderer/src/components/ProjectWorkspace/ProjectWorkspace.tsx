import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import '../style/SpriteEditor.css'
import { ResourceManagementPane } from '../Docking/ResourceManagementPane'
import { ResizablePaneLayout } from '../Layout/ResizablePaneLayout'
import { AppMenuBar, AppMenuDefinition, AppMenuItem } from '../MenuBar/AppMenuBar'
import { EditorClosePrompt } from '../ProjectAssets/EditorClosePrompt'
import { SceneEditorWorkspace } from './SceneEditorWorkspace'
import { MakeSetupGuideModal } from '../Toolchains/MakeSetupGuideModal'
import { useSceneWorkspaceSession } from './useSceneWorkspaceSession'
import './ProjectWorkspace.css'
import type { GbdkToolchainStatus } from '../../../../shared/projectGbdk'
import type { MakeToolchainStatus } from '../../../../shared/projectMake'
import type { ProjectBuildProgressPayload } from '../../../../shared/projectCodeWorkspace'
import type { RuntimePlatform } from '../../../../shared/runtimePlatform'

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
  buildCode: 'Something went wrong while building the project.',
  buildAndCompile: 'Something went wrong while building and compiling the project.',
  openSaveData: 'Something went wrong while opening the save-data editor.',
  openTags: 'Something went wrong while opening the tag editor.'
} as const

const formatCount = (count: number, singular: string, plural = `${singular}s`): string => {
  return `${count} ${count === 1 ? singular : plural}`
}

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

const formatBuildStatusMessage = (result: {
  saveDataEntryCount: number
  spriteCount: number
  tilesetCount: number
  tilemapCount: number
  windowCount: number
  musicCount: number
  sceneCount: number
}): string => {
  return `Built project code for ${formatCount(result.saveDataEntryCount, 'save entry', 'save entries')}, ${formatCount(result.spriteCount, 'sprite')}, ${formatCount(result.tilesetCount, 'tileset')}, ${formatCount(result.tilemapCount, 'tilemap')}, ${formatCount(result.windowCount, 'window')}, ${formatCount(result.musicCount, 'music asset', 'music assets')}, and ${formatCount(result.sceneCount, 'scene')}.`
}

const formatBuildProgressMessage = (progress: ProjectBuildProgressPayload): string => {
  switch (progress.stage) {
    case 'build':
      return progress.message || 'Building project code...'
    case 'clean':
      return progress.message
        ? `Cleaning previous build... ${progress.message}`
        : 'Cleaning previous build...'
    case 'compile':
      return progress.message ? `Compiling... ${progress.message}` : 'Compiling...'
    default:
      return progress.message
  }
}

export const ProjectWorkspace = (): ReactElement => {
  const [searchParams] = useSearchParams()
  const projectName = searchParams.get('projectName') ?? 'Project Workspace'
  const projectPath = searchParams.get('projectPath') ?? ''
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [resourceManagerCurrentPath, setResourceManagerCurrentPath] = useState('')
  const [statusMessage, setStatusMessage] = useState<WorkspaceStatus | null>(null)
  const [activeBuildOperation, setActiveBuildOperation] = useState<'build' | 'build-and-compile' | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [gbdkStatus, setGbdkStatus] = useState<GbdkToolchainStatus | null>(null)
  const [isInstallingGbdk, setIsInstallingGbdk] = useState(false)
  const [makeStatus, setMakeStatus] = useState<MakeToolchainStatus | null>(null)
  const [isInstallingMake, setIsInstallingMake] = useState(false)
  const [isRefreshingMakeStatus, setIsRefreshingMakeStatus] = useState(false)
  const [runtimePlatform, setRuntimePlatform] = useState<RuntimePlatform>('unknown')
  const [isMakeGuideOpen, setIsMakeGuideOpen] = useState(false)

  const showStatus = (tone: WorkspaceStatusTone, text: string): void => {
    setStatusMessage({ tone, text })
  }

  const dismissStatus = useCallback((): void => {
    setStatusMessage(null)
  }, [])

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

  const refreshMakeStatus = useCallback(async (options?: { announceSuccess?: boolean }) => {
    setIsRefreshingMakeStatus(true)

    try {
      const nextMakeStatus = await window.api.getMakeToolchainStatus()
      setMakeStatus(nextMakeStatus)

      if (nextMakeStatus.installed) {
        if (options?.announceSuccess) {
          showStatus('info', `GNU Make detected at ${nextMakeStatus.executablePath}.`)
        }
      }
    } catch (error) {
      console.error('[project-workspace] getMakeToolchainStatus failed', error)
      showStatus('error', 'Something went wrong while checking GNU Make.')
    } finally {
      setIsRefreshingMakeStatus(false)
    }
  }, [])

  useEffect(() => {
    void loadRecentProjects()
  }, [loadRecentProjects])

  useEffect(() => {
    const loadToolchainStatuses = async () => {
      try {
        setRuntimePlatform(await window.api.getRuntimePlatform())
      } catch (error) {
        console.error('[project-workspace] getRuntimePlatform failed', error)
        setRuntimePlatform('unknown')
      }

      try {
        setGbdkStatus(await window.api.getGbdkToolchainStatus())
      } catch (error) {
        console.error('[project-workspace] getGbdkToolchainStatus failed', error)
      }

      await refreshMakeStatus()
    }

    void loadToolchainStatuses()
  }, [projectPath, refreshMakeStatus])

  useEffect(() => {
    return window.api.onProjectBuildProgress((payload) => {
      if (payload.projectPath !== projectPath) {
        return
      }

      showStatus('info', formatBuildProgressMessage(payload))
    })
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

  const handleBuildProject = useCallback(async () => {
    if (!projectPath) {
      return
    }

    setActiveBuildOperation('build')
    setIsBusy(true)
    showStatus('info', 'Building project code...')

    try {
      const result = await window.api.buildProjectCode(projectPath)
      showStatus('info', formatBuildStatusMessage(result))
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

  const handleInstallMake = useCallback(async () => {
    setIsInstallingMake(true)

    try {
      const result = await window.api.installLatestMakeToolchain()
      setMakeStatus(result)
      showStatus('info', `Installed GNU Make ${result.releaseVersion} from ${result.archiveName}.`)
    } catch (error) {
      console.error('[project-workspace] installLatestMakeToolchain failed', error)
      setIsMakeGuideOpen(true)
      showStatus(
        'error',
        error instanceof Error ? error.message : 'Something went wrong while installing GNU Make.'
      )
    } finally {
      setIsInstallingMake(false)
    }
  }, [])

  const isInstallingToolchain = isInstallingGbdk || isInstallingMake
  const isBuildDisabled =
    isBusy || isInstallingToolchain || !projectPath || !Boolean(gbdkStatus?.installed)
  const isBuildAndCompileDisabled = isBuildDisabled || !Boolean(makeStatus?.installed)

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
      setActiveBuildOperation(null)
      setIsBusy(false)
    }
  }, [projectPath])

  const handleBuildAndCompileProject = useCallback(async () => {
    if (!projectPath) {
      return
    }

    setActiveBuildOperation('build-and-compile')
    setIsBusy(true)
    showStatus('info', 'Building project code...')

    try {
      const result = await window.api.buildAndCompileProject(projectPath)
      showStatus('info', `Built project code and compiled ${result.compileResult.romPath ?? 'the ROM output'}.`)
      setRefreshVersion((currentVersion) => currentVersion + 1)
    } catch (error) {
      console.error('[project-workspace] buildAndCompileProject failed', error)
      showStatus(
        'error',
        error instanceof Error ? error.message : GENERIC_WORKSPACE_ERRORS.buildAndCompile
      )
    } finally {
      setActiveBuildOperation(null)
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
            id: 'build-project',
            label: 'Build',
            disabled: isBuildDisabled,
            onSelect: () => void handleBuildProject()
          },
          {
            id: 'build-and-compile-project',
            label: 'Build + Compile',
            disabled: isBuildAndCompileDisabled,
            onSelect: () => void handleBuildAndCompileProject()
          }
        ]
      }
    ]
  }, [
    handleBuildAndCompileProject,
    handleBuildProject,
    handleCloseProject,
    handleInstallGbdk,
    handleInstallMake,
    handleOpenSaveDataEditor,
    handleOpenTagEditor,
    handleOpenProject,
    handleOpenProjectInExplorer,
    handleScanProjectDirectory,
    gbdkStatus?.installed,
    makeStatus?.installed,
    isBusy,
    isInstallingGbdk,
    isInstallingMake,
    isInstallingToolchain,
    isBuildAndCompileDisabled,
    isBuildDisabled,
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
          <div className="project-workspace__status-main">
            {activeBuildOperation && statusMessage.tone === 'info' && (
              <span
                className="project-workspace__status-spinner"
                aria-label="Build in progress"
              />
            )}
            <span className="project-workspace__status-text">{statusMessage.text}</span>
          </div>
          {statusMessage.tone === 'error' && (
            <button
              type="button"
              className="project-workspace__status-dismiss"
              onClick={dismissStatus}
              aria-label="Dismiss message"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {gbdkStatus && !gbdkStatus.installed && (
        <div className="project-workspace__toolchain-banner" role="status">
          <div className="project-workspace__toolchain-copy">
            <strong>GBDK is missing</strong>
            <span>{gbdkStatus.installPath}</span>
          </div>
          <button type="button" onClick={() => void handleInstallGbdk()} disabled={isBusy || isInstallingToolchain}>
            {isInstallingGbdk ? 'Installing GBDK...' : 'Install GBDK'}
          </button>
        </div>
      )}

      {makeStatus && !makeStatus.installed && (
        <div className="project-workspace__toolchain-banner" role="status">
          <div className="project-workspace__toolchain-copy">
            <strong>GNU Make is missing</strong>
            <span>{makeStatus.installPath}</span>
          </div>
          <div className="project-workspace__toolchain-actions">
            <button type="button" onClick={() => setIsMakeGuideOpen(true)} disabled={isBusy || isInstallingToolchain}>
              Open Setup Guide
            </button>
            <button type="button" onClick={() => void handleInstallMake()} disabled={isBusy || isInstallingToolchain}>
              {isInstallingMake ? 'Installing GNU Make...' : 'Try Install Anyway'}
            </button>
          </div>
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

      {isMakeGuideOpen && (
        <MakeSetupGuideModal
          platform={runtimePlatform}
          status={makeStatus}
          isRefreshing={isRefreshingMakeStatus}
          onRefresh={() => {
            void refreshMakeStatus({ announceSuccess: true })
          }}
          onClose={() => setIsMakeGuideOpen(false)}
        />
      )}
    </div>
  )
}
