import { randomUUID } from 'crypto'
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'path'
import {
  ProjectLauncherError,
  getProjectLauncherErrorMessage,
  isValidProjectName,
  validateProjectDirectory
} from './projectLauncher'
import {
  ProjectAssetKind,
  buildProjectAssetFileName,
  createDefaultProjectAssetDocument,
  getProjectAssetDisplayName,
  getProjectAssetKindFromFileName,
  parseProjectAssetDocument,
  serializeProjectAssetDocument
} from '../shared/projectAssets'

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
  createdAt: string
  updatedAt: string
}

export type ProjectStoredResourceRecord = ProjectFolderRecord | ProjectAssetRecord

export interface ProjectFolderMutationResult {
  view: ProjectResourceView
  folderPath: string
}

export type ProjectResourceKind = 'folder' | ProjectAssetKind | 'script'
type CreatableProjectResourceKind = 'folder' | ProjectAssetKind

export interface ProjectResourceMutationResult {
  view: ProjectResourceView
  resourceType: ProjectResourceKind
  resourcePath: string
  resourceName: string
  parentPath: string
}

export interface ProjectDeletedResourceResult extends ProjectResourceMutationResult {
  deletionId: string
}

export interface ProjectResourceView {
  projectName: string
  projectPath: string
  currentPath: string
  parentPath: string | null
  items: ProjectResourceItem[]
}

export type ProjectResourceItem =
  | {
      type: 'folder'
      id: string
      name: string
      path: string
      parentPath: string | null
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
    }

export interface ProjectTrackedResource {
  type: 'folder' | 'file'
  name: string
  path: string
  parentPath: string | null
  resourceType?: ProjectAssetKind
}

export interface ProjectDirectoryScanResult {
  trackedCount: number
  removedCount: number
}

type ProjectResourceAction = 'load' | 'create' | 'rename' | 'delete' | 'paste'
export type ProjectResourceTransferMode = 'copy' | 'move'

interface StoredProjectFile extends Record<string, unknown> {
  name?: string
  createdAt?: string
  resources?: Record<string, unknown>
}

interface LegacyStoredFolder extends Record<string, unknown> {
  id?: string
  name?: string
  path?: string
  parentPath?: string | null
  createdAt?: string
  updatedAt?: string
}

interface StoredDeletedResourceMetadata {
  deletionId: string
  resourceType: ProjectResourceKind
  resourcePath: string
  resourceName: string
  parentPath: string
  resources: ProjectStoredResourceRecord[]
}

interface ProjectResourceState {
  jsonPath: string
  projectFile: StoredProjectFile
  projectName: string
  projectPath: string
  resources: ProjectStoredResourceRecord[]
}

const INTERNAL_HISTORY_DIRECTORY = '.retrogbfull-history'
const DELETED_RESOURCES_DIRECTORY = 'deleted-resources'
const DELETED_RESOURCE_METADATA_FILE = 'metadata.json'
const DELETED_RESOURCE_CONTENT_NAME = 'resource'

const normalizeResourcePath = (resourcePath: string): string => {
  return resourcePath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.')
    .join('/')
}

const normalizeParentPath = (resourcePath: string | null | undefined): string | null => {
  const normalizedPath = normalizeResourcePath(resourcePath ?? '')
  return normalizedPath.length > 0 ? normalizedPath : null
}

const isInternalProjectEntry = (entryName: string): boolean => {
  return entryName === INTERNAL_HISTORY_DIRECTORY
}

const getResourceParentPath = (resourcePath: string): string | null => {
  const normalizedPath = normalizeResourcePath(resourcePath)

  if (!normalizedPath) {
    return null
  }

  const pathSegments = normalizedPath.split('/')
  pathSegments.pop()

  return pathSegments.length > 0 ? pathSegments.join('/') : null
}

const joinResourcePath = (parentPath: string | null, childName: string): string => {
  const normalizedParentPath = normalizeParentPath(parentPath)
  return normalizedParentPath ? `${normalizedParentPath}/${childName}` : childName
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const isStoredResourceKind = (value: string): value is 'folder' | 'file' => {
  return value === 'folder' || value === 'file'
}

const isTrackedAssetKind = (value: string): value is ProjectAssetKind => {
  return value === 'sprite' || value === 'tileset' || value === 'tilemap' || value === 'scene'
}

const getDeletedResourceContainerPath = (projectPath: string, deletionId: string): string => {
  return join(projectPath, INTERNAL_HISTORY_DIRECTORY, DELETED_RESOURCES_DIRECTORY, deletionId)
}

const getDeletedResourcesDirectoryPath = (projectPath: string): string => {
  return join(projectPath, INTERNAL_HISTORY_DIRECTORY, DELETED_RESOURCES_DIRECTORY)
}

const getDeletedResourceMetadataPath = (projectPath: string, deletionId: string): string => {
  return join(
    getDeletedResourceContainerPath(projectPath, deletionId),
    DELETED_RESOURCE_METADATA_FILE
  )
}

const getDeletedResourceContentPath = (projectPath: string, deletionId: string): string => {
  return join(
    getDeletedResourceContainerPath(projectPath, deletionId),
    DELETED_RESOURCE_CONTENT_NAME
  )
}

const resolveResourceDirectory = (projectPath: string, resourcePath: string): string => {
  const normalizedPath = normalizeResourcePath(resourcePath)
  const targetPath = resolve(projectPath, normalizedPath || '.')
  const relativePath = relative(projectPath, targetPath)

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new ProjectLauncherError('The selected folder is outside the project directory.')
  }

  return targetPath
}

