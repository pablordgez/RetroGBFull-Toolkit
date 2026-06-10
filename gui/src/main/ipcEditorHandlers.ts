import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron'
import { basename } from 'path'
import { loadProjectAssetFile, saveProjectAssetFile } from './projectAssetFiles'
import {
  loadProjectSaveDataState,
  loadProjectTagState,
  saveProjectSaveDataState,
  saveProjectTagState
} from './projectMetadata'
import { PROJECT_ASSET_LABELS, ProjectAssetKind } from '../shared/projectAssets'
import { PROJECT_SCRIPT_LABELS, ProjectScriptKind, getProjectScriptDisplayName } from '../shared/projectScripts'

interface ProjectAssetSavedEventPayload {
  projectPath: string
  assetPath: string
  assetKind: ProjectAssetKind
}

interface ProjectTagsSavedEventPayload {
  projectPath: string
}

interface CreateChildWindowOptions {
  width?: number
  height?: number
  title?: string
  interceptClose?: boolean
}

interface RegisterEditorIpcHandlersOptions {
  createChildWindow: (hash: string, options?: CreateChildWindowOptions) => BrowserWindow
  confirmEditorClose: (event: IpcMainInvokeEvent) => Promise<boolean>
}

const broadcastToAllWindows = <TPayload>(channel: string, payload: TPayload): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  })
}

export const registerEditorIpcHandlers = ({
  createChildWindow,
  confirmEditorClose
}: RegisterEditorIpcHandlersOptions): void => {
  ipcMain.handle(
    'project:assets:open-editor',
    async (_, assetType: ProjectAssetKind, projectPath: string, assetPath: string) => {
      // Validate and parse asset before opening the editor so errors surface in the main workspace.
      await loadProjectAssetFile(projectPath, assetPath)

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
    }
  )

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

    broadcastToAllWindows('project:asset-saved', {
      projectPath,
      assetPath,
      assetKind: payload.assetKind
    } satisfies ProjectAssetSavedEventPayload)

    return payload
  })

  ipcMain.handle('project:save-data:load', async (_, projectPath: string) => {
    return loadProjectSaveDataState(projectPath)
  })

  ipcMain.handle('project:save-data:save', async (_, projectPath: string, saveDataState) => {
    return saveProjectSaveDataState(projectPath, saveDataState)
  })

  ipcMain.handle('project:tags:load', async (_, projectPath: string) => {
    return loadProjectTagState(projectPath)
  })

  ipcMain.handle('project:tags:save', async (_, projectPath: string, tagState) => {
    const payload = await saveProjectTagState(projectPath, tagState)

    broadcastToAllWindows('project:tags-saved', {
      projectPath
    } satisfies ProjectTagsSavedEventPayload)

    return payload
  })

  ipcMain.handle('editor:confirm-close', async (event) => {
    return confirmEditorClose(event)
  })
}
