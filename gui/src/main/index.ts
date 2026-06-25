import { app, shell, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, session } from 'electron'
import { createReadStream } from 'fs'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { createServer, type Server, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getProjectLauncherErrorMessage, rememberRecentProject } from './projectLauncher'
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

type ScriptEditorTheme = 'light' | 'dark'
type AppCoordinateUnit = 'gui' | 'core'
type AppChildCoordinateOrigin = 'absolute' | 'relative'

interface AppPreferences {
  scriptEditorTheme: ScriptEditorTheme
  coordinateUnit: AppCoordinateUnit
  childCoordinateOrigin: AppChildCoordinateOrigin
  autoBankScriptFunctions: boolean
}

const APP_DISPLAY_NAME = 'RetroGBFull-Toolkit'
const APP_USER_DATA_DIRECTORY = 'retrogbfull-toolkit'
const DEFAULT_APP_PREFERENCES: AppPreferences = {
  scriptEditorTheme: 'light',
  coordinateUnit: 'gui',
  childCoordinateOrigin: 'relative',
  autoBankScriptFunctions: true
}
const CROSS_ORIGIN_RESPONSE_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1'
}
const CROSS_ORIGIN_WEB_REQUEST_HEADERS = {
  'Cross-Origin-Opener-Policy': ['same-origin'],
  'Cross-Origin-Embedder-Policy': ['require-corp'],
  'Cross-Origin-Resource-Policy': ['same-origin'],
  'Origin-Agent-Cluster': ['?1']
}
const RENDERER_CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}
const shouldDisableChromiumSandbox =
  process.platform === 'linux' &&
  !is.dev &&
  process.env['RETROGBFULL_ENABLE_CHROMIUM_SANDBOX'] !== '1'

const editorWindowsWaitingForCloseConfirmation = new Set<number>()
const projectWindowPaths = new Map<number, string>()
const projectWindowsWaitingForCleanup = new Set<number>()
const projectWindowsReadyToClose = new Set<number>()
let packagedRendererServer: Server | null = null
let packagedRendererServerOrigin: string | null = null
let isQuittingAfterCleanup = false
let hasHandledBeforeQuitCleanup = false

if (shouldDisableChromiumSandbox) {
  app.commandLine.appendSwitch('no-sandbox')
}

app.setName(APP_DISPLAY_NAME)
app.setPath('userData', join(app.getPath('appData'), APP_USER_DATA_DIRECTORY))

const getPackagedRendererRoot = (): string => {
  return resolve(__dirname, '../renderer')
}

const getExternalDevRendererUrl = (): string | null => {
  return is.dev ? (process.env['ELECTRON_RENDERER_URL'] ?? null) : null
}

const buildRendererWindowUrl = (hash = ''): string => {
  if (!packagedRendererServerOrigin) {
    throw new Error('Packaged renderer server has not started.')
  }

  const normalizedHash = hash.startsWith('/') ? hash : `/${hash}`
  return `${packagedRendererServerOrigin}/index.html#${normalizedHash}`
}

const resolvePackagedRendererFilePath = (pathname: string): string | null => {
  let decodedPath: string

  try {
    decodedPath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
  } catch {
    return null
  }

  const rendererRoot = getPackagedRendererRoot()
  const normalizedPath = normalize(decodedPath).replace(/^([\\/])+/, '')
  const absolutePath = resolve(rendererRoot, normalizedPath)
  const relativePath = relative(rendererRoot, absolutePath)

  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null
  }

  return absolutePath
}

const sendPackagedRendererFile = async (
  response: ServerResponse,
  filePath: string | null
): Promise<void> => {
  if (!filePath) {
    response.writeHead(404, CROSS_ORIGIN_RESPONSE_HEADERS)
    response.end('Not found')
    return
  }

  try {
    const fileStats = await stat(filePath)

    if (!fileStats.isFile()) {
      throw new Error('Renderer asset path is not a file.')
    }

    response.writeHead(200, {
      ...CROSS_ORIGIN_RESPONSE_HEADERS,
      'Content-Length': fileStats.size,
      'Content-Type':
        RENDERER_CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    })

    createReadStream(filePath)
      .on('error', () => {
        if (!response.headersSent) {
          response.writeHead(500, CROSS_ORIGIN_RESPONSE_HEADERS)
        }

        response.end('Failed to read renderer asset.')
      })
      .pipe(response)
  } catch {
    response.writeHead(404, CROSS_ORIGIN_RESPONSE_HEADERS)
    response.end('Not found')
  }
}

