import { cp, mkdir, readdir, rm, stat } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { validateProjectDirectory } from './projectLauncher'
import { ProjectLauncherError } from './projectLauncherPrimitives'
import { resolvePathWithinProject as resolveProjectResourcePath } from './projectResourcePaths'
import type { GbdkToolchainSource } from '../shared/projectGbdk'
import type { MakeToolchainSource } from '../shared/projectMake'

export const IGNORED_PROJECT_RESOURCE_ROOT_DIRECTORIES = new Set(['deleted-resources'])
export const IGNORED_BUNDLED_CORE_ROOT_DIRECTORIES = new Set(['obj'])
export const INTERNAL_GENERATION_DIRECTORY = '.retrogbfull'
export const RESOURCE_GENERATION_MANIFEST_PATH = `${INTERNAL_GENERATION_DIRECTORY}/resource-generation-manifest.json`
export const SCRIPT_ENVIRONMENT_PATH = 'src/ScriptEnvironment.h'
export const SAVE_DATA_HEADER_PATH = 'src/Saves/SaveData.h'
export const SAVE_DATA_SOURCE_PATH = 'src/Saves/SaveData.c'
export const MAIN_SOURCE_PATH = 'src/main.c'
export const SAVE_DATA_VARIABLE_BEGIN = '    // BEGIN SAVE DATA VARIABLES'
export const SAVE_DATA_VARIABLE_END = '    // END SAVE DATA VARIABLES'
export const SAVE_DATA_INITIALIZATION_BEGIN = '    // BEGIN SAVE DATA VARIABLE INITIALIZATION'
export const SAVE_DATA_INITIALIZATION_END = '    // END SAVE DATA VARIABLE INITIALIZATION'
export const GENERATED_SCENE_BUILD_BEGIN = '    // BEGIN GENERATED SCENE INITIALIZATION'
export const GENERATED_SCENE_BUILD_END = '    // END GENERATED SCENE INITIALIZATION'
export const ACTOR_REGISTRY_ENTRIES_BEGIN = '// BEGIN GENERATED ACTOR REGISTRY ENTRIES'
export const ACTOR_REGISTRY_ENTRIES_END = '// END GENERATED ACTOR REGISTRY ENTRIES'
export const ACTOR_REGISTRY_INCLUDES_BEGIN = '// BEGIN GENERATED ACTOR REGISTRY INCLUDES'
export const ACTOR_REGISTRY_INCLUDES_END = '// END GENERATED ACTOR REGISTRY INCLUDES'
export const SCENE_REGISTRY_ENTRIES_BEGIN = '// BEGIN GENERATED SCENE REGISTRY ENTRIES'
export const SCENE_REGISTRY_ENTRIES_END = '// END GENERATED SCENE REGISTRY ENTRIES'
export const SCENE_REGISTRY_INCLUDES_BEGIN = '// BEGIN GENERATED SCENE REGISTRY INCLUDES'
export const SCENE_REGISTRY_INCLUDES_END = '// END GENERATED SCENE REGISTRY INCLUDES'
export const STARTING_SCENE_INCLUDE_BEGIN = '// BEGIN STARTING SCENE INCLUDE'
export const STARTING_SCENE_INCLUDE_END = '// END STARTING SCENE INCLUDE'
export const STARTING_SCENE_INSTANTIATION_BEGIN = '    // BEGIN STARTING SCENE INSTANTIATION'
export const STARTING_SCENE_INSTANTIATION_END = '    // END STARTING SCENE INSTANTIATION'
export const MANAGED_SCENE_FILE_MARKER = '// RETROGBFULL MANAGED SCENE FILE'
export const MANAGED_DEFAULT_ACTOR_FILE_MARKER = '// RETROGBFULL MANAGED DEFAULT ACTOR FILE'
export const CORE_PLACEHOLDER_SCENE_FILE_MARKER = '// RETROGBFULL CORE PLACEHOLDER SCENE'

export const resolvePathWithinProject = (projectPath: string, resourcePath: string): string => {
  return resolveProjectResourcePath(
    projectPath,
    resourcePath,
    'The selected code file is outside the project directory.',
    false
  )
}

export const getBundledCorePath = (): string => {
  return resolve(__dirname, '../../../core')
}

export const getBundledGbdkSource = (): GbdkToolchainSource => {
  if (process.env['RETROGBFULL_BUNDLED_GBDK_PATH']) {
    return 'override'
  }

  if (process.env['RETROGBFULL_RUNTIME_GBDK_PATH']) {
    return 'runtime-managed'
  }

  return 'development-root'
}