const isSameOrDescendantPath = (resourcePath: string, potentialAncestorPath: string): boolean => {
  return (
    resourcePath === potentialAncestorPath || resourcePath.startsWith(`${potentialAncestorPath}/`)
  )
}

const sortResources = (resources: ProjectStoredResourceRecord[]): ProjectStoredResourceRecord[] => {
  return [...resources].sort((left, right) => {
    if (left.path !== right.path) {
      return left.path.localeCompare(right.path)
    }

    return left.type.localeCompare(right.type)
  })
}

const buildResourceFileName = (
  resourceType: CreatableProjectResourceKind,
  resourceName: string
): string => {
  return resourceType === 'folder'
    ? resourceName
    : buildProjectAssetFileName(resourceType, resourceName)
}

const buildStoredFolderRecord = (
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

const buildStoredAssetRecord = (
  assetPath: string,
  resourceType: ProjectAssetKind,
  options?: {
    id?: string
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
    createdAt: options?.createdAt ?? now,
    updatedAt: options?.updatedAt ?? now
  }
}

const buildStoredResourceRecord = (
  resourceType: CreatableProjectResourceKind,
  resourcePath: string,
  options?: {
    id?: string
    createdAt?: string
    updatedAt?: string
  }
): ProjectStoredResourceRecord => {
  return resourceType === 'folder'
    ? buildStoredFolderRecord(resourcePath, options)
    : buildStoredAssetRecord(resourcePath, resourceType, options)
}

const parseLegacyFolders = (value: unknown): ProjectFolderRecord[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return []
    }

    const legacyFolder = entry as LegacyStoredFolder
    const normalizedPath = normalizeResourcePath(
      typeof legacyFolder.path === 'string' ? legacyFolder.path : ''
    )

    if (!normalizedPath) {
      return []
    }

    const createdAt =
      typeof legacyFolder.createdAt === 'string' ? legacyFolder.createdAt : new Date().toISOString()
    const updatedAt =
      typeof legacyFolder.updatedAt === 'string' ? legacyFolder.updatedAt : createdAt

    return [
      {
        type: 'folder',
        id:
          typeof legacyFolder.id === 'string' && legacyFolder.id.length > 0
            ? legacyFolder.id
            : randomUUID(),
        name:
          typeof legacyFolder.name === 'string' && legacyFolder.name.length > 0
            ? legacyFolder.name
            : basename(normalizedPath),
        path: normalizedPath,
        parentPath:
          normalizeParentPath(legacyFolder.parentPath) ?? getResourceParentPath(normalizedPath),
        createdAt,
        updatedAt
      }
    ]
  })
}

const parseStoredResourceRecord = (value: unknown): ProjectStoredResourceRecord | null => {
  if (!isRecord(value) || typeof value.type !== 'string' || !isStoredResourceKind(value.type)) {
    return null
  }

  const normalizedPath = normalizeResourcePath(typeof value.path === 'string' ? value.path : '')

  if (!normalizedPath) {
    return null
  }

  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString()
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : createdAt
  const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : randomUUID()

  if (value.type === 'folder') {
    return {
      type: 'folder',
      id,
      name:
        typeof value.name === 'string' && value.name.length > 0
          ? value.name
          : basename(normalizedPath),
      path: normalizedPath,
      parentPath:
        normalizeParentPath(value.parentPath as string | null | undefined) ??
        getResourceParentPath(normalizedPath),
      createdAt,
      updatedAt
    }
  }

  const explicitResourceType =
    typeof value.resourceType === 'string' && isTrackedAssetKind(value.resourceType)
      ? value.resourceType
      : null
  const derivedResourceType = getProjectAssetKindFromFileName(basename(normalizedPath))
  const resourceType = explicitResourceType ?? derivedResourceType

  if (!resourceType) {
    return null
  }

  return {
    type: 'file',
    id,
    name:
      typeof value.name === 'string' && value.name.length > 0
        ? value.name
        : getProjectAssetDisplayName(basename(normalizedPath)),
    path: normalizedPath,
    parentPath:
      normalizeParentPath(value.parentPath as string | null | undefined) ??
      getResourceParentPath(normalizedPath),
    resourceType,
    createdAt,
    updatedAt
  }
}

const parseStoredResources = (value: unknown): ProjectStoredResourceRecord[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return sortResources(
    value.flatMap((entry) => {
      const resource = parseStoredResourceRecord(entry)
      return resource ? [resource] : []
    })
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
    resources:
      parsedResources.length > 0
        ? parsedResources
        : [
            buildStoredResourceRecord(
              resourceType === 'folder' || !isTrackedAssetKind(resourceType)
                ? 'folder'
                : resourceType,
              resourcePath
            )
          ]
  }
}

