import type { ProjectAssetDocument, ProjectAssetKind } from '../shared/projectAssets'

export interface ProjectAssetRecordLike {
  kind: ProjectAssetKind
  path: string
  name: string
  identifier: string
  bank: number
  document: ProjectAssetDocument
}
