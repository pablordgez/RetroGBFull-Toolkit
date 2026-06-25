import { basename, extname } from 'path'
import { getProjectAssetKindFromFileName } from '../shared/projectAssets'
import { normalizeParentPath, normalizeResourcePath } from './projectResourcePaths'
import type {
  ProjectAssetRecord,
  ProjectResourceItem,
  ProjectResourceView,
  ProjectStoredResourceRecord,
  ProjectFolderRecord,
  ProjectScriptRecord
} from './projectResourceTypes'

interface ProjectResourceViewState {
  projectName: string
  projectPath: string
  projectFile: {
    startingScenePath?: unknown
  }
}

export const normalizeStartingScenePath = (value: unknown): string | null => {
  const normalizedPath = normalizeResourcePath(typeof value === 'string' ? value : '')

  if (!normalizedPath || getProjectAssetKindFromFileName(basename(normalizedPath)) !== 'scene') {
    return null
  }

  return normalizedPath
}

export const getResourceParentPath = (resourcePath: string): string | null => {
  const normalizedPath = normalizeResourcePath(resourcePath)

  if (!normalizedPath) {
    return null
  }

  const pathSegments = normalizedPath.split('/')
  pathSegments.pop()

  return pathSegments.length > 0 ? pathSegments.join('/') : null
}

export const isSameOrDescendantPath = (
  resourcePath: string,
  potentialAncestorPath: string
): boolean => {
  return (
    resourcePath === potentialAncestorPath || resourcePath.startsWith(`${potentialAncestorPath}/`)
  )
}

const hasScriptDescendant = (
  folder: ProjectFolderRecord,
  resources: ProjectStoredResourceRecord[]
): boolean => {
  return resources.some(
    (resource) =>
      resource.type === 'file' &&
      resource.resourceType === 'script' &&
      isSameOrDescendantPath(resource.path, folder.path)
  )
}

const buildFolderItem = (
  resource: ProjectFolderRecord,
  resources: ProjectStoredResourceRecord[]
): ProjectResourceItem => {
  return {
    type: 'folder',
    id: resource.id,
    name: resource.name,
    path: resource.path,
    parentPath: resource.parentPath,
    hasScriptDescendants: hasScriptDescendant(resource, resources)
  }
}

const buildFileItem = (resource: ProjectAssetRecord | ProjectScriptRecord): ProjectResourceItem => {
  const fileName = basename(resource.path)

  return {
    type: 'file',
    id: resource.id,
    name: resource.name,
    fileName,
    path: resource.path,
    parentPath: resource.parentPath,
    extension: extname(fileName).slice(1) || null,
    resourceType: resource.resourceType === 'script' ? null : resource.resourceType,
    bank: resource.bank,
    ...(resource.resourceType === 'script' ? { scriptKind: resource.scriptKind } : {})
  }
}

export const getStateStartingScenePath = (
  state: Pick<ProjectResourceViewState, 'projectFile'>
): string | null => {
  return normalizeStartingScenePath(state.projectFile.startingScenePath)
}

export const setStateStartingScenePath = (
  state: Pick<ProjectResourceViewState, 'projectFile'>,
  startingScenePath: string | null
): void => {
  state.projectFile.startingScenePath = normalizeStartingScenePath(startingScenePath)
}

// if the current starting scene path is the same or a descendant of the source root, returns the current path
// remapped to a relative path from the target root instead
export const remapStartingScenePath = (
  currentStartingScenePath: string | null,
  sourceRootPath: string,
  targetRootPath: string
): string | null => {
  if (
    !currentStartingScenePath ||
    !isSameOrDescendantPath(currentStartingScenePath, sourceRootPath)
  ) {
    return currentStartingScenePath
  }

  return currentStartingScenePath === sourceRootPath
    ? targetRootPath
    : `${targetRootPath}${currentStartingScenePath.slice(sourceRootPath.length)}`
}

// returns project metadata including resources in the specified path
export const buildProjectResourceView = (
  state: ProjectResourceViewState,
  resources: ProjectStoredResourceRecord[],
  currentPath = ''
): ProjectResourceView => {
  const normalizedCurrentPath = normalizeResourcePath(currentPath)
  const expectedParentPath = normalizeParentPath(normalizedCurrentPath)
  const items = resources
    .filter((resource) => resource.parentPath === expectedParentPath)
    .map((resource) =>
      resource.type === 'folder' ? buildFolderItem(resource, resources) : buildFileItem(resource)
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
    startingScenePath: getStateStartingScenePath(state),
    items
  }
}
