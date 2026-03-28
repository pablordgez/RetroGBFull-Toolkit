import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import '../style/SpriteEditor.css'
import { ResourceManagementPane } from '../Docking/ResourceManagementPane'
import { ResizablePaneLayout } from '../Layout/ResizablePaneLayout'
import { AppMenuBar, AppMenuDefinition, AppMenuItem } from '../MenuBar/AppMenuBar'
import { EditorClosePrompt } from '../ProjectAssets/EditorClosePrompt'
import { SceneHierarchyPane } from '../SceneHierarchy/SceneHierarchyPane'
import { useSceneWorkspaceSession } from './useSceneWorkspaceSession'
import './ProjectWorkspace.css'

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
  scan: 'Something went wrong while scanning the project directory.'
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
  const [statusMessage, setStatusMessage] = useState<WorkspaceStatus | null>(null)
  const [isBusy, setIsBusy] = useState(false)

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
      }
    ]
  }, [
    handleCloseProject,
    handleOpenProject,
    handleOpenProjectInExplorer,
    handleScanProjectDirectory,
    isBusy,
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

      <div className="project-workspace__layout">
        <ResizablePaneLayout
          className="project-workspace__resizable-layout"
          pane={
            <ResourceManagementPane
              className="project-workspace__resource-pane"
              onOpenScene={openScene}
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
          <ResizablePaneLayout
            className="project-workspace__editor-layout"
            direction="horizontal"
            panePosition="start"
            pane={
              <SceneHierarchyPane
                key={activeScenePath ?? 'no-scene'}
                className="project-workspace__editor-pane project-workspace__editor-pane--sidebar"
                scene={activeSceneDocument}
                sceneLabel={activeSceneLabel}
                isDirty={Boolean(isSceneDirty)}
                isSaving={isSceneSaving || isSceneLoading}
                statusMessage={sceneStatusMessage}
                onSceneChange={updateSceneDocument}
                onSave={() => {
                  void saveActiveScene()
                }}
              />
            }
            initialPaneSize={260}
            minPaneSize={180}
            maxPaneSizeRatio={0.45}
            resizeHandleLabel="Resize scene editor panes"
          >
            <section
              className="project-workspace__editor-pane project-workspace__editor-pane--main"
              data-testid="project-workspace-surface"
            >
              {!activeScenePath && (
                <div className="project-workspace__empty-state">
                  Create or load a new scene to start working
                </div>
              )}
            </section>
          </ResizablePaneLayout>
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