const readProjectFile = async (
  projectPath: string
): Promise<{
  jsonPath: string
  projectFile: StoredProjectFile
  projectName: string
  projectPath: string
}> => {
  const validation = await validateProjectDirectory(projectPath)

  if (!validation.isValid) {
    throw new ProjectLauncherError(
      validation.message ?? 'The selected project could not be loaded.'
    )
  }

  const rawContent = await readFile(validation.jsonPath, 'utf-8')
  const parsedContent = JSON.parse(rawContent)

  return {
    jsonPath: validation.jsonPath,
    projectFile: isRecord(parsedContent) ? parsedContent : {},
    projectName: validation.name,
    projectPath: validation.path
  }
}

const writeProjectFile = async (
  jsonPath: string,
  projectFile: StoredProjectFile,
  resources: ProjectStoredResourceRecord[]
): Promise<void> => {
  const resourcesSection = isRecord(projectFile.resources) ? projectFile.resources : {}
  const remainingResourcesSection = { ...resourcesSection }
  delete remainingResourcesSection.folders
  const nextProjectFile: StoredProjectFile = {
    ...projectFile,
    resources: {
      ...remainingResourcesSection,
      items: resources.map((resource) =>
        resource.type === 'folder'
          ? {
              type: 'folder',
              id: resource.id,
              name: resource.name,
              path: resource.path,
              parentPath: resource.parentPath,
              createdAt: resource.createdAt,
              updatedAt: resource.updatedAt
            }
          : {
              type: 'file',
              id: resource.id,
              name: resource.name,
              path: resource.path,
              parentPath: resource.parentPath,
              resourceType: resource.resourceType,
              createdAt: resource.createdAt,
              updatedAt: resource.updatedAt
            }
      )
    }
  }

  await writeFile(jsonPath, `${JSON.stringify(nextProjectFile, null, 2)}\n`, 'utf-8')
}

const scanLegacyProjectResources = async (
  projectPath: string,
  currentPath = '',
  legacyFoldersByPath = new Map<string, ProjectFolderRecord>()
): Promise<ProjectStoredResourceRecord[]> => {
  const absolutePath = resolveResourceDirectory(projectPath, currentPath)
  const entries = await readdir(absolutePath, { withFileTypes: true })
  const resources: ProjectStoredResourceRecord[] = []

  for (const entry of entries) {
    if (currentPath.length === 0) {
      if (entry.name === `${basename(projectPath)}.json` || isInternalProjectEntry(entry.name)) {
        continue
      }
    }

    const resourcePath = joinResourcePath(currentPath, entry.name)

    if (entry.isDirectory()) {
      const legacyFolder = legacyFoldersByPath.get(resourcePath)
      resources.push(
        buildStoredFolderRecord(resourcePath, {
          id: legacyFolder?.id,
          createdAt: legacyFolder?.createdAt,
          updatedAt: legacyFolder?.updatedAt
        })
      )
      resources.push(
        ...(await scanLegacyProjectResources(projectPath, resourcePath, legacyFoldersByPath))
      )
      continue
    }

    const resourceType = getProjectAssetKindFromFileName(entry.name)

    if (resourceType) {
      resources.push(buildStoredAssetRecord(resourcePath, resourceType))
    }
  }

  return resources
}

const migrateLegacyProjectResources = async (
  projectPath: string,
  jsonPath: string,
  projectFile: StoredProjectFile
): Promise<ProjectStoredResourceRecord[]> => {
  const legacyFolders = parseLegacyFolders(projectFile.resources?.folders)
  const legacyFoldersByPath = new Map(legacyFolders.map((folder) => [folder.path, folder]))
  const migratedResources = sortResources(
    await scanLegacyProjectResources(projectPath, '', legacyFoldersByPath)
  )

  await writeProjectFile(jsonPath, projectFile, migratedResources)
  return migratedResources
}

const readProjectResourceState = async (projectPath: string): Promise<ProjectResourceState> => {
  const projectState = await readProjectFile(projectPath)
  const resourcesSection = isRecord(projectState.projectFile.resources)
    ? projectState.projectFile.resources
    : {}
  const storedResources = parseStoredResources(resourcesSection.items)

  return {
    ...projectState,
    resources:
      storedResources.length > 0 || Array.isArray(resourcesSection.items)
        ? storedResources
        : await migrateLegacyProjectResources(
            projectState.projectPath,
            projectState.jsonPath,
            projectState.projectFile
          )
  }
}

const writeProjectResources = async (
  state: ProjectResourceState,
  resources: ProjectStoredResourceRecord[]
): Promise<ProjectStoredResourceRecord[]> => {
  const sortedResources = sortResources(resources)
  await writeProjectFile(state.jsonPath, state.projectFile, sortedResources)
  return sortedResources
}

const readDeletedResourceMetadata = async (
  projectPath: string,
  deletionId: string
): Promise<StoredDeletedResourceMetadata> => {
  const rawContent = await readFile(
    getDeletedResourceMetadataPath(projectPath, deletionId),
    'utf-8'
  )
  return parseDeletedResourceMetadata(JSON.parse(rawContent))
}

