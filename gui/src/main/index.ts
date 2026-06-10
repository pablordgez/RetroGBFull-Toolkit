import {
  app,
  shell,
  BrowserWindow,
  dialog,
  IpcMainInvokeEvent,
  net,
  protocol,
  session
} from 'electron'
import { join, normalize, resolve } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  getProjectLauncherErrorMessage,
  rememberRecentProject
} from './projectLauncher'
import { clearDeletedProjectResources } from './projectResources'
import { registerCodeIpcHandlers } from './ipcCodeHandlers'
import { registerEditorIpcHandlers } from './ipcEditorHandlers'
import { registerProjectIpcHandlers } from './ipcProjectHandlers'
import { registerResourceIpcHandlers } from './ipcResourceHandlers'
import { registerToolchainIpcHandlers } from './ipcToolchainHandlers'

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

interface AppWindowOptions {
  width?: number
  height?: number
  showWhenReady?: boolean
  title?: string
}

const ELECTRON_APP_SCHEME = 'app'
const APP_DISPLAY_NAME = 'RetroGBFull-Toolkit'
const APP_USER_DATA_DIRECTORY = 'retrogbfull-toolkit'
const CROSS_ORIGIN_RESPONSE_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}
const CROSS_ORIGIN_WEB_REQUEST_HEADERS = {
  'Cross-Origin-Opener-Policy': ['same-origin'],
  'Cross-Origin-Embedder-Policy': ['require-corp']
}
const shouldDisableChromiumSandbox =
  process.platform === 'linux' &&
  !is.dev &&
  process.env['RETROGBFULL_ENABLE_CHROMIUM_SANDBOX'] !== '1'

const editorWindowsWaitingForCloseConfirmation = new Set<number>()
const projectWindowPaths = new Map<number, string>()
const projectWindowsWaitingForCleanup = new Set<number>()
const projectWindowsReadyToClose = new Set<number>()
let isQuittingAfterCleanup = false
let hasHandledBeforeQuitCleanup = false

if (shouldDisableChromiumSandbox) {
  app.commandLine.appendSwitch('no-sandbox')
}

app.setName(APP_DISPLAY_NAME)
app.setPath('userData', join(app.getPath('appData'), APP_USER_DATA_DIRECTORY))

protocol.registerSchemesAsPrivileged([
  {
    scheme: ELECTRON_APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

const getPackagedRendererRoot = (): string => {
  return resolve(__dirname, '../renderer')
}

const buildRendererWindowUrl = (hash = ''): string => {
  const normalizedHash = hash.startsWith('/') ? hash : `/${hash}`
  return `${ELECTRON_APP_SCHEME}://renderer/index.html#${normalizedHash}`
}

const registerRendererProtocol = (): void => {
  protocol.handle(ELECTRON_APP_SCHEME, async (request) => {
    const requestUrl = new URL(request.url)
    const rendererRoot = getPackagedRendererRoot()
    const relativePath =
      requestUrl.hostname === 'renderer' && requestUrl.pathname !== '/'
        ? requestUrl.pathname
        : '/index.html'
    const normalizedPath = normalize(decodeURIComponent(relativePath)).replace(/^([\\/])+/, '')
    const absolutePath = resolve(rendererRoot, normalizedPath)

    if (!absolutePath.startsWith(rendererRoot)) {
      return new Response('Not found', {
        status: 404,
        headers: CROSS_ORIGIN_RESPONSE_HEADERS
      })
    }

    const fileResponse = await net.fetch(pathToFileURL(absolutePath).toString())

    return new Response(fileResponse.body, {
      status: fileResponse.status,
      statusText: fileResponse.statusText,
      headers: {
        ...Object.fromEntries(fileResponse.headers.entries()),
        ...CROSS_ORIGIN_RESPONSE_HEADERS
      }
    })
  })
}

const enableCrossOriginIsolationHeaders = (): void => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        ...CROSS_ORIGIN_WEB_REQUEST_HEADERS
      }
    })
  })
}

const clearDeletedResourcesForProject = async (projectPath: string, reason: string): Promise<void> => {
  try {
    await clearDeletedProjectResources(projectPath)
  } catch (error) {
    console.error(`[project-resources] failed to clear deleted resources during ${reason}`, error)
  }
}

const clearDeletedResourcesForOpenProjects = async (): Promise<void> => {
  const projectPaths = [...new Set(projectWindowPaths.values())]
  await Promise.all(projectPaths.map((projectPath) => clearDeletedResourcesForProject(projectPath, 'application shutdown')))
}

const registerProjectWindow = (projectWindow: BrowserWindow, projectPath: string): void => {
  const windowId = projectWindow.webContents.id
  projectWindowPaths.set(windowId, projectPath)

  projectWindow.on('close', (event) => {
    if (isQuittingAfterCleanup || projectWindowsReadyToClose.has(windowId)) {
      projectWindowsReadyToClose.delete(windowId)
      projectWindowPaths.delete(windowId)
      return
    }

    if (projectWindowsWaitingForCleanup.has(windowId)) {
      event.preventDefault()
      return
    }

    event.preventDefault()
    projectWindowsWaitingForCleanup.add(windowId)

    void clearDeletedResourcesForProject(projectPath, 'project window close')
      .finally(() => {
        projectWindowsWaitingForCleanup.delete(windowId)
        projectWindowPaths.delete(windowId)

        if (projectWindow.isDestroyed()) {
          return
        }

        projectWindowsReadyToClose.add(windowId)
        projectWindow.close()
      })
  })

  projectWindow.on('closed', () => {
    projectWindowPaths.delete(windowId)
    projectWindowsWaitingForCleanup.delete(windowId)
    projectWindowsReadyToClose.delete(windowId)
  })
}

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

