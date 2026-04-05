import { readFile, stat, writeFile } from 'fs/promises'
import { basename, isAbsolute, relative, resolve } from 'path'
import { ProjectLauncherError, validateProjectDirectory } from './projectLauncher'
import { getTrackedProjectResource, pruneMissingProjectResource } from './projectResources'
import {
  ProjectAssetDocument,
  ProjectAssetKind,
  getProjectAssetKindFromFileName,
  parseProjectAssetDocument,
  serializeProjectAssetDocument
} from '../shared/projectAssets'

const normalizeResourcePath = (resourcePath: string): string => {
  return resourcePath.replace(/\\/g, '/')
}

const resolveAssetPathWithinProject = (projectPath: string, resourcePath: string): string => {
  const absolutePath = resolve(projectPath, resourcePath || '.')
  const relativePath = relative(projectPath, absolutePath)

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new ProjectLauncherError('The selected asset is outside the project directory.')
  }

  return absolutePath
}

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

export const loadProjectAssetFile = async (
  projectPath: string,
  resourcePath: string
): Promise<ProjectAssetFilePayload> => {
  const resolvedAsset = await ensureProjectAssetFileAvailable(projectPath, resourcePath)
  const rawContent = await readFile(resolvedAsset.absolutePath, 'utf-8')
  const document = parseProjectAssetDocument(JSON.parse(rawContent))

  if (document.kind !== resolvedAsset.assetKind) {
    throw new ProjectLauncherError('The asset file type does not match its extension.')
  }

  return {
    assetKind: resolvedAsset.assetKind,
    resourcePath,
    document
  }
}

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
