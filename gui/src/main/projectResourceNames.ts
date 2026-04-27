import { basename } from 'path'
import { ProjectLauncherError, isValidProjectName } from './projectLauncher'
import { getProjectAssetDisplayName } from '../shared/projectAssets'
import { normalizeCodeIdentifier } from '../shared/codeIdentifiers'
import { getProjectScriptDisplayName } from '../shared/projectScripts'
import { normalizeParentPath, normalizeResourcePath } from './projectResourcePaths'
import { type CreatableProjectResourceKind, buildResourceFileName } from './projectResourceRecords'
import type { ProjectStoredResourceRecord } from './projectResourceTypes'

const joinResourcePath = (parentPath: string | null, childName: string): string => {
  const normalizedParentPath = normalizeParentPath(parentPath)
  return normalizedParentPath ? `${normalizedParentPath}/${childName}` : childName
}

export const assertFolderName = (folderName: string): string => {
  const trimmedFolderName = folderName.trim()

  if (!isValidProjectName(trimmedFolderName)) {
    throw new ProjectLauncherError(
      'Please enter a valid folder name. Avoid empty names and reserved filename characters.'
    )
  }

  return trimmedFolderName
}

const normalizeResourceNameForComparison = (
  resourceType: Exclude<CreatableProjectResourceKind, 'folder'>,
  resourceName: string
): string => {
  const trimmedResourceName = resourceName.trim()

  return resourceType === 'script'
    ? normalizeCodeIdentifier(trimmedResourceName).toLowerCase()
    : trimmedResourceName.toLowerCase()
}

const buildIndexedResourceName = (
  resourceType: Exclude<CreatableProjectResourceKind, 'folder'>,
  baseName: string,
  suffix: number
): string => {
  return resourceType === 'script'
    ? normalizeCodeIdentifier(`${baseName}_${suffix}`)
    : `${baseName} ${suffix}`
}

export const assertUniqueTrackedFileName = (
  resources: ProjectStoredResourceRecord[],
  resourceName: string,
  excludedPaths: string[] = []
): void => {
  const normalizedName = resourceName.trim().toLowerCase()
  const excludedPathSet = new Set(excludedPaths.map((path) => normalizeResourcePath(path)))
  const conflictingResource = resources.find((resource) => {
    if (resource.type !== 'file' || excludedPathSet.has(resource.path)) {
      return false
    }

    return resource.name.trim().toLowerCase() === normalizedName
  })

  if (conflictingResource) {
    throw new ProjectLauncherError(
      `A resource named "${resourceName}" already exists elsewhere in the project.`
    )
  }
}

// builds a unique default resource name, with the default name being based on resource type
// it checks for global conflicts and keeps adding to a suffix index until it finds a unique name
export const buildUniqueResourceName = (
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
      : resourceType === 'script'
        ? 'New_Script'
        : `New ${resourceType[0].toUpperCase()}${resourceType.slice(1)}`
  const buildTargetName = (candidateName: string): string =>
    buildResourceFileName(resourceType, candidateName)
  const hasGlobalFileNameConflict = (candidateName: string): boolean => {
    const normalizedCandidateName =
      resourceType === 'folder'
        ? candidateName.trim().toLowerCase()
        : normalizeResourceNameForComparison(resourceType, candidateName)

    return resources.some(
      (resource) =>
        resource.type === 'file' &&
        normalizeResourceNameForComparison(resource.resourceType, resource.name) ===
          normalizedCandidateName
    )
  }

  if (
    !siblingNames.has(buildTargetName(baseName)) &&
    (resourceType === 'folder' || !hasGlobalFileNameConflict(baseName))
  ) {
    return baseName
  }

  let suffix = 2
  let nextResourceName =
    resourceType === 'folder'
      ? `${baseName} ${suffix}`
      : buildIndexedResourceName(resourceType, baseName, suffix)

  while (
    siblingNames.has(buildTargetName(nextResourceName)) ||
    (resourceType !== 'folder' && hasGlobalFileNameConflict(nextResourceName))
  ) {
    suffix += 1
    nextResourceName =
      resourceType === 'folder'
        ? `${baseName} ${suffix}`
        : buildIndexedResourceName(resourceType, baseName, suffix)
  }

  return nextResourceName
}

// builds a resource name for a resource that is being transferred, basde on the original name but changing it
// if there are global conflicts or local conflicts at the target location
export const buildUniqueTransferredResourceTarget = (
  resources: ProjectStoredResourceRecord[],
  parentPath: string,
  resourceType: CreatableProjectResourceKind,
  sourcePath: string,
  excludedPaths: string[] = []
): { resourceName: string; resourcePath: string } => {
  const normalizedParentPath = normalizeParentPath(parentPath)
  const excludedPathSet = new Set(excludedPaths.map((path) => normalizeResourcePath(path)))
  const siblingNames = new Set(
    resources
      .filter((resource) => resource.parentPath === normalizedParentPath)
      .map((resource) => basename(resource.path))
  )
  const sourceEntryName = basename(sourcePath)
  const baseResourceName =
    resourceType === 'folder'
      ? sourceEntryName
      : resourceType === 'script'
        ? normalizeCodeIdentifier(getProjectScriptDisplayName(sourceEntryName))
        : getProjectAssetDisplayName(sourceEntryName)
  const hasGlobalNameConflict = (candidateName: string): boolean => {
    const normalizedCandidateName =
      resourceType === 'folder'
        ? candidateName.trim().toLowerCase()
        : normalizeResourceNameForComparison(resourceType, candidateName)

    return resources.some(
      (resource) =>
        resource.type === 'file' &&
        !excludedPathSet.has(resource.path) &&
        normalizeResourceNameForComparison(resource.resourceType, resource.name) ===
          normalizedCandidateName
    )
  }

  if (
    !siblingNames.has(sourceEntryName) &&
    (resourceType === 'folder' || !hasGlobalNameConflict(baseResourceName))
  ) {
    return {
      resourceName: baseResourceName,
      resourcePath: joinResourcePath(normalizedParentPath, sourceEntryName)
    }
  }

  let suffix = 2
  let nextResourceName =
    resourceType === 'folder'
      ? `${baseResourceName} ${suffix}`
      : buildIndexedResourceName(resourceType, baseResourceName, suffix)
  let nextEntryName = buildResourceFileName(resourceType, nextResourceName)

  while (
    siblingNames.has(nextEntryName) ||
    (resourceType !== 'folder' && hasGlobalNameConflict(nextResourceName))
  ) {
    suffix += 1
    nextResourceName =
      resourceType === 'folder'
        ? `${baseResourceName} ${suffix}`
        : buildIndexedResourceName(resourceType, baseResourceName, suffix)
    nextEntryName = buildResourceFileName(resourceType, nextResourceName)
  }

  return {
    resourceName: nextResourceName,
    resourcePath: joinResourcePath(normalizedParentPath, nextEntryName)
  }
}