const showProjectDialog = async (
  options: Electron.OpenDialogOptions
): Promise<Electron.OpenDialogReturnValue> => {
  const browserWindow = BrowserWindow.getFocusedWindow()

  if (process.platform === 'linux' || !browserWindow) {
    return dialog.showOpenDialog(options)
  }

  return dialog.showOpenDialog(browserWindow, options)
}

const createAppWindow = (hash: string, options?: AppWindowOptions): BrowserWindow => {
  const appWindow = new BrowserWindow({
    width: options?.width ?? 1000,
    height: options?.height ?? 1000,
    show: false,
    autoHideMenuBar: true,
    title: options?.title ?? APP_DISPLAY_NAME,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    appWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    appWindow.loadURL(buildRendererWindowUrl(hash))
  }

  if (options?.showWhenReady !== false) {
    appWindow.once('ready-to-show', () => {
      appWindow.show()
    })
  }

  return appWindow
}

const createChildWindow = (
  hash: string,
  options?: { width?: number; height?: number; title?: string; interceptClose?: boolean }
): BrowserWindow => {
  const childWindow = createAppWindow(hash, options)

  if (options?.interceptClose) {
    childWindow.on('close', (event) => {
      if (editorWindowsWaitingForCloseConfirmation.has(childWindow.webContents.id)) {
        editorWindowsWaitingForCloseConfirmation.delete(childWindow.webContents.id)
        return
      }

      event.preventDefault()
      childWindow.webContents.send('editor:close-requested')
    })
  }

  return childWindow
}

const createProjectEditorWindow = (
  project: NonNullable<ProjectActionResponse['project']>
): BrowserWindow => {
  const searchParams = new URLSearchParams({
    projectName: project.name,
    projectPath: project.path,
    lastOpenedAt: project.lastOpenedAt
  })

  const projectWindow = createAppWindow(`/project-editor?${searchParams.toString()}`, {
    width: 1440,
    height: 900,
    showWhenReady: false,
    title: `${project.name} - ${APP_DISPLAY_NAME}`
  })

  registerProjectWindow(projectWindow, project.path)
  return projectWindow
}

const scheduleWindowReplacement = (
  currentWindow: BrowserWindow | null,
  nextWindow: BrowserWindow
): void => {
  nextWindow.once('ready-to-show', () => {
    nextWindow.show()

    if (currentWindow && !currentWindow.isDestroyed()) {
      currentWindow.close()
    }
  })
}

const getSenderWindow = (event: IpcMainInvokeEvent): BrowserWindow | null => {
  return BrowserWindow.fromWebContents(event.sender)
}

const closeCurrentProject = async (event: IpcMainInvokeEvent): Promise<boolean> => {
  const currentWindow = getSenderWindow(event)
  const launcherWindow = createAppWindow('/', {
    width: 1080,
    height: 760,
    title: APP_DISPLAY_NAME,
    showWhenReady: false
  })

  scheduleWindowReplacement(currentWindow, launcherWindow)
  return true
}

const openProject = async (
  projectPath: string,
  launcherWindow?: BrowserWindow | null
): Promise<ProjectActionResponse> => {
  try {
    await clearDeletedResourcesForProject(projectPath, 'project open')
    const project = await rememberRecentProject(getRecentProjectsStorePath(), projectPath)
    const projectWindow = createProjectEditorWindow(project)

    scheduleWindowReplacement(launcherWindow ?? null, projectWindow)

    return {
      ok: true,
      canceled: false,
      message: `Opened "${project.name}".`,
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
    title: APP_DISPLAY_NAME,
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
    mainWindow.loadURL(buildRendererWindowUrl('/'))
  }
}

const confirmEditorClose = async (event: IpcMainInvokeEvent): Promise<boolean> => {
  const editorWindow = getSenderWindow(event)

  if (!editorWindow) {
    return false
  }

  editorWindowsWaitingForCloseConfirmation.add(editorWindow.webContents.id)
  editorWindow.close()
  return true
}

const registerIpcHandlers = (): void => {
  registerProjectIpcHandlers({
    getRecentProjectsStorePath,
    showProjectDialog,
    openProject,
    closeCurrentProject,
    getSenderWindow,
    buildProjectActionErrorResponse
  })

  registerEditorIpcHandlers({
    createChildWindow,
    confirmEditorClose
  })

  registerCodeIpcHandlers()
  registerResourceIpcHandlers()
  registerToolchainIpcHandlers()
}

registerIpcHandlers()

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (!is.dev && !process.env['RETROGBFULL_RUNTIME_GBDK_PATH']) {
    process.env['RETROGBFULL_RUNTIME_GBDK_PATH'] = join(app.getPath('userData'), 'gbdk')
  }

  if (!is.dev && !process.env['RETROGBFULL_RUNTIME_MAKE_PATH']) {
    process.env['RETROGBFULL_RUNTIME_MAKE_PATH'] = join(app.getPath('userData'), 'make')
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.retrogbfull.toolkit')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  enableCrossOriginIsolationHeaders()

  if (!is.dev) {
    registerRendererProtocol()
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', (event) => {
  if (hasHandledBeforeQuitCleanup) {
    return
  }

  hasHandledBeforeQuitCleanup = true
  event.preventDefault()

  void clearDeletedResourcesForOpenProjects()
    .finally(() => {
      isQuittingAfterCleanup = true
      app.quit()
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

