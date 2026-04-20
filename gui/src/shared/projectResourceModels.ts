import type { ProjectAssetKind } from './projectAssets'
import type { ProjectScriptKind } from './projectScripts'

export const DEFAULT_PROJECT_RESOURCE_BANK = 255

export interface ProjectResourceFolderItem {
  type: 'folder'
  id: string
  name: string
  path: string
  parentPath: string | null
}

export interface ProjectResourceFileItem {
  type: 'file'
  id: string
  name: string
  fileName: string
  path: string
  parentPath: string | null
  extension: string | null
  resourceType: ProjectAssetKind | null
  bank?: number | null
  scriptKind?: ProjectScriptKind | null
}

export type ProjectResourceItem = ProjectResourceFolderItem | ProjectResourceFileItem
export type ProjectResourceKind = 'folder' | ProjectAssetKind | 'script'
export type ProjectTrackableResourceKind = 'folder' | ProjectAssetKind | 'script'
export type ProjectResourceTransferMode = 'copy' | 'move'

export interface ProjectResourceView {
  projectName: string
  projectPath: string
  currentPath: string
  parentPath: string | null
  startingScenePath?: string | null
  items: ProjectResourceItem[]
}

export interface ProjectResourceMutationResult {
  view: ProjectResourceView
  resourceType: ProjectResourceKind
  resourcePath: string
  resourceName: string
  parentPath: string
  bank?: number | null
  scriptKind?: ProjectScriptKind | null
}

export interface ProjectDeletedResourceResult extends ProjectResourceMutationResult {
  deletionId: string
}

export interface ProjectDirectoryScanResult {
  trackedCount: number
  removedCount: number
}

export interface ProjectScriptResourceListItem {
  path: string
  name: string
  scriptKind: ProjectScriptKind
}
