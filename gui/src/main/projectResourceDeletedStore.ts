import { mkdir, readFile, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { ProjectLauncherError } from './projectLauncher'
import type { ProjectAssetKind } from '../shared/projectAssets'
import type { ProjectScriptKind } from '../shared/projectScripts'
import { normalizeResourcePath } from './projectResourcePaths'
import { buildStoredResourceRecord } from './projectResourceRecords'
import { isRecord, parseStoredResources } from './projectResourceRepository'
import { normalizeStartingScenePath } from './projectResourceView'
import type { ProjectResourceKind, ProjectStoredResourceRecord } from './projectResourceTypes'

const INTERNAL_HISTORY_DIRECTORY = '.retrogbfull-history'
const DELETED_RESOURCES_DIRECTORY = 'deleted-resources'
const DELETED_RESOURCE_METADATA_FILE = 'metadata.json'
const DELETED_RESOURCE_CONTENT_NAME = 'resource'

export interface StoredDeletedResourceMetadata {
  deletionId: string
  resourceType: ProjectResourceKind
  resourcePath: string
  resourceName: string
  parentPath: string
  startingScenePath?: string | null
  scriptKind?: ProjectScriptKind | null
  resources: ProjectStoredResourceRecord[]
}

const isTrackedAssetKind = (value: string): value is ProjectAssetKind => {
  return (
    value === 'sprite' ||
    value === 'tileset' ||
    value === 'tilemap' ||
    value === 'window' ||
    value === 'scene' ||
    value === 'actor'
  )
}

const isTrackedScriptKind = (value: string): value is ProjectScriptKind => {
  return value === 'actor' || value === 'scene' || value === 'general'
}

export const getDeletedResourceContainerPath = (
  projectPath: string,
  deletionId: string
): string => {
  return join(projectPath, INTERNAL_HISTORY_DIRECTORY, DELETED_RESOURCES_DIRECTORY, deletionId)
}

export const getDeletedResourcesDirectoryPath = (projectPath: string): string => {
  return join(projectPath, INTERNAL_HISTORY_DIRECTORY, DELETED_RESOURCES_DIRECTORY)
}

const getDeletedResourceMetadataPath = (projectPath: string, deletionId: string): string => {
  return join(
    getDeletedResourceContainerPath(projectPath, deletionId),
    DELETED_RESOURCE_METADATA_FILE
  )
}

export const getDeletedResourceContentPath = (projectPath: string, deletionId: string): string => {
  return join(
    getDeletedResourceContainerPath(projectPath, deletionId),
    DELETED_RESOURCE_CONTENT_NAME
  )
}

const parseDeletedResourceMetadata = (value: unknown): StoredDeletedResourceMetadata => {
  if (!isRecord(value)) {
    throw new ProjectLauncherError('The deleted resource metadata is invalid.')
  }

  const deletionId = typeof value.deletionId === 'string' ? value.deletionId : ''
  const resourceType =
    typeof value.resourceType === 'string' ? (value.resourceType as ProjectResourceKind) : 'folder'
  const resourcePath = normalizeResourcePath(
    typeof value.resourcePath === 'string' ? value.resourcePath : ''
  )
  const resourceName =
    typeof value.resourceName === 'string' && value.resourceName.length > 0
      ? value.resourceName
      : basename(resourcePath)
  const parentPath = normalizeResourcePath(
    typeof value.parentPath === 'string' ? value.parentPath : ''
  )
  const parsedResources = parseStoredResources(value.resources)

  if (!deletionId || !resourcePath || !resourceName) {
    throw new ProjectLauncherError('The deleted resource metadata is incomplete.')
  }

  return {
    deletionId,
    resourceType,
    resourcePath,
    resourceName,
    parentPath,
    startingScenePath: normalizeStartingScenePath(value.startingScenePath),
    scriptKind:
      typeof value.scriptKind === 'string' && isTrackedScriptKind(value.scriptKind)
        ? value.scriptKind
        : null,
    resources:
      parsedResources.length > 0
        ? parsedResources
        : [
            buildStoredResourceRecord(
              resourceType === 'folder'
                ? 'folder'
                : isTrackedAssetKind(resourceType)
                  ? resourceType
                  : resourceType === 'script'
                    ? 'script'
                    : 'folder',
              resourcePath,
              typeof value.scriptKind === 'string' && isTrackedScriptKind(value.scriptKind)
                ? value.scriptKind
                : undefined
            )
          ]
  }
}

export const readDeletedResourceMetadata = async (
  projectPath: string,
  deletionId: string
): Promise<StoredDeletedResourceMetadata> => {
  const rawContent = await readFile(
    getDeletedResourceMetadataPath(projectPath, deletionId),
    'utf-8'
  )
  return parseDeletedResourceMetadata(JSON.parse(rawContent))
}

export const writeDeletedResourceMetadata = async (
  projectPath: string,
  metadata: StoredDeletedResourceMetadata
): Promise<void> => {
  const containerPath = getDeletedResourceContainerPath(projectPath, metadata.deletionId)
  await mkdir(containerPath, { recursive: true })
  await writeFile(
    getDeletedResourceMetadataPath(projectPath, metadata.deletionId),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf-8'
  )
}
