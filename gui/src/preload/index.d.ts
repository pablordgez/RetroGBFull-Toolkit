import { ElectronAPI } from '@electron-toolkit/preload'
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
  ProjectScriptBankingOptions,
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

interface AppPreferences {
  scriptEditorTheme: 'light' | 'dark'
  coordinateUnit: 'gui' | 'core'
  childCoordinateOrigin: 'absolute' | 'relative'
  autoBankScriptFunctions: boolean
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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      openProjectSaveDataEditor: (projectPath: string) => Promise<boolean>
      openProjectTagEditor: (projectPath: string) => Promise<boolean>
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
      createProject: (
        parentDirectory: string,
        projectName: string
      ) => Promise<ProjectActionResponse>
      openProjectFromDialog: () => Promise<ProjectActionResponse>
      loadRecentProject: (projectPath: string) => Promise<ProjectActionResponse>
      closeCurrentProject: () => Promise<boolean>
      openProjectInFileExplorer: (projectPath: string) => Promise<boolean>
      showProjectResourceInFileExplorer: (
        projectPath: string,
        resourcePath: string
      ) => Promise<boolean>
      getRecentProjects: () => Promise<RecentProject[]>
      getAppPreferences: () => Promise<AppPreferences>
      saveAppPreferences: (preferences: Partial<AppPreferences>) => Promise<AppPreferences>
      openDocumentation: () => Promise<boolean>
      getRuntimePlatform: () => Promise<RuntimePlatform>
      getGbdkToolchainStatus: () => Promise<GbdkToolchainStatus>
      installLatestGbdkToolchain: () => Promise<GbdkInstallResult>
      getMakeToolchainStatus: () => Promise<MakeToolchainStatus>
      installLatestMakeToolchain: () => Promise<MakeInstallResult>
      loadProjectSaveData: (projectPath: string) => Promise<ProjectSaveDataState>
      saveProjectSaveData: (
        projectPath: string,
        saveDataState: ProjectSaveDataState
      ) => Promise<ProjectSaveDataState>
      loadProjectTags: (projectPath: string) => Promise<ProjectTagState>
      saveProjectTags: (projectPath: string, tagState: ProjectTagState) => Promise<ProjectTagState>
      loadProjectAssetFile: (
        projectPath: string,
        assetPath: string
      ) => Promise<ProjectAssetFilePayload>
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
        headerContent: string,
        options?: ProjectScriptBankingOptions
      ) => Promise<ProjectScriptSavePayload>
      listProjectScriptResources: (
        projectPath: string,
        scriptKind?: ProjectScriptKind
      ) => Promise<ProjectScriptResourceListItem[]>
      listProjectScriptCallbackCandidates: (
        projectPath: string,
        scriptKind?: ProjectScriptKind
      ) => Promise<ProjectScriptCallbackCandidate[]>
      getProjectResources: (
        projectPath: string,
        currentPath?: string
      ) => Promise<ProjectResourceView>
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
      updateProjectResourceBank: (
        projectPath: string,
        resourceType: ProjectResourceKind,
        resourcePath: string,
        bank: number
      ) => Promise<ProjectResourceMutationResult>
      updateProjectStartingScene: (
        projectPath: string,
        scenePath: string | null
      ) => Promise<ProjectResourceView>
      scanProjectDirectory: (projectPath: string) => Promise<ProjectDirectoryScanResult>
      copyProjectEngineCore: (projectPath: string) => Promise<CopyEngineCoreResult>
      readMaxCollisionCallbacks: (projectPath: string) => Promise<number>
      readMaxTagSlots: (projectPath: string) => Promise<number>
      buildProjectCode: (
        projectPath: string,
        options?: ProjectScriptBankingOptions
      ) => Promise<BuildProjectCodeResult>
      buildAndCompileProject: (
        projectPath: string,
        options?: ProjectScriptBankingOptions
      ) => Promise<BuildAndCompileProjectResult>
      getProjectCodeSymbolIndex: (projectPath: string) => Promise<ProjectCodeSymbolIndex>
      getProjectCodeWorkspaceSnapshot: (
        projectPath: string
      ) => Promise<ProjectCodeWorkspaceSnapshot>
      restoreDeletedProjectResource: (
        projectPath: string,
        deletionId: string
      ) => Promise<ProjectResourceMutationResult>
      finalizeDeletedProjectResource: (projectPath: string, deletionId: string) => Promise<boolean>
      createProjectFolder: (
        projectPath: string,
        parentPath?: string
      ) => Promise<ProjectResourceMutationResult>
      renameProjectFolder: (
        projectPath: string,
        folderPath: string,
        nextName: string
      ) => Promise<ProjectResourceMutationResult>
      deleteProjectFolder: (
        projectPath: string,
        folderPath: string
      ) => Promise<ProjectDeletedResourceResult>
      onEditorCloseRequested: (listener: () => void) => () => void
      onProjectAssetSaved: (
        listener: (payload: ProjectAssetSavedEventPayload) => void
      ) => () => void
      onProjectScriptSaved: (
        listener: (payload: ProjectScriptSavedEventPayload) => void
      ) => () => void
      onProjectTagsSaved: (listener: (payload: ProjectTagsSavedEventPayload) => void) => () => void
      onProjectBuildProgress: (
        listener: (payload: ProjectBuildProgressPayload) => void
      ) => () => void
      confirmEditorClose: () => Promise<boolean>
    }
  }
}
