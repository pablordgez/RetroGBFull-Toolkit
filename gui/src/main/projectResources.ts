import { randomUUID } from 'crypto'
import { mkdir, rm, stat } from 'fs/promises'
import { ProjectLauncherError, validateProjectDirectory } from './projectLauncher'
import { createProjectScriptFiles } from './projectCode'
import { normalizeCodeIdentifier } from '../shared/codeIdentifiers'
import { DEFAULT_PROJECT_RESOURCE_BANK } from '../shared/projectResourceModels'
import {
  ProjectScriptKind,
  PROJECT_SCRIPT_DIRECTORY_BY_KIND,
  PROJECT_SCRIPT_LABELS,
  buildProjectScriptFileName
} from '../shared/projectScripts'
import {
  normalizeParentPath,
  normalizeProjectResourceBank,
  normalizeResourcePath
} from './projectResourcePaths'
import {
  type CreatableProjectResourceKind,
  buildResourceFileName,
  buildStoredFolderRecord,
  buildStoredResourceRecord,
  isBankableAssetKind
} from './projectResourceRecords'
import {
  assertFolderName,
  assertUniqueTrackedFileName,
  buildUniqueResourceName,
  buildUniqueTransferredResourceTarget
} from './projectResourceNames'
import {
  type ProjectResourceState,
  readProjectResourceState,
  writeProjectResources
} from './projectResourceRepository'
import {
  type StoredDeletedResourceMetadata,
  getDeletedResourceContainerPath,
  getDeletedResourceContentPath,
  getDeletedResourcesDirectoryPath,
  readDeletedResourceMetadata,
  writeDeletedResourceMetadata
} from './projectResourceDeletedStore'
import { resolveResourceDirectory } from './projectResourceFilesystem'
import { getProjectResourceTypeStrategy } from './projectResourceTypeStrategies'
import {
  buildProjectResourceView,
  getStateStartingScenePath,
  isSameOrDescendantPath,
  normalizeStartingScenePath,
  remapStartingScenePath,
  setStateStartingScenePath
} from './projectResourceView'
import type {
  ProjectDeletedResourceResult,
  ProjectFolderMutationResult,
  ProjectResourceKind,
  ProjectResourceMutationResult,
  ProjectResourceTransferMode,
  ProjectResourceView,
  ProjectScriptRecord,
  ProjectStoredResourceRecord,
  ProjectTrackedResource
} from './projectResourceTypes'

export { getProjectResourceErrorMessage } from './projectResourceErrors'
export { scanProjectDirectory } from './projectResourceDiscovery'
export type {
  ProjectAssetRecord,
  ProjectDeletedResourceResult,
  ProjectDirectoryScanResult,
  ProjectFolderMutationResult,
  ProjectFolderRecord,
  ProjectResourceItem,
  ProjectResourceKind,
  ProjectResourceMutationResult,
  ProjectResourceTransferMode,
  ProjectResourceView,
  ProjectScriptRecord,
  ProjectStoredResourceRecord,
  ProjectTrackedResource
} from './projectResourceTypes'

const joinResourcePath = (parentPath: string | null, childName: string): string => {
  const normalizedParentPath = normalizeParentPath(parentPath)
  return normalizedParentPath ? `${normalizedParentPath}/${childName}` : childName
}

// finds a tracked resource record by its path
const findTrackedResourceRecord = (
  resources: ProjectStoredResourceRecord[],
  resourcePath: string
): ProjectStoredResourceRecord | undefined => {
  const normalizedPath = normalizeResourcePath(resourcePath)
  return resources.find((resource) => resource.path === normalizedPath)
}

// untracks a resource and all its descendants, changes the starting scene if it was untracked
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

  const currentStartingScenePath = getStateStartingScenePath(state)

  if (
    currentStartingScenePath &&
    isSameOrDescendantPath(currentStartingScenePath, normalizedResourcePath)
  ) {
    setStateStartingScenePath(state, null)
  }

  const persistedResources = await writeProjectResources(state, nextResources)
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

