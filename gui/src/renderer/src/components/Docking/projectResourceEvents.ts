import type { ProjectTrackableResourceKind } from '../../../../shared/projectResourceModels'

export interface ResourceMutationEvent {
  action: 'create' | 'rename' | 'delete' | 'move' | 'copy' | 'restore'
  resourceType: ProjectTrackableResourceKind
  resourcePath: string
  previousResourcePath?: string
}
