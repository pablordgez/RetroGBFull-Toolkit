import { stat } from 'fs/promises'
import { dirname, join } from 'path'
import { ProjectLauncherError } from './projectLauncher'
import type { CopyEngineCoreResult } from '../shared/projectCodeWorkspace'
import {
  cleanupBundledDirectoryInTarget,
  copyBundledDirectoryIntoTarget,
  ensureProjectDirectory,
  getBundledCorePath,
  getBundledGbdkPath,
  IGNORED_BUNDLED_CORE_ROOT_DIRECTORIES
} from './projectCodeShared'
import { writeGeneratedScriptEnvironment } from './projectCodeScripts'

export const copyBundledEngineCore = async (projectPath: string): Promise<CopyEngineCoreResult> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const bundledCorePath = getBundledCorePath()

  await cleanupBundledDirectoryInTarget(
    bundledCorePath,
    normalizedProjectPath,
    IGNORED_BUNDLED_CORE_ROOT_DIRECTORIES
  )

  const { copiedPaths, skippedPaths } = await copyBundledDirectoryIntoTarget(
    bundledCorePath,
    normalizedProjectPath,
    IGNORED_BUNDLED_CORE_ROOT_DIRECTORIES
  )

  await writeGeneratedScriptEnvironment(normalizedProjectPath)

  return {
    copiedPaths,
    skippedPaths
  }
}

// checks if the bundled GBDK is available and copies it into the project if it's not already there
export const ensureBundledGbdkAvailableForProject = async (
  projectPath: string
): Promise<{ copiedPaths: string[]; skippedPaths: string[] }> => {
  const bundledGbdkPath = getBundledGbdkPath()
  const projectParentPath = dirname(projectPath)
  const targetGbdkPath = join(projectParentPath, 'gbdk')

  try {
    const bundledGbdkStats = await stat(bundledGbdkPath)

    if (!bundledGbdkStats.isDirectory()) {
      throw new ProjectLauncherError('The bundled GBDK directory could not be found.')
    }
  } catch {
    throw new ProjectLauncherError('The bundled GBDK directory could not be found.')
  }

  return copyBundledDirectoryIntoTarget(bundledGbdkPath, targetGbdkPath)
}
