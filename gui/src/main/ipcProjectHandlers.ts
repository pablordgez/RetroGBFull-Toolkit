import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron'
import {
  createProjectStructure,
  listRecentProjects,
  validateProjectDirectory
} from './projectLauncher'
import { openProjectInFileExplorer, showProjectResourceInFileExplorer } from './projectFileExplorer'

interface ProjectActionResponse {
  ok: boolean
  canceled: boolean
  message: string
  project?: {
    name: string
    path: string
    lastOpenedAt: string
  }
}

type ProjectActionKind = 'create' | 'open'

interface RegisterProjectIpcHandlersOptions {
  getRecentProjectsStorePath: () => string
  showProjectDialog: (
    options: Electron.OpenDialogOptions
  ) => Promise<Electron.OpenDialogReturnValue>
  openProject: (
    projectPath: string,
    launcherWindow?: BrowserWindow | null
  ) => Promise<ProjectActionResponse>
  closeCurrentProject: (event: IpcMainInvokeEvent) => Promise<boolean>
  getSenderWindow: (event: IpcMainInvokeEvent) => BrowserWindow | null
  buildProjectActionErrorResponse: (
    action: ProjectActionKind,
    error: unknown
  ) => ProjectActionResponse
}

export const registerProjectIpcHandlers = ({
  getRecentProjectsStorePath,
  showProjectDialog,
  openProject,
  closeCurrentProject,
  getSenderWindow,
  buildProjectActionErrorResponse
}: RegisterProjectIpcHandlersOptions): void => {
  ipcMain.handle('project:list-recent', async () => {
    return listRecentProjects(getRecentProjectsStorePath())
  })

  ipcMain.handle('project:pick-create-location', async () => {
    const dialogOptions: Electron.OpenDialogOptions = {
      title: 'Choose Where To Create A Project',
      buttonLabel: 'Use Folder',
      properties: ['openDirectory']
    }
    const result = await showProjectDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('project:create', async (event, parentDirectory: string, projectName: string) => {
    try {
      const project = await createProjectStructure(parentDirectory, projectName)
      return openProject(project.path, getSenderWindow(event))
    } catch (error) {
      return buildProjectActionErrorResponse('create', error)
    }
  })

  ipcMain.handle('project:open-dialog', async (event) => {
    try {
      const dialogOptions: Electron.OpenDialogOptions = {
        title: 'Open Project Folder',
        buttonLabel: 'Open Project',
        properties: ['openDirectory']
      }
      const result = await showProjectDialog(dialogOptions)

      if (result.canceled || result.filePaths.length === 0) {
        return {
          ok: false,
          canceled: true,
          message: 'Project selection was canceled.'
        } satisfies ProjectActionResponse
      }

      const selectedPath = result.filePaths[0]
      const validation = await validateProjectDirectory(selectedPath)

      if (!validation.isValid) {
        return {
          ok: false,
          canceled: false,
          message: validation.message ?? 'The selected folder is not a valid project.'
        } satisfies ProjectActionResponse
      }

      return openProject(validation.path, getSenderWindow(event))
    } catch (error) {
      return buildProjectActionErrorResponse('open', error)
    }
  })

  ipcMain.handle('project:open-recent', async (event, projectPath: string) => {
    try {
      return await openProject(projectPath, getSenderWindow(event))
    } catch (error) {
      return buildProjectActionErrorResponse('open', error)
    }
  })

  ipcMain.handle('project:close-current', async (event) => {
    return closeCurrentProject(event)
  })

  ipcMain.handle('project:open-in-file-explorer', async (_, projectPath: string) => {
    return openProjectInFileExplorer(projectPath)
  })

  ipcMain.handle(
    'project:resources:show-in-file-explorer',
    async (_, projectPath: string, resourcePath: string) => {
      return showProjectResourceInFileExplorer(projectPath, resourcePath)
    }
  )
}