// ensures that all parent folders exist and are tracked, otherwise creates them and returns a new resource
// list with the new folders included
const ensureScriptParentFolders = async (
  state: ProjectResourceState,
  scriptPath: string
): Promise<ProjectStoredResourceRecord[]> => {
  const segments = normalizeResourcePath(scriptPath).split('/')
  segments.pop()
  const nextResources = [...state.resources]
  let currentPath = ''

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment

    if (findTrackedResourceRecord(nextResources, currentPath)) {
      continue
    }

    await mkdir(resolveResourceDirectory(state.projectPath, currentPath), { recursive: true })
    nextResources.push(buildStoredFolderRecord(currentPath))
  }

  return nextResources
}

// retracks a resource under a new path
const relocateTrackedResource = (
  resource: ProjectStoredResourceRecord,
  sourceRootPath: string,
  targetRootPath: string,
  options?: {
    resetIdentity?: boolean
    scriptKind?: ProjectScriptKind
    bank?: number | null
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
    resource.type === 'file' && resource.resourceType === 'script'
      ? (options?.scriptKind ?? resource.scriptKind)
      : undefined,
    {
      id: options?.resetIdentity ? randomUUID() : resource.id,
      bank: resource.type === 'file' ? (options?.bank ?? resource.bank) : null,
      createdAt: options?.resetIdentity ? now : resource.createdAt,
      updatedAt: now
    }
  )
}

function assertSupportedResourceKind(
  resourceType: ProjectResourceKind
): asserts resourceType is CreatableProjectResourceKind {
  void resourceType
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
        bank: resource.bank,
        ...(resource.resourceType === 'script'
          ? { scriptKind: resource.scriptKind }
          : { resourceType: resource.resourceType })
      }
}

// updates the bank for a resouce in the project file
export const updateProjectResourceBank = async (
  projectPath: string,
  resourceType: ProjectResourceKind,
  resourcePath: string,
  bank: number
): Promise<ProjectResourceMutationResult> => {
  assertSupportedResourceKind(resourceType)

  const state = await readProjectResourceState(projectPath)
  const normalizedResourcePath = normalizeResourcePath(resourcePath)
  const trackedResource = findTrackedResourceRecord(state.resources, normalizedResourcePath)

  if (!trackedResource) {
    throw new ProjectLauncherError('The selected resource could not be found.')
  }

  assertTrackedResourceType(trackedResource, resourceType)

  if (trackedResource.type !== 'file' || !isBankableAssetKind(trackedResource.resourceType)) {
    throw new ProjectLauncherError('The selected resource does not support ROM bank overrides.')
  }

  const nextBank = normalizeProjectResourceBank(bank)
  const now = new Date().toISOString()
  const nextResources = await writeProjectResources(
    state,
    state.resources.map((resource) => {
      if (resource.path !== normalizedResourcePath || resource.type !== 'file') {
        return resource
      }

      return buildStoredResourceRecord(
        resource.resourceType,
        resource.path,
        resource.resourceType === 'script' ? resource.scriptKind : undefined,
        {
          id: resource.id,
          bank: nextBank,
          createdAt: resource.createdAt,
          updatedAt: now
        }
      )
    })
  )

  return {
    view: buildProjectResourceView(state, nextResources, trackedResource.parentPath ?? ''),
    resourceType: trackedResource.resourceType,
    resourcePath: trackedResource.path,
    resourceName: trackedResource.name,
    parentPath: trackedResource.parentPath ?? '',
    bank: nextBank,
    ...(trackedResource.resourceType === 'script' ? { scriptKind: trackedResource.scriptKind } : {})
  }
}

export const updateProjectStartingScene = async (
  projectPath: string,
  scenePath: string | null
): Promise<ProjectResourceView> => {
  const state = await readProjectResourceState(projectPath)
  const nextStartingScenePath = normalizeStartingScenePath(scenePath)
  let sceneParentPath = ''

  if (nextStartingScenePath) {
    const trackedScene = findTrackedResourceRecord(state.resources, nextStartingScenePath)

    if (!trackedScene || trackedScene.type !== 'file' || trackedScene.resourceType !== 'scene') {
      throw new ProjectLauncherError('The selected starting scene could not be found.')
    }

    sceneParentPath = trackedScene.parentPath ?? ''
  }

  setStateStartingScenePath(state, nextStartingScenePath)
  await writeProjectResources(state, state.resources)

  return buildProjectResourceView(state, state.resources, sceneParentPath)
}

