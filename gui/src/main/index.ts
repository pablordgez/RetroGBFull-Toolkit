import {
  app,
  shell,
  BrowserWindow,
  dialog,
  ipcMain,
  IpcMainInvokeEvent,
  net,
  protocol,
  session
} from 'electron'
import { basename, join, normalize, resolve } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  createProjectStructure,
  getProjectLauncherErrorMessage,
  listRecentProjects,
  rememberRecentProject,
  validateProjectDirectory
} from './projectLauncher'
import {
  clearDeletedProjectResources,
  createProjectFolder,
  createProjectResource,
  deleteProjectFolder,
  deleteProjectResource,
  finalizeDeletedProjectResource,
  getProjectResourceErrorMessage,
  listProjectScriptResources,
  listProjectResources,
  createProjectScriptResource,
  renameProjectFolder,
  renameProjectResource,
  scanProjectDirectory,
  restoreDeletedProjectResource,
  transferProjectResource,
  updateProjectResourceBank,
  updateProjectStartingScene
} from './projectResources'
import { ensureProjectAssetFileAvailable, loadProjectAssetFile, saveProjectAssetFile } from './projectAssetFiles'
import {
  loadProjectSaveDataState,
  loadProjectTagState,
  saveProjectSaveDataState,
  saveProjectTagState
} from './projectMetadata'
import { PROJECT_ASSET_LABELS, ProjectAssetKind } from '../shared/projectAssets'
import {
  buildProjectCode,
  copyBundledEngineCore,
  listProjectScriptCallbackCandidates,
  loadProjectScriptResource,
  readMaxCollisionCallbacks,
  readMaxTagSlots,
  saveProjectScriptResource
} from './projectCode'
import { getGbdkToolchainStatus, installLatestGbdkToolchain } from './projectGbdk'
import { getProjectCodeWorkspaceSnapshot } from './projectCodeLanguageService'
import { getProjectCodeSymbolIndex } from './projectCodeIntelligence'
import { PROJECT_SCRIPT_LABELS, ProjectScriptKind, getProjectScriptDisplayName } from '../shared/projectScripts'

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

interface ProjectAssetSavedEventPayload {
  projectPath: string
  assetPath: string
  assetKind: ProjectAssetKind
}

interface ProjectScriptSavedEventPayload {
  projectPath: string
  resourcePath: string
  scriptKind: ProjectScriptKind
}

interface ProjectTagsSavedEventPayload {
  projectPath: string
}

const ELECTRON_APP_SCHEME = 'app'
const CROSS_ORIGIN_RESPONSE_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}
const CROSS_ORIGIN_WEB_REQUEST_HEADERS = {
  'Cross-Origin-Opener-Policy': ['same-origin'],
  'Cross-Origin-Embedder-Policy': ['require-corp']
}

const editorWindowsWaitingForCloseConfirmation = new Set<number>()
const projectWindowPaths = new Map<number, string>()
const projectWindowsWaitingForCleanup = new Set<number>()
const projectWindowsReadyToClose = new Set<number>()
let isQuittingAfterCleanup = false
let hasHandledBeforeQuitCleanup = false

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
    title: options?.title,
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
    title: `${project.name} - RetroGBFull Toolkit`
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
    title: 'RetroGBFull Toolkit',
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (!is.dev && !process.env['RETROGBFULL_RUNTIME_GBDK_PATH']) {
    process.env['RETROGBFULL_RUNTIME_GBDK_PATH'] = join(app.getPath('userData'), 'gbdk')
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

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
  const validation = await validateProjectDirectory(projectPath)

  if (!validation.isValid) {
    throw new Error(validation.message ?? 'The selected project could not be loaded.')
  }

  const openResult = await shell.openPath(validation.path)

  if (openResult) {
    throw new Error(openResult)
  }

  return true
})

ipcMain.handle('project:assets:open-editor', async (_, assetType: ProjectAssetKind, projectPath: string, assetPath: string) => {
  await ensureProjectAssetFileAvailable(projectPath, assetPath)

  const searchParams = new URLSearchParams({
    projectPath,
    assetPath
  })

  createChildWindow(`/${assetType}-editor?${searchParams.toString()}`, {
    width: 1440,
    height: 900,
    title: `${PROJECT_ASSET_LABELS[assetType]} Editor`,
    interceptClose: true
  })

  return true
})

ipcMain.handle(
  'project:scripts:open-editor',
  async (_, projectPath: string, resourcePath: string, scriptKind: ProjectScriptKind) => {
    const scriptName = getProjectScriptDisplayName(basename(resourcePath))
    const searchParams = new URLSearchParams({
      projectPath,
      resourcePath,
      scriptKind
    })

    createChildWindow(`/script-editor?${searchParams.toString()}`, {
      width: 1440,
      height: 900,
      title: `${PROJECT_SCRIPT_LABELS[scriptKind]} - ${scriptName}`,
      interceptClose: true
    })

    return true
  }
)