const writeDeletedResourceMetadata = async (
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

const discoverUntrackedProjectResources = async (
  projectPath: string,
  trackedPaths: Set<string>,
  currentPath = ''
): Promise<ProjectStoredResourceRecord[]> => {
  const absolutePath = resolveResourceDirectory(projectPath, currentPath)
  const entries = await readdir(absolutePath, { withFileTypes: true })
  const discoveredResources: ProjectStoredResourceRecord[] = []

  for (const entry of entries) {
    if (currentPath.length === 0) {
      if (entry.name === `${basename(projectPath)}.json` || isInternalProjectEntry(entry.name)) {
        continue
      }
    }

    const resourcePath = joinResourcePath(currentPath, entry.name)

    if (entry.isDirectory()) {
      if (!trackedPaths.has(resourcePath)) {
        trackedPaths.add(resourcePath)
        discoveredResources.push(buildStoredFolderRecord(resourcePath))
      }

      discoveredResources.push(
        ...(await discoverUntrackedProjectResources(projectPath, trackedPaths, resourcePath))
      )
      continue
    }

    const resourceType = getProjectAssetKindFromFileName(entry.name)

    if (!resourceType || trackedPaths.has(resourcePath)) {
      continue
    }

    try {
      const rawContent = await readFile(
        resolveResourceDirectory(projectPath, resourcePath),
        'utf-8'
      )
      const document = parseProjectAssetDocument(JSON.parse(rawContent))

      if (document.kind !== resourceType) {
        continue
      }

      trackedPaths.add(resourcePath)
      discoveredResources.push(buildStoredAssetRecord(resourcePath, resourceType))
    } catch {
      continue
    }
  }

  return discoveredResources
}

const buildFolderItem = (resource: ProjectFolderRecord): ProjectResourceItem => {
  return {
    type: 'folder',
    id: resource.id,
    name: resource.name,
    path: resource.path,
    parentPath: resource.parentPath
  }
}

const buildFileItem = (resource: ProjectAssetRecord): ProjectResourceItem => {
  const fileName = basename(resource.path)

  return {
    type: 'file',
    id: resource.id,
    name: resource.name,
    fileName,
    path: resource.path,
    parentPath: resource.parentPath,
    extension: extname(fileName).slice(1) || null,
    resourceType: resource.resourceType
  }
}

const buildProjectResourceView = (
  state: Pick<ProjectResourceState, 'projectName' | 'projectPath'>,
  resources: ProjectStoredResourceRecord[],
  currentPath = ''
): ProjectResourceView => {
  const normalizedCurrentPath = normalizeResourcePath(currentPath)
  const expectedParentPath = normalizeParentPath(normalizedCurrentPath)
  const items = resources
    .filter((resource) => resource.parentPath === expectedParentPath)
    .map((resource) =>
      resource.type === 'folder' ? buildFolderItem(resource) : buildFileItem(resource)
    )
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'folder' ? -1 : 1
      }

      return left.name.localeCompare(right.name)
    })

  return {
    projectName: state.projectName,
    projectPath: state.projectPath,
    currentPath: normalizedCurrentPath,
    parentPath: getResourceParentPath(normalizedCurrentPath),
    items
  }
}

const findTrackedResourceRecord = (
  resources: ProjectStoredResourceRecord[],
  resourcePath: string
): ProjectStoredResourceRecord | undefined => {
  const normalizedPath = normalizeResourcePath(resourcePath)
  return resources.find((resource) => resource.path === normalizedPath)
}

const hasMissingAncestorPath = (resourcePath: string, missingRootPaths: Set<string>): boolean => {
  for (const missingRootPath of missingRootPaths) {
    if (isSameOrDescendantPath(resourcePath, missingRootPath)) {
      return true
    }
  }

  return false
}

const removeTrackedResourceSubtree = async (
  state: ProjectResourceState,
  resourcePath: string
): Promise<{ resources: ProjectStoredResourceRecord[]; removedCount: number }> => {
  const normalizedResourcePath = normalizeResourcePath(resourcePath)
  const nextResources = state.resources.filter(
    (resource) => !isSameOrDescendantPath(resource.path, normalizedResourcePath)
  )
  const removedCount = state.resources.length - nextResources.length

  if (removedCount === 0) {
    return {
      resources: state.resources,
      removedCount: 0
    }
  }

  const persistedResources = await writeProjectResources(state, nextResources)
  return {
    resources: persistedResources,
    removedCount
  }
}

const reconcileTrackedProjectResources = async (
  state: ProjectResourceState
): Promise<{ resources: ProjectStoredResourceRecord[]; removedCount: number }> => {
  const existingResources: ProjectStoredResourceRecord[] = []
  const missingRootPaths = new Set<string>()
  let removedCount = 0

  for (const resource of state.resources) {
    if (hasMissingAncestorPath(resource.path, missingRootPaths)) {
      removedCount += 1
      continue
    }

    try {
      const resourceStats = await stat(resolveResourceDirectory(state.projectPath, resource.path))
      const existsWithExpectedType =
        resource.type === 'folder' ? resourceStats.isDirectory() : resourceStats.isFile()

      if (existsWithExpectedType) {
        existingResources.push(resource)
        continue
      }
    } catch (error) {
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : undefined

      if (errorCode !== 'ENOENT') {
        throw error
      }
    }

    missingRootPaths.add(resource.path)
    removedCount += 1
  }

  if (removedCount === 0) {
    return {
      resources: state.resources,
      removedCount: 0
    }
  }

  const persistedResources = await writeProjectResources(state, existingResources)
  return {
    resources: persistedResources,
    removedCount
  }
}