export const pruneMissingProjectResource = async (
  projectPath: string,
  resourcePath: string
): Promise<boolean> => {
  const state = await readProjectResourceState(projectPath)
  const result = await removeTrackedResourceSubtree(state, resourcePath)
  return result.removedCount > 0
}

// returns project resource view model for the specified path
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

export const listProjectScriptResources = async (
  projectPath: string,
  scriptKind?: ProjectScriptKind
): Promise<ProjectScriptRecord[]> => {
  const state = await readProjectResourceState(projectPath)

  return state.resources.filter((resource): resource is ProjectScriptRecord => {
    return (
      resource.type === 'file' &&
      resource.resourceType === 'script' &&
      (!scriptKind || resource.scriptKind === scriptKind)
    )
  })
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

// creates a script resource, ensuring the script parent folders exist, creates both source and header
// with the template for the type of script, and returns a record with the new resource metadata and the project view
// for the resource's parent folder
export const createProjectScriptResource = async (
  projectPath: string,
  scriptKind: ProjectScriptKind,
  resourceName?: string
): Promise<ProjectResourceMutationResult> => {
  const state = await readProjectResourceState(projectPath)
  const parentPath = PROJECT_SCRIPT_DIRECTORY_BY_KIND[scriptKind]
  const nextResourcesWithFolders = await ensureScriptParentFolders(
    state,
    `${parentPath}/${buildProjectScriptFileName(resourceName ?? `New ${PROJECT_SCRIPT_LABELS[scriptKind]}`)}`
  )
  const safeResourceName = resourceName
    ? normalizeCodeIdentifier(assertFolderName(resourceName))
    : normalizeCodeIdentifier(
        buildUniqueResourceName(nextResourcesWithFolders, parentPath, 'script')
      )
  assertUniqueTrackedFileName(nextResourcesWithFolders, safeResourceName)

  const { resourcePath } = await createProjectScriptFiles(projectPath, scriptKind, safeResourceName)
  const nextResources = await writeProjectResources(state, [
    ...nextResourcesWithFolders,
    buildStoredResourceRecord('script', resourcePath, scriptKind)
  ])

  return {
    view: buildProjectResourceView(state, nextResources, parentPath),
    resourceType: 'script',
    resourcePath,
    resourceName: safeResourceName,
    parentPath,
    bank: DEFAULT_PROJECT_RESOURCE_BANK,
    scriptKind
  }
}

// creates a project resource, creating the folder on disk if it's a folder, or creating a default asset document
// otherwise, updates the project JSON and returns a record with the new resource metadata and the project view
// for the resource's parent folder
export const createProjectResource = async (
  projectPath: string,
  resourceType: ProjectResourceKind,
  parentPath = '',
  resourceName?: string
): Promise<ProjectResourceMutationResult> => {
  assertSupportedResourceKind(resourceType)

  if (resourceType === 'script') {
    throw new ProjectLauncherError(
      'Use the dedicated script creation flow so the script type can be selected.'
    )
  }

  const state = await readProjectResourceState(projectPath)
  const normalizedParentPath = normalizeResourcePath(parentPath)
  await assertTrackedParentFolder(state, normalizedParentPath)

  const parentDirectory = resolveResourceDirectory(state.projectPath, normalizedParentPath)
  const safeResourceName = resourceName
    ? // assertFolderName also validates valid file names
      assertFolderName(resourceName)
    : buildUniqueResourceName(state.resources, normalizedParentPath, resourceType)
  if (resourceType !== 'folder') {
    assertUniqueTrackedFileName(state.resources, safeResourceName)
  }
  const targetResourceFileName = buildResourceFileName(resourceType, safeResourceName)
  const targetResourcePath = joinResourcePath(
    normalizeParentPath(normalizedParentPath),
    targetResourceFileName
  )

  await getProjectResourceTypeStrategy(resourceType).create({
    projectPath: state.projectPath,
    parentDirectory,
    resourceType,
    targetResourceFileName
  })

  const nextResources = await writeProjectResources(state, [
    ...state.resources,
    buildStoredResourceRecord(resourceType, targetResourcePath)
  ])

  return {
    view: buildProjectResourceView(state, nextResources, normalizedParentPath),
    resourceType,
    resourcePath: targetResourcePath,
    resourceName: safeResourceName,
    parentPath: normalizedParentPath,
    ...(resourceType !== 'folder' && isBankableAssetKind(resourceType)
      ? { bank: DEFAULT_PROJECT_RESOURCE_BANK }
      : {})
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

// renames a project resource on disk and updates the project JSON
// if renaming a folder, it also changes the paths of all descendants in the project JSON
// updates the starting scene path if it's the renamed resource or a descendant of it
// returns a record with the updated resource metadata and the project view for the resource's parent folder
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
  const normalizedResourceName =
    resourceType === 'script' ? normalizeCodeIdentifier(safeResourceName) : safeResourceName
  const parentPath = trackedResource.parentPath ?? ''
  if (resourceType !== 'folder') {
    assertUniqueTrackedFileName(state.resources, normalizedResourceName, [normalizedResourcePath])
  }
  const nextResourcePath = joinResourcePath(
    trackedResource.parentPath,
    buildResourceFileName(resourceType, normalizedResourceName)
  )

  if (nextResourcePath !== normalizedResourcePath) {
    await getProjectResourceTypeStrategy(resourceType).rename({
      projectPath: state.projectPath,
      resourcePath: normalizedResourcePath,
      nextResourcePath,
      resolveResourceDirectory
    })
  }

  const relocatedResources = state.resources.map((resource) =>
    isSameOrDescendantPath(resource.path, normalizedResourcePath)
      ? relocateTrackedResource(
          resource,
          normalizedResourcePath,
          nextResourcePath,
          trackedResource.type === 'file' && trackedResource.resourceType === 'script'
            ? { scriptKind: trackedResource.scriptKind }
            : undefined
        )
      : resource
  )
  setStateStartingScenePath(
    state,
    remapStartingScenePath(
      getStateStartingScenePath(state),
      normalizedResourcePath,
      nextResourcePath
    )
  )
  const persistedResources = await writeProjectResources(state, relocatedResources)

  return {
    view: buildProjectResourceView(state, persistedResources, parentPath),
    resourceType,
    resourcePath: nextResourcePath,
    resourceName: normalizedResourceName,
    parentPath,
    ...(trackedResource.type === 'file' ? { bank: trackedResource.bank } : {}),
    ...(trackedResource.type === 'file' && trackedResource.resourceType === 'script'
      ? { scriptKind: trackedResource.scriptKind }
      : {})
  }
}

export const deleteProjectFolder = async (
  projectPath: string,
  folderPath: string
): Promise<ProjectDeletedResourceResult> => {
  return deleteProjectResource(projectPath, 'folder', folderPath)
}

// moves a project resource to the delete container, as well as all its descendants if any
// and updates the project JSON to remove all the moved resources, including updating the starting scene path
// if it's the deleted resource or a descendant of it
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
  const currentStartingScenePath = getStateStartingScenePath(state)
  const metadata: StoredDeletedResourceMetadata = {
    deletionId: nextDeletionId,
    resourceType,
    resourcePath: normalizedResourcePath,
    resourceName: trackedResource.name,
    parentPath: trackedResource.parentPath ?? '',
    startingScenePath:
      currentStartingScenePath &&
      removedResources.some(
        (resource) =>
          resource.type === 'file' &&
          resource.resourceType === 'scene' &&
          resource.path === currentStartingScenePath
      )
        ? currentStartingScenePath
        : null,
    scriptKind:
      trackedResource.type === 'file' && trackedResource.resourceType === 'script'
        ? trackedResource.scriptKind
        : null,
    resources: removedResources
  }

  await writeDeletedResourceMetadata(state.projectPath, metadata)
  await getProjectResourceTypeStrategy(resourceType).moveToDeleted({
    projectPath: state.projectPath,
    resourcePath: normalizedResourcePath,
    deletedContentPath: getDeletedResourceContentPath(state.projectPath, nextDeletionId),
    resolveResourceDirectory
  })

  if (
    currentStartingScenePath &&
    isSameOrDescendantPath(currentStartingScenePath, normalizedResourcePath)
  ) {
    setStateStartingScenePath(state, null)
  }

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
    ...(trackedResource.type === 'file' ? { bank: trackedResource.bank } : {}),
    ...(metadata.scriptKind ? { scriptKind: metadata.scriptKind } : {}),
    deletionId: nextDeletionId
  }
}