const startPackagedRendererServer = async (): Promise<void> => {
  if (packagedRendererServerOrigin) {
    return
  }

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    void sendPackagedRendererFile(response, resolvePackagedRendererFilePath(requestUrl.pathname))
  })

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const handleError = (error: Error): void => {
      rejectPromise(error)
    }

    server.once('error', handleError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', handleError)
      const address = server.address() as AddressInfo
      packagedRendererServerOrigin = `http://127.0.0.1:${address.port}`
      packagedRendererServer = server
      resolvePromise()
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

const enableDevToolsShortcuts = (window: BrowserWindow): void => {
  window.webContents.on('before-input-event', (event, input) => {
    const isToggleDevToolsShortcut =
      input.type === 'keyDown' &&
      (input.key === 'F12' ||
        ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i'))

    if (!isToggleDevToolsShortcut) {
      return
    }

    event.preventDefault()
    window.webContents.toggleDevTools()
  })
}

const clearDeletedResourcesForProject = async (
  projectPath: string,
  reason: string
): Promise<void> => {
  try {
    await clearDeletedProjectResources(projectPath)
  } catch (error) {
    console.error(`[project-resources] failed to clear deleted resources during ${reason}`, error)
  }
}

const clearDeletedResourcesForOpenProjects = async (): Promise<void> => {
  const projectPaths = [...new Set(projectWindowPaths.values())]
  await Promise.all(
    projectPaths.map((projectPath) =>
      clearDeletedResourcesForProject(projectPath, 'application shutdown')
    )
  )
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

    const hasCloseConfirmation = editorWindowsWaitingForCloseConfirmation.has(windowId)
    if (hasCloseConfirmation) {
      editorWindowsWaitingForCloseConfirmation.delete(windowId)
    }

    if (!hasCloseConfirmation) {
      event.preventDefault()
      projectWindow.webContents.send('editor:close-requested')
      return
    }

    if (projectWindowsWaitingForCleanup.has(windowId)) {
      event.preventDefault()
      return
    }

    event.preventDefault()
    projectWindowsWaitingForCleanup.add(windowId)

    void clearDeletedResourcesForProject(projectPath, 'project window close').finally(() => {
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

const getAppPreferencesStorePath = (): string => {
  return join(app.getPath('userData'), 'app-preferences.json')
}

const isScriptEditorTheme = (value: unknown): value is ScriptEditorTheme => {
  return value === 'light' || value === 'dark'
}

const isAppCoordinateUnit = (value: unknown): value is AppCoordinateUnit => {
  return value === 'gui' || value === 'core'
}

const isAppChildCoordinateOrigin = (value: unknown): value is AppChildCoordinateOrigin => {
  return value === 'absolute' || value === 'relative'
}

const isBooleanPreference = (value: unknown): value is boolean => {
  return typeof value === 'boolean'
}

const readAppPreferences = async (): Promise<AppPreferences> => {
  try {
    const rawContent = await readFile(getAppPreferencesStorePath(), 'utf-8')
    const parsedPreferences = JSON.parse(rawContent) as Partial<AppPreferences>

    return {
      scriptEditorTheme: isScriptEditorTheme(parsedPreferences.scriptEditorTheme)
        ? parsedPreferences.scriptEditorTheme
        : DEFAULT_APP_PREFERENCES.scriptEditorTheme,
      coordinateUnit: isAppCoordinateUnit(parsedPreferences.coordinateUnit)
        ? parsedPreferences.coordinateUnit
        : DEFAULT_APP_PREFERENCES.coordinateUnit,
      childCoordinateOrigin: isAppChildCoordinateOrigin(parsedPreferences.childCoordinateOrigin)
        ? parsedPreferences.childCoordinateOrigin
        : DEFAULT_APP_PREFERENCES.childCoordinateOrigin,
      autoBankScriptFunctions: isBooleanPreference(parsedPreferences.autoBankScriptFunctions)
        ? parsedPreferences.autoBankScriptFunctions
        : DEFAULT_APP_PREFERENCES.autoBankScriptFunctions
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[app-preferences] failed to read preferences, using defaults', error)
    }

    return DEFAULT_APP_PREFERENCES
  }
}

const saveAppPreferences = async (
  preferences: Partial<AppPreferences>
): Promise<AppPreferences> => {
  const currentPreferences = await readAppPreferences()
  const nextPreferences: AppPreferences = {
    ...currentPreferences,
    scriptEditorTheme: isScriptEditorTheme(preferences.scriptEditorTheme)
      ? preferences.scriptEditorTheme
      : currentPreferences.scriptEditorTheme,
    coordinateUnit: isAppCoordinateUnit(preferences.coordinateUnit)
      ? preferences.coordinateUnit
      : currentPreferences.coordinateUnit,
    childCoordinateOrigin: isAppChildCoordinateOrigin(preferences.childCoordinateOrigin)
      ? preferences.childCoordinateOrigin
      : currentPreferences.childCoordinateOrigin,
    autoBankScriptFunctions: isBooleanPreference(preferences.autoBankScriptFunctions)
      ? preferences.autoBankScriptFunctions
      : currentPreferences.autoBankScriptFunctions
  }
  const storePath = getAppPreferencesStorePath()

  await mkdir(dirname(storePath), { recursive: true })
  await writeFile(storePath, `${JSON.stringify(nextPreferences, null, 2)}\n`, 'utf-8')
  return nextPreferences
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

  const externalDevRendererUrl = getExternalDevRendererUrl()

  if (externalDevRendererUrl) {
    appWindow.loadURL(`${externalDevRendererUrl}#${hash}`)
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
      if (projectWindowPaths.has(currentWindow.webContents.id)) {
        editorWindowsWaitingForCloseConfirmation.add(currentWindow.webContents.id)
      }

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
  const externalDevRendererUrl = getExternalDevRendererUrl()

  if (externalDevRendererUrl) {
    mainWindow.loadURL(externalDevRendererUrl)
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
  ipcMain.handle('app:preferences:get', async () => {
    return readAppPreferences()
  })

  ipcMain.handle('app:preferences:save', async (_, preferences: Partial<AppPreferences>) => {
    return saveAppPreferences(preferences)
  })

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
app.whenReady().then(async () => {
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
    enableDevToolsShortcuts(window)
  })

  enableCrossOriginIsolationHeaders()

  if (!getExternalDevRendererUrl()) {
    await startPackagedRendererServer()
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

  void clearDeletedResourcesForOpenProjects().finally(() => {
    isQuittingAfterCleanup = true
    packagedRendererServer?.close()
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