const assertTrackedResourceType = (
  resource: ProjectStoredResourceRecord,
  resourceType: CreatableProjectResourceKind
): void => {
  if (resourceType === 'folder' && resource.type !== 'folder') {
    throw new ProjectLauncherError(
      'The selected resource type does not match the project metadata.'
    )
  }

  if (
    resourceType !== 'folder' &&
    (resource.type !== 'file' || resource.resourceType !== resourceType)
  ) {
    throw new ProjectLauncherError(
      'The selected resource type does not match the project metadata.'
    )
  }
}

const assertTrackedParentFolder = async (
  state: ProjectResourceState,
  parentPath: string
): Promise<void> => {
  const normalizedParentPath = normalizeResourcePath(parentPath)

  if (normalizedParentPath.length === 0) {
    return
  }

  const parentResource = findTrackedResourceRecord(state.resources, normalizedParentPath)

  if (!parentResource || parentResource.type !== 'folder') {
    throw new ProjectLauncherError('The selected folder could not be found.')
  }

  const parentStats = await stat(resolveResourceDirectory(state.projectPath, normalizedParentPath))

  if (!parentStats.isDirectory()) {
    throw new ProjectLauncherError('The selected folder could not be found.')
  }
}

const getTrackedResourceSubtree = (
  resources: ProjectStoredResourceRecord[],
  resourcePath: string
): ProjectStoredResourceRecord[] => {
  const normalizedPath = normalizeResourcePath(resourcePath)
  return resources.filter((resource) => isSameOrDescendantPath(resource.path, normalizedPath))
}

const relocateTrackedResource = (
  resource: ProjectStoredResourceRecord,
  sourceRootPath: string,
  targetRootPath: string,
  options?: {
    resetIdentity?: boolean
  }
): ProjectStoredResourceRecord => {
  const now = new Date().toISOString()
  const nextPath =
    resource.path === sourceRootPath
      ? targetRootPath
      : `${targetRootPath}${resource.path.slice(sourceRootPath.length)}`

  return buildStoredResourceRecord(
    resource.type === 'folder' ? 'folder' : resource.resourceType,
    nextPath,
    {
      id: options?.resetIdentity ? randomUUID() : resource.id,
      createdAt: options?.resetIdentity ? now : resource.createdAt,
      updatedAt: now
    }
  )
}

const assertFolderName = (folderName: string): string => {
  const trimmedFolderName = folderName.trim()

  if (!isValidProjectName(trimmedFolderName)) {
    throw new ProjectLauncherError(
      'Please enter a valid folder name. Avoid empty names and reserved filename characters.'
    )
  }

  return trimmedFolderName
}

const buildUniqueResourceName = (
  resources: ProjectStoredResourceRecord[],
  parentPath: string,
  resourceType: CreatableProjectResourceKind
): string => {
  const normalizedParentPath = normalizeParentPath(parentPath)
  const siblingNames = new Set(
    resources
      .filter((resource) => resource.parentPath === normalizedParentPath)
      .map((resource) => basename(resource.path))
  )
  const baseName =
    resourceType === 'folder'
      ? 'New Folder'
      : `New ${resourceType[0].toUpperCase()}${resourceType.slice(1)}`
  const buildTargetName = (candidateName: string): string =>
    buildResourceFileName(resourceType, candidateName)

  if (!siblingNames.has(buildTargetName(baseName))) {
    return baseName
  }

  let suffix = 2

  while (siblingNames.has(buildTargetName(`${baseName} ${suffix}`))) {
    suffix += 1
  }

  return `${baseName} ${suffix}`
}

const buildUniqueTransferredResourceTarget = (
  resources: ProjectStoredResourceRecord[],
  parentPath: string,
  resourceType: CreatableProjectResourceKind,
  sourcePath: string
): { resourceName: string; resourcePath: string } => {
  const normalizedParentPath = normalizeParentPath(parentPath)
  const siblingNames = new Set(
    resources
      .filter((resource) => resource.parentPath === normalizedParentPath)
      .map((resource) => basename(resource.path))
  )
  const sourceEntryName = basename(sourcePath)
  const baseResourceName =
    resourceType === 'folder' ? sourceEntryName : getProjectAssetDisplayName(sourceEntryName)

  if (!siblingNames.has(sourceEntryName)) {
    return {
      resourceName: baseResourceName,
      resourcePath: joinResourcePath(normalizedParentPath, sourceEntryName)
    }
  }

  let suffix = 2
  let nextResourceName = `${baseResourceName} ${suffix}`
  let nextEntryName = buildResourceFileName(resourceType, nextResourceName)

  while (siblingNames.has(nextEntryName)) {
    suffix += 1
    nextResourceName = `${baseResourceName} ${suffix}`
    nextEntryName = buildResourceFileName(resourceType, nextResourceName)
  }

  return {
    resourceName: nextResourceName,
    resourcePath: joinResourcePath(normalizedParentPath, nextEntryName)
  }
}

