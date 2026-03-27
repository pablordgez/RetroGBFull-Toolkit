import { ElectronAPI } from '@electron-toolkit/preload'
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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      openSpriteEditorWindow: () => void
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
      confirmEditorClose: () => Promise<boolean>
    }
  }
}
