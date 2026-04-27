import { randomUUID } from 'crypto'
import { basename } from 'path'
import type { ProjectAssetKind } from '../shared/projectAssets'
import { buildProjectAssetFileName, getProjectAssetDisplayName } from '../shared/projectAssets'
import { normalizeCodeIdentifier } from '../shared/codeIdentifiers'
import type { ProjectScriptKind } from '../shared/projectScripts'
import { buildProjectScriptFileName, getProjectScriptDisplayName } from '../shared/projectScripts'
import { normalizeProjectResourceBank, normalizeResourcePath } from './projectResourcePaths'
import type {
  ProjectAssetRecord,
  ProjectFolderRecord,
  ProjectScriptRecord,
  ProjectStoredResourceRecord
} from './projectResourceTypes'
import { getResourceParentPath } from './projectResourceView'

export type CreatableProjectResourceKind = 'folder' | ProjectAssetKind | 'script'

export const isBankableAssetKind = (
  value: ProjectAssetKind | 'script'
): value is 'script' | 'sprite' | 'tileset' | 'tilemap' | 'window' => {
  return (
    value === 'script' ||
    value === 'sprite' ||
    value === 'tileset' ||
    value === 'tilemap' ||
    value === 'window'
  )
}

export const sortResources = (
  resources: ProjectStoredResourceRecord[]
): ProjectStoredResourceRecord[] => {
  return [...resources].sort((left, right) => {
    if (left.path !== right.path) {
      return left.path.localeCompare(right.path)
    }

    return left.type.localeCompare(right.type)
  })
}

export const buildResourceFileName = (
  resourceType: CreatableProjectResourceKind,
  resourceName: string
): string => {
  if (resourceType === 'folder') {
    return resourceName
  }

  if (resourceType === 'script') {
    return buildProjectScriptFileName(normalizeCodeIdentifier(resourceName))
  }

  return buildProjectAssetFileName(resourceType, resourceName)
}

export const buildStoredFolderRecord = (
  folderPath: string,
  options?: {
    id?: string
    createdAt?: string
    updatedAt?: string
  }
): ProjectFolderRecord => {
  const normalizedPath = normalizeResourcePath(folderPath)
  const now = new Date().toISOString()

  return {
    type: 'folder',
    id: options?.id ?? randomUUID(),
    name: basename(normalizedPath),
    path: normalizedPath,
    parentPath: getResourceParentPath(normalizedPath),
    createdAt: options?.createdAt ?? now,
    updatedAt: options?.updatedAt ?? now
  }
}

export const buildStoredAssetRecord = (
  assetPath: string,
  resourceType: ProjectAssetKind,
  options?: {
    id?: string
    bank?: number | null
    createdAt?: string
    updatedAt?: string
  }
): ProjectAssetRecord => {
  const normalizedPath = normalizeResourcePath(assetPath)
  const now = new Date().toISOString()

  return {
    type: 'file',
    id: options?.id ?? randomUUID(),
    name: getProjectAssetDisplayName(basename(normalizedPath)),
    path: normalizedPath,
    parentPath: getResourceParentPath(normalizedPath),
    resourceType,
    bank: isBankableAssetKind(resourceType) ? normalizeProjectResourceBank(options?.bank) : null,
    createdAt: options?.createdAt ?? now,
    updatedAt: options?.updatedAt ?? now
  }
}

export const buildStoredScriptRecord = (
  scriptPath: string,
  scriptKind: ProjectScriptKind,
  options?: {
    id?: string
    bank?: number | null
    createdAt?: string
    updatedAt?: string
  }
): ProjectScriptRecord => {
  const normalizedPath = normalizeResourcePath(scriptPath)
  const now = new Date().toISOString()

  return {
    type: 'file',
    id: options?.id ?? randomUUID(),
    name: getProjectScriptDisplayName(basename(normalizedPath)),
    path: normalizedPath,
    parentPath: getResourceParentPath(normalizedPath),
    resourceType: 'script',
    scriptKind,
    bank: normalizeProjectResourceBank(options?.bank),
    createdAt: options?.createdAt ?? now,
    updatedAt: options?.updatedAt ?? now
  }
}

export const buildStoredResourceRecord = (
  resourceType: CreatableProjectResourceKind,
  resourcePath: string,
  scriptKind?: ProjectScriptKind,
  options?: {
    id?: string
    bank?: number | null
    createdAt?: string
    updatedAt?: string
  }
): ProjectStoredResourceRecord => {
  if (resourceType === 'folder') {
    return buildStoredFolderRecord(resourcePath, options)
  }

  if (resourceType === 'script') {
    if (!scriptKind) {
      throw new Error('A script kind is required when creating script resource records.')
    }

    return buildStoredScriptRecord(resourcePath, scriptKind, options)
  }

  return buildStoredAssetRecord(resourcePath, resourceType, options)
}
