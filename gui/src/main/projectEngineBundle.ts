import { stat } from 'fs/promises'
import { dirname, join } from 'path'
import { ProjectLauncherError } from './projectLauncher'
import type { CopyEngineCoreResult } from '../shared/projectCodeWorkspace'
import {
  copyBundledDirectoryIntoTarget,
  ensureProjectDirectory,
  getBundledCorePath,
  getBundledGbdkPath,
  IGNORED_BUNDLED_CORE_ROOT_DIRECTORIES
} from './projectCodeShared'
import { writeGeneratedScriptEnvironment } from './projectCodeScripts'
import { withProjectCoreFileOperation } from './projectCoreFileOperations'

export const copyBundledEngineCore = async (projectPath: string): Promise<CopyEngineCoreResult> => {
  return withProjectCoreFileOperation(projectPath, async () => {
    const normalizedProjectPath = await ensureProjectDirectory(projectPath)
    const bundledCorePath = getBundledCorePath()

    const { copiedPaths, skippedPaths } = await copyBundledDirectoryIntoTarget(
      bundledCorePath,
      normalizedProjectPath,
      IGNORED_BUNDLED_CORE_ROOT_DIRECTORIES,
      { overwriteExisting: true }
    )

    await writeGeneratedScriptEnvironment(normalizedProjectPath)

    return {
      copiedPaths,
      skippedPaths
    }
  })
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