// moves a deleted resource back to its original location, recreating the path if necessary
// updates the project JSON to add the restored resources back, updating the starting scene if necessary
export const restoreDeletedProjectResource = async (
  projectPath: string,
  deletionId: string
): Promise<ProjectResourceMutationResult> => {
  const state = await readProjectResourceState(projectPath)
  const metadata = await readDeletedResourceMetadata(state.projectPath, deletionId)
  const restoredRootResource = metadata.resources.find(
    (resource) => resource.path === metadata.resourcePath
  )

  assertSupportedResourceKind(metadata.resourceType)
  if (metadata.resourceType !== 'folder') {
    assertUniqueTrackedFileName(state.resources, metadata.resourceName)
  }

  await mkdir(resolveResourceDirectory(state.projectPath, metadata.parentPath), { recursive: true })

  await getProjectResourceTypeStrategy(metadata.resourceType).restoreFromDeleted({
    projectPath: state.projectPath,
    resourcePath: metadata.resourcePath,
    deletedContentPath: getDeletedResourceContentPath(state.projectPath, deletionId),
    resolveResourceDirectory
  })

  if (metadata.startingScenePath) {
    setStateStartingScenePath(state, metadata.startingScenePath)
  }

  const nextResources = await writeProjectResources(state, [
    ...state.resources,
    ...metadata.resources
  ])

  return {
    view: buildProjectResourceView(state, nextResources, metadata.parentPath),
    resourceType: metadata.resourceType,
    resourcePath: metadata.resourcePath,
    resourceName: metadata.resourceName,
    parentPath: metadata.parentPath,
    ...(restoredRootResource?.type === 'file' ? { bank: restoredRootResource.bank } : {}),
    ...(metadata.scriptKind ? { scriptKind: metadata.scriptKind } : {})
  }
}