function assertSupportedResourceKind(
  resourceType: ProjectResourceKind
): asserts resourceType is CreatableProjectResourceKind {
  if (resourceType === 'script') {
    throw new ProjectLauncherError(`Creating ${resourceType} resources is not supported yet.`)
  }
}

export const getProjectResourceErrorMessage = (
  error: unknown,
  action: ProjectResourceAction
): string => {
  if (error instanceof ProjectLauncherError) {
    return error.userMessage
  }

  const genericMessageByAction: Record<ProjectResourceAction, string> = {
    load: 'Something went wrong while loading project resources. Please try again.',
    create: 'Something went wrong while creating the resource. Please try again.',
    rename: 'Something went wrong while renaming the resource. Please try again.',
    delete: 'Something went wrong while deleting the resource. Please try again.',
    paste: 'Something went wrong while pasting the resource. Please try again.'
  }

  const errorCode =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined

  if (errorCode === 'EEXIST') {
    return action === 'rename'
      ? 'A resource with that name already exists in this location.'
      : 'A resource with that name already exists.'
  }

  if (errorCode === 'ENOENT') {
    return action === 'load'
      ? 'The requested resource could not be found.'
      : 'The selected resource could not be found.'
  }

  if (errorCode === 'ENOTEMPTY' || errorCode === 'EPERM' || errorCode === 'EACCES') {
    return getProjectLauncherErrorMessage(error, 'open')
  }

  return genericMessageByAction[action]
}

export const getTrackedProjectResource = async (
  projectPath: string,
  resourcePath: string
): Promise<ProjectTrackedResource | null> => {
  const state = await readProjectResourceState(projectPath)
  const resource = findTrackedResourceRecord(state.resources, resourcePath)

  if (!resource) {
    return null
  }

  return resource.type === 'folder'
    ? {
        type: 'folder',
        name: resource.name,
        path: resource.path,
        parentPath: resource.parentPath
      }
    : {
        type: 'file',
        name: resource.name,
        path: resource.path,
        parentPath: resource.parentPath,
        resourceType: resource.resourceType
      }
}

export const pruneMissingProjectResource = async (
  projectPath: string,
  resourcePath: string
): Promise<boolean> => {
  const state = await readProjectResourceState(projectPath)
  const result = await removeTrackedResourceSubtree(state, resourcePath)
  return result.removedCount > 0
}

export const listProjectResources = async (
  projectPath: string,
  currentPath = ''
): Promise<ProjectResourceView> => {
  const state = await readProjectResourceState(projectPath)
  const normalizedCurrentPath = normalizeResourcePath(currentPath)

  if (normalizedCurrentPath.length > 0) {
    const currentResource = findTrackedResourceRecord(state.resources, normalizedCurrentPath)

    if (!currentResource || currentResource.type !== 'folder') {
      throw new ProjectLauncherError('The requested path is not a folder.')
    }

    try {
      const currentStats = await stat(
        resolveResourceDirectory(state.projectPath, normalizedCurrentPath)
      )

      if (!currentStats.isDirectory()) {
        throw new ProjectLauncherError('The selected folder no longer exists on disk.')
      }
    } catch (error) {
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : undefined

      if (errorCode === 'ENOENT' || error instanceof ProjectLauncherError) {
        await removeTrackedResourceSubtree(state, normalizedCurrentPath)
        throw new ProjectLauncherError(
          `The folder "${currentResource.name}" could not be found, so it was removed from the project.`
        )
      }

      throw error
    }
  }

  return buildProjectResourceView(state, state.resources, normalizedCurrentPath)
}

export const createProjectFolder = async (
  projectPath: string,
  parentPath = ''
): Promise<ProjectFolderMutationResult> => {
  const result = await createProjectResource(projectPath, 'folder', parentPath)

  return {
    view: result.view,
    folderPath: result.resourcePath
  }
}

export const createProjectResource = async (
  projectPath: string,
  resourceType: ProjectResourceKind,
  parentPath = '',
  resourceName?: string
): Promise<ProjectResourceMutationResult> => {
  assertSupportedResourceKind(resourceType)

  const state = await readProjectResourceState(projectPath)
  const normalizedParentPath = normalizeResourcePath(parentPath)
  await assertTrackedParentFolder(state, normalizedParentPath)

  const parentDirectory = resolveResourceDirectory(state.projectPath, normalizedParentPath)
  const safeResourceName = resourceName
    ? assertFolderName(resourceName)
    : buildUniqueResourceName(state.resources, normalizedParentPath, resourceType)
  const targetResourceFileName = buildResourceFileName(resourceType, safeResourceName)
  const targetResourcePath = joinResourcePath(
    normalizeParentPath(normalizedParentPath),
    targetResourceFileName
  )

  if (resourceType === 'folder') {
    await mkdir(join(parentDirectory, targetResourceFileName), { recursive: false })
  } else {
    await writeFile(
      join(parentDirectory, targetResourceFileName),
      serializeProjectAssetDocument(createDefaultProjectAssetDocument(resourceType)),
      'utf-8'
    )
  }

  const nextResources = await writeProjectResources(state, [
    ...state.resources,
    buildStoredResourceRecord(resourceType, targetResourcePath)
  ])

  return {
    view: buildProjectResourceView(state, nextResources, normalizedParentPath),
    resourceType,
    resourcePath: targetResourcePath,
    resourceName: safeResourceName,
    parentPath: normalizedParentPath
  }
}

