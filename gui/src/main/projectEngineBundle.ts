import { readFile, stat, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { ProjectLauncherError } from './projectLauncherPrimitives'
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

const MAKEFILE_PATH = 'Makefile'

const toProjectRomBaseName = (projectName: string): string => {
  const normalizedName = projectName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')

  const sanitizedName = normalizedName
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')

  return sanitizedName.length > 0 ? sanitizedName : 'project'
}

const updateCopiedMakefileProjectName = async (projectPath: string): Promise<void> => {
  const makefilePath = join(projectPath, MAKEFILE_PATH)
  const projectRomBaseName = toProjectRomBaseName(basename(projectPath))
  const makefileContents = await readFile(makefilePath, 'utf-8')
  const updatedMakefileContents = makefileContents.replace(
    /^PROJECTNAME\s*=.*$/m,
    `PROJECTNAME    = ${projectRomBaseName}`
  )

  if (updatedMakefileContents !== makefileContents) {
    await writeFile(makefilePath, updatedMakefileContents, 'utf-8')
  }
}

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

    await updateCopiedMakefileProjectName(normalizedProjectPath)
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
