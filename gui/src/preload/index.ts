import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ProjectAssetDocument, ProjectAssetKind } from '../shared/projectAssets'

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

interface ProjectResourceItem {
  type: 'folder' | 'file'
  name: string
  fileName?: string
  path: string
  parentPath?: string | null
  id?: string
  extension?: string | null
  resourceType?: ProjectAssetKind | null
}

interface ProjectResourceView {
  projectName: string
  projectPath: string
  currentPath: string
  parentPath: string | null
  items: ProjectResourceItem[]
}

type ProjectResourceKind = 'folder' | ProjectAssetKind | 'script'
type ProjectResourceTransferMode = 'copy' | 'move'

interface ProjectResourceMutationResult {
  view: ProjectResourceView
  resourceType: ProjectResourceKind
  resourcePath: string
  resourceName: string
  parentPath: string
}

interface ProjectDeletedResourceResult extends ProjectResourceMutationResult {
  deletionId: string
}

interface ProjectAssetFilePayload {
  assetKind: ProjectAssetKind
  resourcePath: string
  document: ProjectAssetDocument
}

interface ProjectDirectoryScanResult {
  trackedCount: number
  removedCount: number
}

// Custom APIs for renderer
const api = {
  openSpriteEditorWindow: () => ipcRenderer.send('open-sprite-editor-window'),
  openProjectAssetEditor: (assetType: ProjectAssetKind, projectPath: string, assetPath: string) =>
    ipcRenderer.invoke('project:assets:open-editor', assetType, projectPath, assetPath) as Promise<boolean>,
  pickProjectParentDirectory: () => ipcRenderer.invoke('project:pick-create-location') as Promise<string | null>,
  createProject: (parentDirectory: string, projectName: string) =>
    ipcRenderer.invoke('project:create', parentDirectory, projectName) as Promise<ProjectActionResponse>,
  openProjectFromDialog: () => ipcRenderer.invoke('project:open-dialog') as Promise<ProjectActionResponse>,
  loadRecentProject: (projectPath: string) =>
    ipcRenderer.invoke('project:open-recent', projectPath) as Promise<ProjectActionResponse>,
  closeCurrentProject: () => ipcRenderer.invoke('project:close-current') as Promise<boolean>,
  openProjectInFileExplorer: (projectPath: string) =>
    ipcRenderer.invoke('project:open-in-file-explorer', projectPath) as Promise<boolean>,
  getRecentProjects: () => ipcRenderer.invoke('project:list-recent') as Promise<RecentProject[]>,
  loadProjectAssetFile: (projectPath: string, assetPath: string) =>
    ipcRenderer.invoke('project:assets:load', projectPath, assetPath) as Promise<ProjectAssetFilePayload>,
  saveProjectAssetFile: (projectPath: string, assetPath: string, document: ProjectAssetDocument) =>
    ipcRenderer.invoke('project:assets:save', projectPath, assetPath, document) as Promise<ProjectAssetFilePayload>,
  getProjectResources: (projectPath: string, currentPath = '') =>
    ipcRenderer.invoke('project:resources:list', projectPath, currentPath) as Promise<ProjectResourceView>,
  createProjectResource: (
    projectPath: string,
    resourceType: ProjectResourceKind,
    parentPath = '',
    resourceName?: string
  ) =>
    ipcRenderer.invoke(
      'project:resources:create',
      projectPath,
      resourceType,
      parentPath,
      resourceName
    ) as Promise<ProjectResourceMutationResult>,
  renameProjectResource: (
    projectPath: string,
    resourceType: ProjectResourceKind,
    resourcePath: string,
    nextName: string
  ) =>
    ipcRenderer.invoke(
      'project:resources:rename',
      projectPath,
      resourceType,
      resourcePath,
      nextName
    ) as Promise<ProjectResourceMutationResult>,
  deleteProjectResource: (
    projectPath: string,
    resourceType: ProjectResourceKind,
    resourcePath: string,
    deletionId?: string
  ) =>
    ipcRenderer.invoke(
      'project:resources:delete',
      projectPath,
      resourceType,
      resourcePath,
      deletionId
    ) as Promise<ProjectDeletedResourceResult>,
  transferProjectResource: (
    projectPath: string,
    resourceType: ProjectResourceKind,
    resourcePath: string,
    destinationParentPath = '',
    mode: ProjectResourceTransferMode = 'copy'
  ) =>
    ipcRenderer.invoke(
      'project:resources:transfer',
      projectPath,
      resourceType,
      resourcePath,
      destinationParentPath,
      mode
    ) as Promise<ProjectResourceMutationResult>,
  scanProjectDirectory: (projectPath: string) =>
    ipcRenderer.invoke('project:resources:scan', projectPath) as Promise<ProjectDirectoryScanResult>,
  restoreDeletedProjectResource: (projectPath: string, deletionId: string) =>
    ipcRenderer.invoke(
      'project:resources:restore-deleted',
      projectPath,
      deletionId
    ) as Promise<ProjectResourceMutationResult>,
  finalizeDeletedProjectResource: (projectPath: string, deletionId: string) =>
    ipcRenderer.invoke('project:resources:finalize-deleted', projectPath, deletionId) as Promise<boolean>,
  createProjectFolder: (projectPath: string, parentPath = '') =>
    ipcRenderer.invoke(
      'project:resources:create-folder',
      projectPath,
      parentPath
    ) as Promise<ProjectResourceMutationResult>,
  renameProjectFolder: (projectPath: string, folderPath: string, nextName: string) =>
    ipcRenderer.invoke(
      'project:resources:rename-folder',
      projectPath,
      folderPath,
      nextName
    ) as Promise<ProjectResourceMutationResult>,
  deleteProjectFolder: (projectPath: string, folderPath: string) =>
    ipcRenderer.invoke('project:resources:delete-folder', projectPath, folderPath) as Promise<ProjectDeletedResourceResult>,
  onEditorCloseRequested: (listener: () => void) => {
    const wrappedListener = () => listener()
    ipcRenderer.on('editor:close-requested', wrappedListener)
    return () => ipcRenderer.removeListener('editor:close-requested', wrappedListener)
  },
  confirmEditorClose: () => ipcRenderer.invoke('editor:confirm-close') as Promise<boolean>
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