export const getBundledGbdkPath = (): string => {
  return (
    process.env['RETROGBFULL_BUNDLED_GBDK_PATH'] ??
    process.env['RETROGBFULL_RUNTIME_GBDK_PATH'] ??
    resolve(__dirname, '../../../gbdk')
  )
}

export const getBundledMakeSource = (): MakeToolchainSource => {
  if (process.env['RETROGBFULL_BUNDLED_MAKE_PATH']) {
    return 'override'
  }

  if (process.env['RETROGBFULL_RUNTIME_MAKE_PATH']) {
    return 'runtime-managed'
  }

  return 'development-root'
}

export const getBundledMakePath = (): string => {
  return (
    process.env['RETROGBFULL_BUNDLED_MAKE_PATH'] ??
    process.env['RETROGBFULL_RUNTIME_MAKE_PATH'] ??
    resolve(__dirname, '../../../make')
  )
}

// recursively walks through a directory and returns relative paths of all files and directories inside
// unless they are at the base path and ignored
export const walkRelativePaths = async (
  basePath: string,
  currentPath = '',
  ignoredRootDirectories = new Set<string>()
): Promise<string[]> => {
  const absolutePath = currentPath ? join(basePath, currentPath) : basePath
  const entries = await readdir(absolutePath, { withFileTypes: true })
  const discoveredPaths: string[] = []

  for (const entry of entries) {
    if (!currentPath && entry.isDirectory() && ignoredRootDirectories.has(entry.name)) {
      continue
    }

    const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      discoveredPaths.push(relativePath)
      discoveredPaths.push(
        ...(await walkRelativePaths(basePath, relativePath, ignoredRootDirectories))
      )
      continue
    }

    discoveredPaths.push(relativePath)
  }

  return discoveredPaths
}

// cleans up files in the target directory that are in the source directory
export const cleanupBundledDirectoryInTarget = async (
  sourceBasePath: string,
  targetBasePath: string,
  ignoredRootDirectories = new Set<string>()
): Promise<void> => {
  const relativePaths = await walkRelativePaths(sourceBasePath, '', ignoredRootDirectories)

  for (const relativePath of relativePaths) {
    const sourcePath = join(sourceBasePath, relativePath)
    const targetPath = join(targetBasePath, relativePath)
    const sourceStats = await stat(sourcePath)

    if (sourceStats.isDirectory()) {
      continue
    }

    try {
      await rm(targetPath, { force: true })
    } catch {
      // Missing files are fine during a refresh.
    }
  }
}

// copies files from a directory into the project, optionally overwriting existing target files
export const copyBundledDirectoryIntoTarget = async (
  sourceBasePath: string,
  targetBasePath: string,
  ignoredRootDirectories = new Set<string>(),
  options: { overwriteExisting?: boolean } = {}
): Promise<{ copiedPaths: string[]; skippedPaths: string[] }> => {
  const relativePaths = await walkRelativePaths(sourceBasePath, '', ignoredRootDirectories)
  const copiedPaths: string[] = []
  const skippedPaths: string[] = []

  for (const relativePath of relativePaths) {
    const sourcePath = join(sourceBasePath, relativePath)
    const targetPath = join(targetBasePath, relativePath)
    const sourceStats = await stat(sourcePath)

    if (sourceStats.isDirectory()) {
      await mkdir(targetPath, { recursive: true })
      continue
    }

    if (!options.overwriteExisting) {
      try {
        await stat(targetPath)
        skippedPaths.push(relativePath.replace(/\\/g, '/'))
        continue
      } catch {
        // Missing files are copied below.
      }
    }

    await mkdir(dirname(targetPath), { recursive: true })
    await cp(sourcePath, targetPath, {
      recursive: false,
      force: options.overwriteExisting ?? false,
      errorOnExist: !options.overwriteExisting
    })
    copiedPaths.push(relativePath.replace(/\\/g, '/'))
  }

  return {
    copiedPaths,
    skippedPaths
  }
}

export const ensureProjectDirectory = async (projectPath: string): Promise<string> => {
  const validation = await validateProjectDirectory(projectPath)

  if (!validation.isValid) {
    throw new ProjectLauncherError(
      validation.message ?? 'The selected project could not be loaded.'
    )
  }

  return validation.path
}