ipcMain.handle('project:save-data:open-editor', async (_, projectPath: string) => {
  const searchParams = new URLSearchParams({
    projectPath
  })

  createChildWindow(`/save-data-editor?${searchParams.toString()}`, {
    width: 1200,
    height: 860,
    title: 'Save Data Editor',
    interceptClose: true
  })

  return true
})

ipcMain.handle('project:tags:open-editor', async (_, projectPath: string) => {
  const searchParams = new URLSearchParams({
    projectPath
  })

  createChildWindow(`/tag-editor?${searchParams.toString()}`, {
    width: 1200,
    height: 860,
    title: 'Tag Editor',
    interceptClose: true
  })

  return true
})

ipcMain.handle('project:assets:load', async (_, projectPath: string, assetPath: string) => {
  return loadProjectAssetFile(projectPath, assetPath)
})

ipcMain.handle('project:assets:save', async (_, projectPath: string, assetPath: string, document) => {
  const payload = await saveProjectAssetFile(projectPath, assetPath, document)

  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('project:asset-saved', {
        projectPath,
        assetPath,
        assetKind: payload.assetKind
      } satisfies ProjectAssetSavedEventPayload)
    }
  })

  return payload
})

ipcMain.handle(
  'project:save-data:load',
  async (_, projectPath: string) => {
    return loadProjectSaveDataState(projectPath)
  }
)

ipcMain.handle(
  'project:save-data:save',
  async (_, projectPath: string, saveDataState) => {
    return saveProjectSaveDataState(projectPath, saveDataState)
  }
)

ipcMain.handle('project:tags:load', async (_, projectPath: string) => {
  return loadProjectTagState(projectPath)
})

ipcMain.handle('project:tags:save', async (_, projectPath: string, tagState) => {
  const payload = await saveProjectTagState(projectPath, tagState)

  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('project:tags-saved', {
        projectPath
      } satisfies ProjectTagsSavedEventPayload)
    }
  })

  return payload
})

ipcMain.handle(
  'project:scripts:create',
  async (_, projectPath: string, scriptKind: ProjectScriptKind, resourceName?: string) => {
    try {
      return await createProjectScriptResource(projectPath, scriptKind, resourceName)
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'create'))
    }
  }
)

ipcMain.handle(
  'project:scripts:load',
  async (_, projectPath: string, resourcePath: string, scriptKind: ProjectScriptKind) => {
    return loadProjectScriptResource(projectPath, resourcePath, scriptKind)
  }
)

ipcMain.handle(
  'project:scripts:save',
  async (
    _,
    projectPath: string,
    resourcePath: string,
    scriptKind: ProjectScriptKind,
    editableSourceContent: string,
    headerContent: string
  ) => {
    const payload = await saveProjectScriptResource(
      projectPath,
      resourcePath,
      scriptKind,
      editableSourceContent,
      headerContent
    )

    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send('project:script-saved', {
          projectPath,
          resourcePath,
          scriptKind
        } satisfies ProjectScriptSavedEventPayload)
      }
    })

    return payload
  }
)

ipcMain.handle(
  'project:scripts:list',
  async (_, projectPath: string, scriptKind?: ProjectScriptKind) => {
    const scripts = await listProjectScriptResources(projectPath, scriptKind)
    return scripts.map((script) => ({
      path: script.path,
      name: script.name,
      scriptKind: script.scriptKind
    }))
  }
)

ipcMain.handle(
  'project:scripts:list-callback-candidates',
  async (_, projectPath: string, scriptKind?: ProjectScriptKind) => {
    const scripts = await listProjectScriptResources(projectPath, scriptKind)
    return listProjectScriptCallbackCandidates(projectPath, scripts)
  }
)

ipcMain.handle('project:code:copy-engine-core', async (_, projectPath: string) => {
  return copyBundledEngineCore(projectPath)
})

ipcMain.handle('project:code:read-max-collision-callbacks', async (_, projectPath: string) => {
  return readMaxCollisionCallbacks(projectPath)
})

ipcMain.handle('project:code:read-max-tag-slots', async (_, projectPath: string) => {
  return readMaxTagSlots(projectPath)
})

ipcMain.handle('project:code:build', async (_, projectPath: string) => {
  return buildProjectCode(projectPath)
})

ipcMain.handle('project:code:symbol-index', async (_, projectPath: string) => {
  return getProjectCodeSymbolIndex(projectPath)
})

