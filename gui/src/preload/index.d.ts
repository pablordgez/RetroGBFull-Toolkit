import { ElectronAPI } from '@electron-toolkit/preload'
import { ProjectAssetDocument, ProjectAssetKind } from '../shared/projectAssets'
import type {
  CopyEngineCoreResult,
  GenerateProjectResourceFilesResult,
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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      openSpriteEditorWindow: () => void
      openProjectScriptEditor: (
        projectPath: string,
        resourcePath: string,
        scriptKind: ProjectScriptKind
      ) => Promise<boolean>
      openProjectAssetEditor: (
        assetType: ProjectAssetKind,
        projectPath: string,
        assetPath: string
      ) => Promise<boolean>
      pickProjectParentDirectory: () => Promise<string | null>
      createProject: (parentDirectory: string, projectName: string) => Promise<ProjectActionResponse>
      openProjectFromDialog: () => Promise<ProjectActionResponse>
      loadRecentProject: (projectPath: string) => Promise<ProjectActionResponse>
      closeCurrentProject: () => Promise<boolean>
      openProjectInFileExplorer: (projectPath: string) => Promise<boolean>
      getRecentProjects: () => Promise<RecentProject[]>
      loadProjectAssetFile: (projectPath: string, assetPath: string) => Promise<ProjectAssetFilePayload>
      saveProjectAssetFile: (
        projectPath: string,
        assetPath: string,
        document: ProjectAssetDocument
      ) => Promise<ProjectAssetFilePayload>
      createProjectScriptResource: (
        projectPath: string,
        scriptKind: ProjectScriptKind,
        resourceName?: string
      ) => Promise<ProjectResourceMutationResult>
      loadProjectScriptResource: (
        projectPath: string,
        resourcePath: string,
        scriptKind: ProjectScriptKind
      ) => Promise<ProjectScriptResourcePayload>
      saveProjectScriptResource: (
        projectPath: string,
        resourcePath: string,
        scriptKind: ProjectScriptKind,
        editableSourceContent: string,
        headerContent: string
      ) => Promise<ProjectScriptSavePayload>
      listProjectScriptResources: (
        projectPath: string,
        scriptKind?: ProjectScriptKind
      ) => Promise<ProjectScriptResourceListItem[]>
      listProjectScriptCallbackCandidates: (
        projectPath: string,
        scriptKind?: ProjectScriptKind
      ) => Promise<ProjectScriptCallbackCandidate[]>
      getProjectResources: (projectPath: string, currentPath?: string) => Promise<ProjectResourceView>
      createProjectResource: (
        projectPath: string,
        resourceType: ProjectResourceKind,
        parentPath?: string,
        resourceName?: string
      ) => Promise<ProjectResourceMutationResult>
      renameProjectResource: (
        projectPath: string,
        resourceType: ProjectResourceKind,
        resourcePath: string,
        nextName: string
      ) => Promise<ProjectResourceMutationResult>
      deleteProjectResource: (
        projectPath: string,
        resourceType: ProjectResourceKind,
        resourcePath: string,
        deletionId?: string
      ) => Promise<ProjectDeletedResourceResult>
      transferProjectResource: (
        projectPath: string,
        resourceType: ProjectResourceKind,
        resourcePath: string,
        destinationParentPath?: string,
        mode?: ProjectResourceTransferMode
      ) => Promise<ProjectResourceMutationResult>
      scanProjectDirectory: (projectPath: string) => Promise<ProjectDirectoryScanResult>
      copyProjectEngineCore: (projectPath: string) => Promise<CopyEngineCoreResult>
      readMaxCollisionCallbacks: (projectPath: string) => Promise<number>
      generateProjectResourceFiles: (projectPath: string) => Promise<GenerateProjectResourceFilesResult>
      getProjectCodeSymbolIndex: (projectPath: string) => Promise<ProjectCodeSymbolIndex>
      getProjectCodeWorkspaceSnapshot: (projectPath: string) => Promise<ProjectCodeWorkspaceSnapshot>
      restoreDeletedProjectResource: (
        projectPath: string,
        deletionId: string
      ) => Promise<ProjectResourceMutationResult>
      finalizeDeletedProjectResource: (projectPath: string, deletionId: string) => Promise<boolean>
      createProjectFolder: (projectPath: string, parentPath?: string) => Promise<ProjectResourceMutationResult>
      renameProjectFolder: (
        projectPath: string,
        folderPath: string,
        nextName: string
      ) => Promise<ProjectResourceMutationResult>
      deleteProjectFolder: (projectPath: string, folderPath: string) => Promise<ProjectDeletedResourceResult>
      onEditorCloseRequested: (listener: () => void) => () => void
      onProjectAssetSaved: (
        listener: (payload: ProjectAssetSavedEventPayload) => void
      ) => () => void
      onProjectScriptSaved: (
        listener: (payload: ProjectScriptSavedEventPayload) => void
      ) => () => void
      confirmEditorClose: () => Promise<boolean>
    }
  }
}
