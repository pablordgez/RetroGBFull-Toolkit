import { readFile, stat, writeFile } from 'fs/promises'
import { basename } from 'path'
import { ProjectLauncherError, validateProjectDirectory } from './projectLauncher'
import { getTrackedProjectResource, pruneMissingProjectResource } from './projectResources'
import { normalizeResourcePath, resolvePathWithinProject } from './projectResourcePaths'
import {
  ProjectAssetDocument,
  ProjectAssetKind,
  getProjectAssetKindFromFileName,
  parseProjectAssetDocument,
  serializeProjectAssetDocument
} from '../shared/projectAssets'

// check if resource is within project and return its absolute path
const resolveAssetPathWithinProject = (projectPath: string, resourcePath: string): string => {
  return resolvePathWithinProject(
    projectPath,
    resourcePath,
    'The selected asset is outside the project directory.'
  )
}

// checks if the asset file exists and is tracked in the project, and returns it if so
const resolveProjectAssetPath = async (
  projectPath: string,
  resourcePath: string
): Promise<{
  projectPath: string
  absolutePath: string
  fileName: string
  assetKind: ProjectAssetKind
  trackedName: string
}> => {
  const validation = await validateProjectDirectory(projectPath)

  if (!validation.isValid) {
    throw new ProjectLauncherError(validation.message ?? 'The selected project could not be loaded.')
  }

  const normalizedResourcePath = normalizeResourcePath(resourcePath)
  const absolutePath = resolveAssetPathWithinProject(validation.path, normalizedResourcePath)
  const fileName = basename(absolutePath)
  const assetKind = getProjectAssetKindFromFileName(fileName)
  const trackedResource = await getTrackedProjectResource(validation.path, normalizedResourcePath)

  if (!assetKind) {
    throw new ProjectLauncherError('The selected file is not a supported asset.')
  }

  if (
    !trackedResource
    || trackedResource.type !== 'file'
    || trackedResource.resourceType !== assetKind
  ) {
    throw new ProjectLauncherError('The selected asset is not tracked in this project.')
  }

  return {
    projectPath: validation.path,
    absolutePath,
    fileName,
    assetKind,
    trackedName: trackedResource.name
  }
}

// checks if an asset file exists at the given path, if not, removes it from project tracking
export const ensureProjectAssetFileAvailable = async (
  projectPath: string,
  resourcePath: string
): Promise<{
  projectPath: string
  absolutePath: string
  fileName: string
  assetKind: ProjectAssetKind
  trackedName: string
}> => {
  const resolvedAsset = await resolveProjectAssetPath(projectPath, resourcePath)

  try {
    const fileStats = await stat(resolvedAsset.absolutePath)

    if (!fileStats.isFile()) {
      await pruneMissingProjectResource(resolvedAsset.projectPath, resourcePath)
      throw new ProjectLauncherError(
        `The asset "${resolvedAsset.trackedName}" could not be found, so it was removed from the project.`
      )
    }
  } catch (error) {
    const errorCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined

    if (errorCode === 'ENOENT') {
      await pruneMissingProjectResource(resolvedAsset.projectPath, resourcePath)
      throw new ProjectLauncherError(
        `The asset "${resolvedAsset.trackedName}" could not be found, so it was removed from the project.`
      )
    }

    if (error instanceof ProjectLauncherError) {
      throw error
    }

    throw error
  }

  return resolvedAsset
}

export interface ProjectAssetFilePayload {
  assetKind: ProjectAssetKind
  resourcePath: string
  document: ProjectAssetDocument
}

const parseAssetDocumentForLoad = (
  rawContent: string,
  trackedName: string
): ProjectAssetDocument => {
  try {
    const parsedContent = JSON.parse(rawContent)

    try {
      return parseProjectAssetDocument(parsedContent)
    } catch {
      throw new ProjectLauncherError(
        `The asset "${trackedName}" has invalid data and could not be loaded.`
      )
    }
  } catch (error) {
    if (error instanceof ProjectLauncherError) {
      throw error
    }

    throw new ProjectLauncherError(
      `The asset "${trackedName}" has invalid JSON and could not be loaded.`
    )
  }
}

// reads the content of the asset file, casts it to a document type and if its type matches the expected type, returns it
export const loadProjectAssetFile = async (
  projectPath: string,
  resourcePath: string
): Promise<ProjectAssetFilePayload> => {
  const resolvedAsset = await ensureProjectAssetFileAvailable(projectPath, resourcePath)
  const rawContent = await readFile(resolvedAsset.absolutePath, 'utf-8')
  const document = parseAssetDocumentForLoad(rawContent, resolvedAsset.trackedName)

  if (document.kind !== resolvedAsset.assetKind) {
    throw new ProjectLauncherError('The asset file type does not match its extension.')
  }

  return {
    assetKind: resolvedAsset.assetKind,
    resourcePath,
    document
  }
}

// if the asset file already exists, checks if its type matches the document type and if so, overwrites it with the new version
export const saveProjectAssetFile = async (
  projectPath: string,
  resourcePath: string,
  document: ProjectAssetDocument
): Promise<ProjectAssetFilePayload> => {
  const resolvedAsset = await ensureProjectAssetFileAvailable(projectPath, resourcePath)

  if (document.kind !== resolvedAsset.assetKind) {
    throw new ProjectLauncherError('The asset data does not match the target file type.')
  }

  await writeFile(resolvedAsset.absolutePath, serializeProjectAssetDocument(document), 'utf-8')

  return {
    assetKind: resolvedAsset.assetKind,
    resourcePath,
    document
  }
}