export const renameProjectFolder = async (
  projectPath: string,
  folderPath: string,
  nextName: string
): Promise<ProjectFolderMutationResult> => {
  const result = await renameProjectResource(projectPath, 'folder', folderPath, nextName)

  return {
    view: result.view,
    folderPath: result.resourcePath
  }
}

export const renameProjectResource = async (
  projectPath: string,
  resourceType: ProjectResourceKind,
  resourcePath: string,
  nextName: string
): Promise<ProjectResourceMutationResult> => {
  assertSupportedResourceKind(resourceType)

  const state = await readProjectResourceState(projectPath)
  const normalizedResourcePath = normalizeResourcePath(resourcePath)

  if (!normalizedResourcePath) {
    throw new ProjectLauncherError('The project root folder cannot be renamed.')
  }

  const trackedResource = findTrackedResourceRecord(state.resources, normalizedResourcePath)

  if (!trackedResource) {
    throw new ProjectLauncherError('The selected resource could not be found.')
  }

  assertTrackedResourceType(trackedResource, resourceType)

  const safeResourceName = assertFolderName(nextName)
  const parentPath = trackedResource.parentPath ?? ''
  const nextResourcePath = joinResourcePath(
    trackedResource.parentPath,
    buildResourceFileName(resourceType, safeResourceName)
  )

  if (nextResourcePath !== normalizedResourcePath) {
    await rename(
      resolveResourceDirectory(state.projectPath, normalizedResourcePath),
      resolveResourceDirectory(state.projectPath, nextResourcePath)
    )
  }

  const nextResources = await writeProjectResources(
    state,
    state.resources.map((resource) =>
      isSameOrDescendantPath(resource.path, normalizedResourcePath)
        ? relocateTrackedResource(resource, normalizedResourcePath, nextResourcePath)
        : resource
    )
  )

  return {
    view: buildProjectResourceView(state, nextResources, parentPath),
    resourceType,
    resourcePath: nextResourcePath,
    resourceName: safeResourceName,
    parentPath
  }
}

export const deleteProjectFolder = async (
  projectPath: string,
  folderPath: string
): Promise<ProjectDeletedResourceResult> => {
  return deleteProjectResource(projectPath, 'folder', folderPath)
}

export const deleteProjectResource = async (
  projectPath: string,
  resourceType: ProjectResourceKind,
  resourcePath: string,
  deletionId?: string
): Promise<ProjectDeletedResourceResult> => {
  assertSupportedResourceKind(resourceType)

  const state = await readProjectResourceState(projectPath)
  const normalizedResourcePath = normalizeResourcePath(resourcePath)

  if (!normalizedResourcePath) {
    throw new ProjectLauncherError('The project root folder cannot be deleted.')
  }

  const trackedResource = findTrackedResourceRecord(state.resources, normalizedResourcePath)

  if (!trackedResource) {
    throw new ProjectLauncherError('The selected resource could not be found.')
  }

  assertTrackedResourceType(trackedResource, resourceType)

  const nextDeletionId = deletionId ?? randomUUID()
  const removedResources = getTrackedResourceSubtree(state.resources, normalizedResourcePath)
  const metadata: StoredDeletedResourceMetadata = {
    deletionId: nextDeletionId,
    resourceType,
    resourcePath: normalizedResourcePath,
    resourceName: trackedResource.name,
    parentPath: trackedResource.parentPath ?? '',
    resources: removedResources
  }

  await writeDeletedResourceMetadata(state.projectPath, metadata)
  await rename(
    resolveResourceDirectory(state.projectPath, normalizedResourcePath),
    getDeletedResourceContentPath(state.projectPath, nextDeletionId)
  )

  const nextResources = await writeProjectResources(
    state,
    state.resources.filter(
      (resource) => !isSameOrDescendantPath(resource.path, normalizedResourcePath)
    )
  )

  return {
    view: buildProjectResourceView(state, nextResources, trackedResource.parentPath ?? ''),
    resourceType,
    resourcePath: metadata.resourcePath,
    resourceName: metadata.resourceName,
    parentPath: metadata.parentPath,
    deletionId: nextDeletionId
  }
}

export const restoreDeletedProjectResource = async (
  projectPath: string,
  deletionId: string
): Promise<ProjectResourceMutationResult> => {
  const state = await readProjectResourceState(projectPath)
  const metadata = await readDeletedResourceMetadata(state.projectPath, deletionId)

  assertSupportedResourceKind(metadata.resourceType)
  await mkdir(resolveResourceDirectory(state.projectPath, metadata.parentPath), { recursive: true })

  await rename(
    getDeletedResourceContentPath(state.projectPath, deletionId),
    resolveResourceDirectory(state.projectPath, metadata.resourcePath)
  )

  const nextResources = await writeProjectResources(state, [
    ...state.resources,
    ...metadata.resources
  ])

  return {
    view: buildProjectResourceView(state, nextResources, metadata.parentPath),
    resourceType: metadata.resourceType,
    resourcePath: metadata.resourcePath,
    resourceName: metadata.resourceName,
    parentPath: metadata.parentPath
  }
}

