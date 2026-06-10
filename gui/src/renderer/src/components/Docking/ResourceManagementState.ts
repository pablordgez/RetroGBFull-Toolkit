import type { ProjectScriptKind } from '../../../../shared/projectScripts'
import type { ProjectResourceKind } from '../../../../shared/projectResourceModels'

export interface EditingResourceState {
  path: string
  draftName: string
  originalName: string
  resourceType: ProjectResourceKind
}

export interface PendingDeleteResourceState {
  path: string
  name: string
  resourceType: ProjectResourceKind
  scriptKind?: ProjectScriptKind | null
}

export interface PendingBankResourceState {
  path: string
  name: string
  resourceType: ProjectResourceKind
  currentBank: number
  draftBank: string
}

export type ResourceClipboardOperation = 'copy' | 'cut'

export interface ResourceClipboardState {
  operation: ResourceClipboardOperation
  resourcePath: string
  resourceName: string
  resourceType: ProjectResourceKind
  scriptKind?: ProjectScriptKind | null
  parentPath: string
}

export type ResourceStatusTone = 'error' | 'info'
