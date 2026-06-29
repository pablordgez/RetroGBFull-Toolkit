import type { ProjectAssetKind } from '../shared/projectAssets'
import type { ProjectScriptKind } from '../shared/projectScripts'

export interface ProjectFolderRecord {
  type: 'folder'
  id: string
  name: string
  path: string
  parentPath: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectAssetRecord {
  type: 'file'
  id: string
  name: string
  path: string
  parentPath: string | null
  resourceType: ProjectAssetKind
  bank: number | null
  createdAt: string
  updatedAt: string
}

export interface ProjectScriptRecord {
  type: 'file'
  id: string
  name: string
  path: string
  parentPath: string | null
  resourceType: 'script'
  scriptKind: ProjectScriptKind
  bank: number
  createdAt: string
  updatedAt: string
}

export type ProjectStoredResourceRecord =
  | ProjectFolderRecord
  | ProjectAssetRecord
  | ProjectScriptRecord

export interface ProjectFolderMutationResult {
  view: ProjectResourceView
  folderPath: string
}

export type ProjectResourceKind = 'folder' | ProjectAssetKind | 'script'
export type ProjectResourceTransferMode = 'copy' | 'move'

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

export interface ProjectResourceView {
  projectName: string
  projectPath: string
  currentPath: string
  parentPath: string | null
  startingScenePath?: string | null
  items: ProjectResourceItem[]
}

export type ProjectResourceItem =
  | {
      type: 'folder'
      id: string
      name: string
      path: string
      parentPath: string | null
      hasScriptDescendants?: boolean
    }
  | {
      type: 'file'
      id: string
      name: string
      fileName: string
      path: string
      parentPath: string | null
      extension: string | null
      resourceType: ProjectAssetKind | null
      bank: number | null
      scriptKind?: ProjectScriptKind | null
    }

export interface ProjectTrackedResource {
  type: 'folder' | 'file'
  name: string
  path: string
  parentPath: string | null
  bank?: number | null
  resourceType?: ProjectAssetKind
  scriptKind?: ProjectScriptKind | null
}

export interface ProjectDirectoryScanResult {
  trackedCount: number
  removedCount: number
}