export const transferProjectResource = async (
  projectPath: string,
  resourceType: ProjectResourceKind,
  resourcePath: string,
  destinationParentPath = '',
  mode: ProjectResourceTransferMode = 'copy'
): Promise<ProjectResourceMutationResult> => {
  assertSupportedResourceKind(resourceType)

  const state = await readProjectResourceState(projectPath)
  const normalizedResourcePath = normalizeResourcePath(resourcePath)
  const normalizedDestinationParentPath = normalizeResourcePath(destinationParentPath)

  if (!normalizedResourcePath) {
    throw new ProjectLauncherError('The project root folder cannot be pasted.')
  }

  await assertTrackedParentFolder(state, normalizedDestinationParentPath)

  const trackedResource = findTrackedResourceRecord(state.resources, normalizedResourcePath)

  if (!trackedResource) {
    throw new ProjectLauncherError('The selected resource could not be found.')
  }

  assertTrackedResourceType(trackedResource, resourceType)

  if (
    resourceType === 'folder' &&
    isSameOrDescendantPath(normalizedDestinationParentPath, normalizedResourcePath)
  ) {
    throw new ProjectLauncherError('Folders cannot be pasted into themselves.')
  }

  const sourceParentPath = trackedResource.parentPath ?? ''

  if (mode === 'move' && sourceParentPath === normalizedDestinationParentPath) {
    throw new ProjectLauncherError('The selected resource is already in this folder.')
  }

  const sourceAbsolutePath = resolveResourceDirectory(state.projectPath, normalizedResourcePath)
  const sourceStats = await stat(sourceAbsolutePath)

  if (resourceType === 'folder' && !sourceStats.isDirectory()) {
    throw new ProjectLauncherError('The selected folder could not be found.')
  }

  if (resourceType !== 'folder' && !sourceStats.isFile()) {
    throw new ProjectLauncherError('The selected asset could not be found.')
  }

  const target = buildUniqueTransferredResourceTarget(
    state.resources,
    normalizedDestinationParentPath,
    resourceType,
    normalizedResourcePath
  )
  const targetAbsolutePath = resolveResourceDirectory(state.projectPath, target.resourcePath)

  if (mode === 'copy') {
    if (sourceStats.isDirectory()) {
      await cp(sourceAbsolutePath, targetAbsolutePath, { recursive: true, errorOnExist: true })
    } else {
      await cp(sourceAbsolutePath, targetAbsolutePath, { errorOnExist: true })
    }
  } else {
    await rename(sourceAbsolutePath, targetAbsolutePath)
  }

  const subtree = getTrackedResourceSubtree(state.resources, normalizedResourcePath)
  const nextResources =
    mode === 'copy'
      ? [
          ...state.resources,
          ...subtree.map((resource) =>
            relocateTrackedResource(resource, normalizedResourcePath, target.resourcePath, {
              resetIdentity: true
            })
          )
        ]
      : state.resources.map((resource) =>
          isSameOrDescendantPath(resource.path, normalizedResourcePath)
            ? relocateTrackedResource(resource, normalizedResourcePath, target.resourcePath)
            : resource
        )

  const persistedResources = await writeProjectResources(state, nextResources)

  return {
    view: buildProjectResourceView(state, persistedResources, normalizedDestinationParentPath),
    resourceType,
    resourcePath: target.resourcePath,
    resourceName: target.resourceName,
    parentPath: normalizedDestinationParentPath
  }
}

export const scanProjectDirectory = async (
  projectPath: string
): Promise<ProjectDirectoryScanResult> => {
  const state = await readProjectResourceState(projectPath)
  const reconciledResources = await reconcileTrackedProjectResources(state)
  const trackedPaths = new Set(reconciledResources.resources.map((resource) => resource.path))
  const discoveredResources = await discoverUntrackedProjectResources(
    state.projectPath,
    trackedPaths
  )

  if (reconciledResources.removedCount === 0 && discoveredResources.length === 0) {
    return {
      trackedCount: 0,
      removedCount: 0
    }
  }

  if (discoveredResources.length > 0) {
    await writeProjectResources(state, [...reconciledResources.resources, ...discoveredResources])
  }

  return {
    trackedCount: discoveredResources.length,
    removedCount: reconciledResources.removedCount
  }
}

export const finalizeDeletedProjectResource = async (
  projectPath: string,
  deletionId: string
): Promise<void> => {
  const state = await readProjectResourceState(projectPath)

  await rm(getDeletedResourceContainerPath(state.projectPath, deletionId), {
    recursive: true,
    force: true
  })
}

export const clearDeletedProjectResources = async (projectPath: string): Promise<void> => {
  const validation = await validateProjectDirectory(projectPath)

  if (!validation.isValid) {
    return
  }

  await rm(getDeletedResourcesDirectoryPath(validation.path), {
    recursive: true,
    force: true
  })
}