ipcMain.handle('project:code:workspace-snapshot', async (_, projectPath: string) => {
  return getProjectCodeWorkspaceSnapshot(projectPath)
})

ipcMain.handle('gbdk:status', async () => {
  return getGbdkToolchainStatus()
})

ipcMain.handle('gbdk:install-latest', async () => {
  return installLatestGbdkToolchain()
})

ipcMain.handle('editor:confirm-close', async (event) => {
  const editorWindow = getSenderWindow(event)

  if (!editorWindow) {
    return false
  }

  editorWindowsWaitingForCloseConfirmation.add(editorWindow.webContents.id)
  editorWindow.close()
  return true
})

ipcMain.handle('project:resources:list', async (_, projectPath: string, currentPath?: string) => {
  try {
    return await listProjectResources(projectPath, currentPath)
  } catch (error) {
    throw new Error(getProjectResourceErrorMessage(error, 'load'))
  }
})

ipcMain.handle('project:resources:create-folder', async (_, projectPath: string, parentPath?: string) => {
  try {
    return await createProjectFolder(projectPath, parentPath)
  } catch (error) {
    throw new Error(getProjectResourceErrorMessage(error, 'create'))
  }
})

ipcMain.handle(
  'project:resources:create',
  async (_, projectPath: string, resourceType: string, parentPath?: string, resourceName?: string) => {
    try {
      return await createProjectResource(
        projectPath,
        resourceType as Parameters<typeof createProjectResource>[1],
        parentPath,
        resourceName
      )
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'create'))
    }
  }
)

ipcMain.handle(
  'project:resources:rename-folder',
  async (_, projectPath: string, folderPath: string, nextName: string) => {
    try {
      return await renameProjectFolder(projectPath, folderPath, nextName)
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'rename'))
    }
  }
)

ipcMain.handle(
  'project:resources:rename',
  async (_, projectPath: string, resourceType: string, resourcePath: string, nextName: string) => {
    try {
      return await renameProjectResource(
        projectPath,
        resourceType as Parameters<typeof renameProjectResource>[1],
        resourcePath,
        nextName
      )
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'rename'))
    }
  }
)

ipcMain.handle('project:resources:delete-folder', async (_, projectPath: string, folderPath: string) => {
  try {
    return await deleteProjectFolder(projectPath, folderPath)
  } catch (error) {
    throw new Error(getProjectResourceErrorMessage(error, 'delete'))
  }
})

ipcMain.handle(
  'project:resources:delete',
  async (_, projectPath: string, resourceType: string, resourcePath: string, deletionId?: string) => {
    try {
      return await deleteProjectResource(
        projectPath,
        resourceType as Parameters<typeof deleteProjectResource>[1],
        resourcePath,
        deletionId
      )
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'delete'))
    }
  }
)

ipcMain.handle(
  'project:resources:transfer',
  async (
    _,
    projectPath: string,
    resourceType: string,
    resourcePath: string,
    destinationParentPath?: string,
    mode?: string
  ) => {
    try {
      return await transferProjectResource(
        projectPath,
        resourceType as Parameters<typeof transferProjectResource>[1],
        resourcePath,
        destinationParentPath,
        mode as Parameters<typeof transferProjectResource>[4]
      )
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'paste'))
    }
  }
)

ipcMain.handle(
  'project:resources:update-bank',
  async (_, projectPath: string, resourceType: string, resourcePath: string, bank: number) => {
    try {
      return await updateProjectResourceBank(
        projectPath,
        resourceType as Parameters<typeof updateProjectResourceBank>[1],
        resourcePath,
        bank
      )
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'bank'))
    }
  }
)

ipcMain.handle(
  'project:resources:update-starting-scene',
  async (_, projectPath: string, scenePath: string | null) => {
    try {
      return await updateProjectStartingScene(projectPath, scenePath)
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'create'))
    }
  }
)

ipcMain.handle('project:resources:scan', async (_, projectPath: string) => {
  try {
    return await scanProjectDirectory(projectPath)
  } catch (error) {
    throw new Error(getProjectResourceErrorMessage(error, 'load'))
  }
})

ipcMain.handle(
  'project:resources:restore-deleted',
  async (_, projectPath: string, deletionId: string) => {
    try {
      return await restoreDeletedProjectResource(projectPath, deletionId)
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'create'))
    }
  }
)

ipcMain.handle(
  'project:resources:finalize-deleted',
  async (_, projectPath: string, deletionId: string) => {
    try {
      await finalizeDeletedProjectResource(projectPath, deletionId)
      return true
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'delete'))
    }
  }
)

