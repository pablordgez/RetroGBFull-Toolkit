import { readdir, readFile, stat } from 'fs/promises'
import { basename } from 'path'
import { getProjectAssetKindFromFileName, parseProjectAssetDocument } from '../shared/projectAssets'
import {
  buildProjectScriptHeaderFileName,
  getProjectScriptDisplayName,
  getProjectScriptKindFromPath,
  isProjectScriptSourcePath
} from '../shared/projectScripts'
import { scriptFilesExist } from './projectCode'
import { normalizeParentPath } from './projectResourcePaths'
import {
  buildStoredAssetRecord,
  buildStoredFolderRecord,
  buildStoredScriptRecord
} from './projectResourceRecords'
import {
  type ProjectResourceState,
  readProjectResourceState,
  writeProjectResources
} from './projectResourceRepository'
import {
  getResourceParentPath,
  getStateStartingScenePath,
  isSameOrDescendantPath,
  setStateStartingScenePath
} from './projectResourceView'
import type { ProjectDirectoryScanResult, ProjectStoredResourceRecord } from './projectResourceTypes'
import { resolveResourceDirectory } from './projectResourceFilesystem'

const INTERNAL_HISTORY_DIRECTORY = '.retrogbfull-history'
const MANAGED_ENGINE_ROOT_ENTRIES = new Set(['src', 'res', 'obj', 'Makefile'])

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

    if (resourceType && !trackedPaths.has(resourcePath)) {
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

    if (!isProjectScriptSourcePath(resourcePath) || trackedPaths.has(resourcePath)) {
      continue
    }

    const scriptKind = getProjectScriptKindFromPath(resourcePath)

    if (!scriptKind) {
      continue
    }

    try {
      await stat(resolveResourceDirectory(projectPath, resourcePath))
      await stat(
        resolveResourceDirectory(
          projectPath,
          joinResourcePath(
            getResourceParentPath(resourcePath),
            buildProjectScriptHeaderFileName(getProjectScriptDisplayName(entry.name))
          )
        )
      )
      trackedPaths.add(resourcePath)
      discoveredResources.push(buildStoredScriptRecord(resourcePath, scriptKind))
    } catch {
      continue
    }
  }

  return discoveredResources
}

const hasMissingAncestorPath = (resourcePath: string, missingRootPaths: Set<string>): boolean => {
  for (const missingRootPath of missingRootPaths) {
    if (isSameOrDescendantPath(resourcePath, missingRootPath)) {
      return true
    }
  }

  return false
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

    if (resource.type === 'file' && resource.resourceType === 'script') {
      if (await scriptFilesExist(state.projectPath, resource.path)) {
        existingResources.push(resource)
      } else {
        missingRootPaths.add(resource.path)
        removedCount += 1
      }

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

  const currentStartingScenePath = getStateStartingScenePath(state)

  if (
    currentStartingScenePath &&
    !existingResources.some(
      (resource) =>
        resource.type === 'file' &&
        resource.resourceType === 'scene' &&
        resource.path === currentStartingScenePath
    )
  ) {
    setStateStartingScenePath(state, null)
  }

  const persistedResources = await writeProjectResources(state, existingResources)
  return {
    resources: persistedResources,
    removedCount
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
