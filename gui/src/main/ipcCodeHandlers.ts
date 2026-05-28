import { BrowserWindow, ipcMain } from 'electron'
import {
  buildAndCompileProject,
  buildProjectCode,
  copyBundledEngineCore,
  listProjectScriptCallbackCandidates,
  loadProjectScriptResource,
  readMaxCollisionCallbacks,
  readMaxTagSlots,
  saveProjectScriptResource
} from './projectCode'
import {
  getProjectResourceErrorMessage,
  listProjectScriptResources,
  createProjectScriptResource
} from './projectResources'
import { getProjectCodeWorkspaceSnapshot } from './projectCodeLanguageService'
import { getProjectCodeSymbolIndex } from './projectCodeIntelligence'
import { ProjectScriptKind } from '../shared/projectScripts'

interface ProjectScriptSavedEventPayload {
  projectPath: string
  resourcePath: string
  scriptKind: ProjectScriptKind
}

const broadcastToAllWindows = <TPayload>(channel: string, payload: TPayload): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  })
}

export const registerCodeIpcHandlers = (): void => {
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

      broadcastToAllWindows('project:script-saved', {
        projectPath,
        resourcePath,
        scriptKind
      } satisfies ProjectScriptSavedEventPayload)

      return payload
    }
  )

  ipcMain.handle('project:scripts:list', async (_, projectPath: string, scriptKind?: ProjectScriptKind) => {
    const scripts = await listProjectScriptResources(projectPath, scriptKind)
    return scripts.map((script) => ({
      path: script.path,
      name: script.name,
      scriptKind: script.scriptKind
    }))
  })

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

  ipcMain.handle('project:code:build-and-compile', async (event, projectPath: string) => {
    return buildAndCompileProject(projectPath, (payload) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('project:build-progress', payload)
      }
    })
  })

  ipcMain.handle('project:code:symbol-index', async (_, projectPath: string) => {
    return getProjectCodeSymbolIndex(projectPath)
  })

  ipcMain.handle('project:code:workspace-snapshot', async (_, projectPath: string) => {
    return getProjectCodeWorkspaceSnapshot(projectPath)
  })
}
