import type { ProjectAssetKind } from '../../../../shared/projectAssets'

export type TrackableProjectResourceKind = 'folder' | ProjectAssetKind

export interface ResourceMutationEvent {
  action: 'create' | 'rename' | 'delete' | 'move' | 'copy' | 'restore'
  resourceType: TrackableProjectResourceKind
  resourcePath: string
  previousResourcePath?: string
}