// moves or copies a resource to a new location, ensuring the destination path is unique and retracks the 
// resource and its descendants
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

  const resourceTypeStrategy = getProjectResourceTypeStrategy(resourceType)
  const sourceAbsolutePath = resolveResourceDirectory(state.projectPath, normalizedResourcePath)
  const sourceStats = await resourceTypeStrategy.readTransferSourceStats({
    projectPath: state.projectPath,
    resourcePath: normalizedResourcePath,
    sourceAbsolutePath
  })

  const target = buildUniqueTransferredResourceTarget(
    state.resources,
    normalizedDestinationParentPath,
    resourceType,
    normalizedResourcePath,
    mode === 'move' ? [normalizedResourcePath] : []
  )
  if (resourceType !== 'folder') {
    assertUniqueTrackedFileName(state.resources, target.resourceName, [normalizedResourcePath])
  }
  const targetAbsolutePath = resolveResourceDirectory(state.projectPath, target.resourcePath)

  await resourceTypeStrategy.transfer({
    projectPath: state.projectPath,
    resourcePath: normalizedResourcePath,
    targetResourcePath: target.resourcePath,
    mode,
    sourceAbsolutePath,
    targetAbsolutePath,
    sourceStats
  })

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

  if (mode === 'move') {
    setStateStartingScenePath(
      state,
      remapStartingScenePath(
        getStateStartingScenePath(state),
        normalizedResourcePath,
        target.resourcePath
      )
    )
  }

  const persistedResources = await writeProjectResources(state, nextResources)

  return {
    view: buildProjectResourceView(state, persistedResources, normalizedDestinationParentPath),
    resourceType,
    resourcePath: target.resourcePath,
    resourceName: target.resourceName,
    parentPath: normalizedDestinationParentPath,
    ...(trackedResource.type === 'file' ? { bank: trackedResource.bank } : {}),
    ...(trackedResource.type === 'file' && trackedResource.resourceType === 'script'
      ? { scriptKind: trackedResource.scriptKind }
      : {})
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
