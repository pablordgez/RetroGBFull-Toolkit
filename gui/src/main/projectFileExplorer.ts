import { stat } from 'fs/promises'
import { shell } from 'electron'
import { ProjectLauncherError, validateProjectDirectory } from './projectLauncher'
import { normalizeResourcePath, resolvePathWithinProject } from './projectResourcePaths'
import { getTrackedProjectResource } from './projectResources'

const PROJECT_LOAD_ERROR_MESSAGE = 'The selected project could not be loaded.'
const RESOURCE_NOT_FOUND_ERROR_MESSAGE = 'The selected resource could not be found.'

const assertShellOpenPathSucceeded = async (targetPath: string): Promise<void> => {
  const openResult = await shell.openPath(targetPath)

  if (openResult) {
    throw new Error(openResult)
  }
}

const validateProjectPath = async (projectPath: string): Promise<string> => {
  const validation = await validateProjectDirectory(projectPath)

  if (!validation.isValid) {
    throw new ProjectLauncherError(validation.message ?? PROJECT_LOAD_ERROR_MESSAGE)
  }

  return validation.path
}

export const openProjectInFileExplorer = async (projectPath: string): Promise<boolean> => {
  const validatedProjectPath = await validateProjectPath(projectPath)
  await assertShellOpenPathSucceeded(validatedProjectPath)
  return true
}

export const showProjectResourceInFileExplorer = async (
  projectPath: string,
  resourcePath: string
): Promise<boolean> => {
  const validatedProjectPath = await validateProjectPath(projectPath)
  const normalizedResourcePath = normalizeResourcePath(resourcePath)

  if (!normalizedResourcePath) {
    throw new ProjectLauncherError(RESOURCE_NOT_FOUND_ERROR_MESSAGE)
  }

  const trackedResource = await getTrackedProjectResource(validatedProjectPath, normalizedResourcePath)

  if (!trackedResource) {
    throw new ProjectLauncherError(RESOURCE_NOT_FOUND_ERROR_MESSAGE)
  }

  const absolutePath = resolvePathWithinProject(
    validatedProjectPath,
    normalizedResourcePath,
    'The selected resource is outside the project directory.'
  )

  let resourceStats

  try {
    resourceStats = await stat(absolutePath)
  } catch (error) {
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined

    if (errorCode === 'ENOENT') {
      throw new ProjectLauncherError(RESOURCE_NOT_FOUND_ERROR_MESSAGE)
    }

    throw error
  }

  if (trackedResource.type === 'folder') {
    if (!resourceStats.isDirectory()) {
      throw new ProjectLauncherError(RESOURCE_NOT_FOUND_ERROR_MESSAGE)
    }

    await assertShellOpenPathSucceeded(absolutePath)
    return true
  }

  if (!resourceStats.isFile()) {
    throw new ProjectLauncherError(RESOURCE_NOT_FOUND_ERROR_MESSAGE)
  }

  shell.showItemInFolder(absolutePath)
  return true
}
