import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

interface RecentProject {
  name: string
  path: string
  lastOpenedAt: string
}

interface ProjectActionResponse {
  ok: boolean
  canceled: boolean
  message: string
  project?: RecentProject
}

// Custom APIs for renderer
const api = {
  openSpriteEditorWindow: () => ipcRenderer.send('open-sprite-editor-window'),
  pickProjectParentDirectory: () => ipcRenderer.invoke('project:pick-create-location') as Promise<string | null>,
  createProject: (parentDirectory: string, projectName: string) =>
    ipcRenderer.invoke('project:create', parentDirectory, projectName) as Promise<ProjectActionResponse>,
  openProjectFromDialog: () => ipcRenderer.invoke('project:open-dialog') as Promise<ProjectActionResponse>,
  loadRecentProject: (projectPath: string) =>
    ipcRenderer.invoke('project:open-recent', projectPath) as Promise<ProjectActionResponse>,
  getRecentProjects: () => ipcRenderer.invoke('project:list-recent') as Promise<RecentProject[]>
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
