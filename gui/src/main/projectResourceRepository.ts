import { randomUUID } from 'crypto'
import { readdir, readFile, writeFile } from 'fs/promises'
import { basename } from 'path'
import { validateProjectDirectory } from './projectLauncher'
import { ProjectLauncherError } from './projectLauncherPrimitives'
import {
  getProjectAssetDisplayName,
  getProjectAssetKindFromFileName,
  type ProjectAssetKind
} from '../shared/projectAssets'
import { DEFAULT_PROJECT_RESOURCE_BANK } from '../shared/projectResourceModels'
import {
  getProjectScriptDisplayName,
  getProjectScriptKindFromPath,
  isProjectScriptSourcePath,
  type ProjectScriptKind
} from '../shared/projectScripts'
import {
  normalizeParentPath,
  normalizeProjectResourceBank,
  normalizeResourcePath,
  resolvePathWithinProject
} from './projectResourcePaths'
import {
  buildStoredAssetRecord,
  buildStoredFolderRecord,
  buildStoredScriptRecord,
  isBankableAssetKind,
  sortResources
} from './projectResourceRecords'
import { getResourceParentPath, normalizeStartingScenePath } from './projectResourceView'
import type { ProjectFolderRecord, ProjectStoredResourceRecord } from './projectResourceTypes'

interface StoredProjectFile extends Record<string, unknown> {
  name?: string
  createdAt?: string
  startingScenePath?: unknown
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

export interface ProjectResourceState {
  jsonPath: string
  projectFile: StoredProjectFile
  projectName: string
  projectPath: string
  resources: ProjectStoredResourceRecord[]
}

const INTERNAL_HISTORY_DIRECTORY = '.retrogbfull-history'
const MANAGED_ENGINE_ROOT_ENTRIES = new Set(['src', 'res', 'obj', 'Makefile'])

export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const isInternalProjectEntry = (entryName: string): boolean => {
  return entryName === INTERNAL_HISTORY_DIRECTORY
}

const isManagedEngineRootEntry = (currentPath: string, entryName: string): boolean => {
  return currentPath.length === 0 && MANAGED_ENGINE_ROOT_ENTRIES.has(entryName)
}

const joinResourcePath = (parentPath: string | null, childName: string): string => {
  const normalizedParentPath = normalizeParentPath(parentPath)
  return normalizedParentPath ? `${normalizedParentPath}/${childName}` : childName
}

const resolveResourceDirectory = (projectPath: string, resourcePath: string): string => {
  return resolvePathWithinProject(
    projectPath,
    resourcePath,
    'The selected folder is outside the project directory.'
  )
}

const isStoredResourceKind = (value: string): value is 'folder' | 'file' => {
  return value === 'folder' || value === 'file'
}

const isTrackedAssetKind = (value: string): value is ProjectAssetKind => {
  return (
    value === 'sprite' ||
    value === 'tileset' ||
    value === 'tilemap' ||
    value === 'window' ||
    value === 'scene' ||
    value === 'actor' ||
    value === 'music'
  )
}

const isTrackedScriptKind = (value: string): value is ProjectScriptKind => {
  return value === 'actor' || value === 'scene' || value === 'general'
}

// parses legacy folders (folders used to be special resources)
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

// tries to parse a JSON item into a project resource record
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

  // determine the type of resource
  const explicitResourceType =
    typeof value.resourceType === 'string' &&
    (isTrackedAssetKind(value.resourceType) || value.resourceType === 'script')
      ? value.resourceType
      : null
  const derivedResourceType = getProjectAssetKindFromFileName(basename(normalizedPath))
  const derivedScriptKind = isProjectScriptSourcePath(normalizedPath)
    ? getProjectScriptKindFromPath(normalizedPath)
    : null
  const resourceType =
    explicitResourceType ?? derivedResourceType ?? (derivedScriptKind ? 'script' : null)

  if (!resourceType) {
    return null
  }
  // build record differently based on whether it's a script or an asset
  if (resourceType === 'script') {
    const scriptKind =
      typeof value.scriptKind === 'string' && isTrackedScriptKind(value.scriptKind)
        ? value.scriptKind
        : derivedScriptKind

    if (!scriptKind) {
      return null
    }

    return {
      type: 'file',
      id,
      name:
        typeof value.name === 'string' && value.name.length > 0
          ? value.name
          : getProjectScriptDisplayName(basename(normalizedPath)),
      path: normalizedPath,
      parentPath:
        normalizeParentPath(value.parentPath as string | null | undefined) ??
        getResourceParentPath(normalizedPath),
      resourceType: 'script',
      scriptKind,
      bank: normalizeProjectResourceBank(value.bank),
      createdAt,
      updatedAt
    }
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
    bank: isBankableAssetKind(resourceType) ? normalizeProjectResourceBank(value.bank) : null,
    createdAt,
    updatedAt
  }
}

export const parseStoredResources = (value: unknown): ProjectStoredResourceRecord[] => {
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

// writes the project JSON file with the provided resources
const writeProjectFile = async (
  jsonPath: string,
  projectFile: StoredProjectFile,
  resources: ProjectStoredResourceRecord[]
): Promise<void> => {
  const resourcesSection = isRecord(projectFile.resources) ? projectFile.resources : {}
  const remainingResourcesSection = { ...resourcesSection }
  const startingScenePath = normalizeStartingScenePath(projectFile.startingScenePath)
  // folders are now regular resources
  delete remainingResourcesSection.folders
  const nextProjectFile: StoredProjectFile = {
    ...projectFile,
    startingScenePath,
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
              ...(resource.resourceType === 'script' ? { scriptKind: resource.scriptKind } : {}),
              ...(resource.bank !== null && resource.bank !== DEFAULT_PROJECT_RESOURCE_BANK
                ? { bank: resource.bank }
                : {}),
              createdAt: resource.createdAt,
              updatedAt: resource.updatedAt
            }
      )
    }
  }

  await writeFile(jsonPath, `${JSON.stringify(nextProjectFile, null, 2)}\n`, 'utf-8')
}

// scans project directory for untracked resources, building records for them and migrating legacy folders
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
      if (
        entry.name === `${basename(projectPath)}.json` ||
        isInternalProjectEntry(entry.name) ||
        isManagedEngineRootEntry(currentPath, entry.name)
      ) {
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
      continue
    }

    if (isProjectScriptSourcePath(resourcePath)) {
      const scriptKind = getProjectScriptKindFromPath(resourcePath)

      if (scriptKind) {
        resources.push(buildStoredScriptRecord(resourcePath, scriptKind))
      }
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

// reads the project JSON file and returns project resources, migrating from legacy format if necessary
export const readProjectResourceState = async (
  projectPath: string
): Promise<ProjectResourceState> => {
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

// sorts resources and writes the project JSON with the updated resources
export const writeProjectResources = async (
  state: ProjectResourceState,
  resources: ProjectStoredResourceRecord[]
): Promise<ProjectStoredResourceRecord[]> => {
  const sortedResources = sortResources(resources)
  await writeProjectFile(state.jsonPath, state.projectFile, sortedResources)
  return sortedResources
}
