import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ProjectAssetDocument, ProjectAssetKind } from '../shared/projectAssets'
import type { GbdkInstallResult, GbdkToolchainStatus } from '../shared/projectGbdk'
import type { MakeInstallResult, MakeToolchainStatus } from '../shared/projectMake'
import type { ProjectSaveDataState } from '../shared/projectSaveData'
import type { ProjectTagState } from '../shared/projectTags'
import type { RuntimePlatform } from '../shared/runtimePlatform'
import type {
  BuildAndCompileProjectResult,
  BuildProjectCodeResult,
  CopyEngineCoreResult,
  ProjectBuildProgressPayload,
  ProjectCodeSymbolIndex,
  ProjectCodeWorkspaceSnapshot,
  ProjectScriptCallbackCandidate,
  ProjectScriptResourcePayload,
  ProjectScriptSavePayload
} from '../shared/projectCodeWorkspace'
import type {
  ProjectDeletedResourceResult,
  ProjectDirectoryScanResult,
  ProjectResourceKind,
  ProjectResourceMutationResult,
  ProjectScriptResourceListItem,
  ProjectResourceTransferMode,
  ProjectResourceView
} from '../shared/projectResourceModels'
import type { ProjectScriptKind } from '../shared/projectScripts'

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

interface ProjectAssetFilePayload {
  assetKind: ProjectAssetKind
  resourcePath: string
  document: ProjectAssetDocument
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

// Custom APIs for renderer
const api = {
  openProjectSaveDataEditor: (projectPath: string) =>
    ipcRenderer.invoke('project:save-data:open-editor', projectPath) as Promise<boolean>,
  openProjectTagEditor: (projectPath: string) =>
    ipcRenderer.invoke('project:tags:open-editor', projectPath) as Promise<boolean>,
  openProjectAssetEditor: (assetType: ProjectAssetKind, projectPath: string, assetPath: string) =>
    ipcRenderer.invoke('project:assets:open-editor', assetType, projectPath, assetPath) as Promise<boolean>,
  openProjectScriptEditor: (
    projectPath: string,
    resourcePath: string,
    scriptKind: ProjectScriptKind
  ) =>
    ipcRenderer.invoke(
      'project:scripts:open-editor',
      projectPath,
      resourcePath,
      scriptKind
    ) as Promise<boolean>,
  pickProjectParentDirectory: () => ipcRenderer.invoke('project:pick-create-location') as Promise<string | null>,
  createProject: (parentDirectory: string, projectName: string) =>
    ipcRenderer.invoke('project:create', parentDirectory, projectName) as Promise<ProjectActionResponse>,
  openProjectFromDialog: () => ipcRenderer.invoke('project:open-dialog') as Promise<ProjectActionResponse>,
  loadRecentProject: (projectPath: string) =>
    ipcRenderer.invoke('project:open-recent', projectPath) as Promise<ProjectActionResponse>,
  closeCurrentProject: () => ipcRenderer.invoke('project:close-current') as Promise<boolean>,
  openProjectInFileExplorer: (projectPath: string) =>
    ipcRenderer.invoke('project:open-in-file-explorer', projectPath) as Promise<boolean>,
  showProjectResourceInFileExplorer: (projectPath: string, resourcePath: string) =>
    ipcRenderer.invoke(
      'project:resources:show-in-file-explorer',
      projectPath,
      resourcePath
    ) as Promise<boolean>,
  getRecentProjects: () => ipcRenderer.invoke('project:list-recent') as Promise<RecentProject[]>,
  getRuntimePlatform: () => ipcRenderer.invoke('app:runtime-platform') as Promise<RuntimePlatform>,
  getGbdkToolchainStatus: () => ipcRenderer.invoke('gbdk:status') as Promise<GbdkToolchainStatus>,
  installLatestGbdkToolchain: () =>
    ipcRenderer.invoke('gbdk:install-latest') as Promise<GbdkInstallResult>,
  getMakeToolchainStatus: () => ipcRenderer.invoke('make:status') as Promise<MakeToolchainStatus>,
  installLatestMakeToolchain: () =>
    ipcRenderer.invoke('make:install-latest') as Promise<MakeInstallResult>,
  loadProjectSaveData: (projectPath: string) =>
    ipcRenderer.invoke('project:save-data:load', projectPath) as Promise<ProjectSaveDataState>,
  saveProjectSaveData: (projectPath: string, saveDataState: ProjectSaveDataState) =>
    ipcRenderer.invoke(
      'project:save-data:save',
      projectPath,
      saveDataState
    ) as Promise<ProjectSaveDataState>,
  loadProjectTags: (projectPath: string) =>
    ipcRenderer.invoke('project:tags:load', projectPath) as Promise<ProjectTagState>,
  saveProjectTags: (projectPath: string, tagState: ProjectTagState) =>
    ipcRenderer.invoke('project:tags:save', projectPath, tagState) as Promise<ProjectTagState>,
  loadProjectAssetFile: (projectPath: string, assetPath: string) =>
    ipcRenderer.invoke('project:assets:load', projectPath, assetPath) as Promise<ProjectAssetFilePayload>,
  saveProjectAssetFile: (projectPath: string, assetPath: string, document: ProjectAssetDocument) =>
    ipcRenderer.invoke('project:assets:save', projectPath, assetPath, document) as Promise<ProjectAssetFilePayload>,
  createProjectScriptResource: (
    projectPath: string,
    scriptKind: ProjectScriptKind,
    resourceName?: string
  ) =>
    ipcRenderer.invoke(
      'project:scripts:create',
      projectPath,
      scriptKind,
      resourceName
    ) as Promise<ProjectResourceMutationResult>,
  loadProjectScriptResource: (
    projectPath: string,
    resourcePath: string,
    scriptKind: ProjectScriptKind
  ) =>
    ipcRenderer.invoke(
      'project:scripts:load',
      projectPath,
      resourcePath,
      scriptKind
    ) as Promise<ProjectScriptResourcePayload>,
  saveProjectScriptResource: (
    projectPath: string,
    resourcePath: string,
    scriptKind: ProjectScriptKind,
    editableSourceContent: string,
    headerContent: string
  ) =>
    ipcRenderer.invoke(
      'project:scripts:save',
      projectPath,
      resourcePath,
      scriptKind,
      editableSourceContent,
      headerContent
    ) as Promise<ProjectScriptSavePayload>,
  listProjectScriptResources: (projectPath: string, scriptKind?: ProjectScriptKind) =>
    ipcRenderer.invoke(
      'project:scripts:list',
      projectPath,
      scriptKind
    ) as Promise<ProjectScriptResourceListItem[]>,
  listProjectScriptCallbackCandidates: (projectPath: string, scriptKind?: ProjectScriptKind) =>
    ipcRenderer.invoke(
      'project:scripts:list-callback-candidates',
      projectPath,
      scriptKind
    ) as Promise<ProjectScriptCallbackCandidate[]>,
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
  updateProjectResourceBank: (
    projectPath: string,
    resourceType: ProjectResourceKind,
    resourcePath: string,
    bank: number
  ) =>
    ipcRenderer.invoke(
      'project:resources:update-bank',
      projectPath,
      resourceType,
      resourcePath,
      bank
    ) as Promise<ProjectResourceMutationResult>,
  updateProjectStartingScene: (projectPath: string, scenePath: string | null) =>
    ipcRenderer.invoke(
      'project:resources:update-starting-scene',
      projectPath,
      scenePath
    ) as Promise<ProjectResourceView>,
  scanProjectDirectory: (projectPath: string) =>
    ipcRenderer.invoke('project:resources:scan', projectPath) as Promise<ProjectDirectoryScanResult>,
  copyProjectEngineCore: (projectPath: string) =>
    ipcRenderer.invoke('project:code:copy-engine-core', projectPath) as Promise<CopyEngineCoreResult>,
  readMaxCollisionCallbacks: (projectPath: string) =>
    ipcRenderer.invoke('project:code:read-max-collision-callbacks', projectPath) as Promise<number>,
  readMaxTagSlots: (projectPath: string) =>
    ipcRenderer.invoke('project:code:read-max-tag-slots', projectPath) as Promise<number>,
  buildProjectCode: (projectPath: string) =>
    ipcRenderer.invoke('project:code:build', projectPath) as Promise<BuildProjectCodeResult>,
  buildAndCompileProject: (projectPath: string) =>
    ipcRenderer.invoke('project:code:build-and-compile', projectPath) as Promise<BuildAndCompileProjectResult>,
  getProjectCodeSymbolIndex: (projectPath: string) =>
    ipcRenderer.invoke('project:code:symbol-index', projectPath) as Promise<ProjectCodeSymbolIndex>,
  getProjectCodeWorkspaceSnapshot: (projectPath: string) =>
    ipcRenderer.invoke(
      'project:code:workspace-snapshot',
      projectPath
    ) as Promise<ProjectCodeWorkspaceSnapshot>,
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
  onEditorCloseRequested: (listener: () => void): (() => void) => {
    const wrappedListener = (): void => listener()
    ipcRenderer.on('editor:close-requested', wrappedListener)
    return () => ipcRenderer.removeListener('editor:close-requested', wrappedListener)
  },
  onProjectAssetSaved: (
    listener: (payload: ProjectAssetSavedEventPayload) => void
  ): (() => void) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: ProjectAssetSavedEventPayload
    ): void => listener(payload)
    ipcRenderer.on('project:asset-saved', wrappedListener)
    return () => ipcRenderer.removeListener('project:asset-saved', wrappedListener)
  },
  onProjectScriptSaved: (
    listener: (payload: ProjectScriptSavedEventPayload) => void
  ): (() => void) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: ProjectScriptSavedEventPayload
    ): void => listener(payload)
    ipcRenderer.on('project:script-saved', wrappedListener)
    return () => ipcRenderer.removeListener('project:script-saved', wrappedListener)
  },
  onProjectTagsSaved: (
    listener: (payload: ProjectTagsSavedEventPayload) => void
  ): (() => void) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: ProjectTagsSavedEventPayload
    ): void => listener(payload)
    ipcRenderer.on('project:tags-saved', wrappedListener)
    return () => ipcRenderer.removeListener('project:tags-saved', wrappedListener)
  },
  onProjectBuildProgress: (
    listener: (payload: ProjectBuildProgressPayload) => void
  ): (() => void) => {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      payload: ProjectBuildProgressPayload
    ): void => listener(payload)
    ipcRenderer.on('project:build-progress', wrappedListener)
    return () => ipcRenderer.removeListener('project:build-progress', wrappedListener)
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
