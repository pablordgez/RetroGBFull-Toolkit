import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  createProjectStructure,
  getProjectLauncherErrorMessage,
  listRecentProjects,
  rememberRecentProject,
  validateProjectDirectory
} from './projectLauncher'

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

const getRecentProjectsStorePath = (): string => {
  return join(app.getPath('userData'), 'recent-projects.json')
}

const buildProjectActionErrorResponse = (
  action: ProjectActionKind,
  error: unknown
): ProjectActionResponse => {
  console.error(`[project-launcher] ${action} failed`, error)

  return {
    ok: false,
    canceled: false,
    message: getProjectLauncherErrorMessage(error, action)
  }
}

const showProjectDialog = async (options: Electron.OpenDialogOptions) => {
  const browserWindow = BrowserWindow.getFocusedWindow()

  if (process.platform === 'linux' || !browserWindow) {
    return dialog.showOpenDialog(options)
  }

  return dialog.showOpenDialog(browserWindow, options)
}

const createChildWindow = (hash: string, options?: { width?: number; height?: number }): BrowserWindow => {
  const childWindow = new BrowserWindow({
    width: options?.width ?? 1000,
    height: options?.height ?? 1000,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    childWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    childWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }

  return childWindow
}

const openProject = async (projectPath: string): Promise<ProjectActionResponse> => {
  try {
    const project = await rememberRecentProject(getRecentProjectsStorePath(), projectPath)

    console.info(`[project-launcher] openProject stub invoked for ${project.path}`)

    return {
      ok: true,
      canceled: false,
      message: `Open project stub invoked for "${project.name}".`,
      project
    }
  } catch (error) {
    return buildProjectActionErrorResponse('open', error)
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })


  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})



// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
ipcMain.handle('project:list-recent', async () => {
  return listRecentProjects(getRecentProjectsStorePath())
})

ipcMain.handle('project:pick-create-location', async () => {
  const dialogOptions = {
    title: 'Choose Where To Create A Project',
    buttonLabel: 'Use Folder',
    properties: ['openDirectory' as const]
  }
  const result = await showProjectDialog(dialogOptions)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('project:create', async (_, parentDirectory: string, projectName: string) => {
  try {
    const project = await createProjectStructure(parentDirectory, projectName)
    return openProject(project.path)
  } catch (error) {
    return buildProjectActionErrorResponse('create', error)
  }
})

ipcMain.handle('project:open-dialog', async () => {
  try {
    const dialogOptions = {
      title: 'Open Project Folder',
      buttonLabel: 'Open Project',
      properties: ['openDirectory' as const]
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

    return openProject(validation.path)
  } catch (error) {
    return buildProjectActionErrorResponse('open', error)
  }
})

ipcMain.handle('project:open-recent', async (_, projectPath: string) => {
  try {
    return await openProject(projectPath)
  } catch (error) {
    return buildProjectActionErrorResponse('open', error)
  }
})

ipcMain.on('open-sprite-editor-window', () => {
  createChildWindow('/sprite-editor')
})

ipcMain.on('open-tileset-editor-window', () => {
  createChildWindow('/tileset-editor')
})

ipcMain.on('open-tilemap-editor-window', () => {
  createChildWindow('/tilemap-editor')
})
