import { readdir, readFile } from 'fs/promises'
import { extname, join, relative, resolve } from 'path'
import { ProjectLauncherError, validateProjectDirectory } from './projectLauncher'
import {
  createEmptyProjectCodeSymbolIndex,
  mergeProjectCodeSymbolIndexes,
  parseProjectCodeSymbolIndexFromText
} from '../shared/codeIntelligence'
import type { ProjectCodeSymbolIndex } from '../shared/projectCodeWorkspace'

const CODE_FILE_EXTENSIONS = new Set(['.c', '.h'])

const ensureProjectDirectory = async (projectPath: string): Promise<string> => {
  const validation = await validateProjectDirectory(projectPath)

  if (!validation.isValid) {
    throw new ProjectLauncherError(validation.message ?? 'The selected project could not be loaded.')
  }

  return validation.path
}

const walkProjectCodeFiles = async (basePath: string, currentPath = ''): Promise<string[]> => {
  const absolutePath = currentPath ? join(basePath, currentPath) : basePath
  const entries = await readdir(absolutePath, { withFileTypes: true })
  const discoveredPaths: string[] = []

  for (const entry of entries) {
    if (entry.name === '.deleted') {
      continue
    }

    const nextPath = currentPath ? join(currentPath, entry.name) : entry.name

    if (entry.isDirectory()) {
      discoveredPaths.push(...(await walkProjectCodeFiles(basePath, nextPath)))
      continue
    }

    if (CODE_FILE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      discoveredPaths.push(nextPath)
    }
  }

  return discoveredPaths
}

export const getProjectCodeSymbolIndex = async (projectPath: string): Promise<ProjectCodeSymbolIndex> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const sourceRoot = resolve(normalizedProjectPath, 'src')

  try {
    const codeFiles = await walkProjectCodeFiles(sourceRoot)
    const symbolIndexes = await Promise.all(
      codeFiles.map(async (codeFilePath) => {
        const absolutePath = resolve(sourceRoot, codeFilePath)
        const content = await readFile(absolutePath, 'utf-8')
        return parseProjectCodeSymbolIndexFromText(content, {
          declaredIn: relative(normalizedProjectPath, absolutePath).replace(/\\/g, '/')
        })
      })
    )

    return {
      ...mergeProjectCodeSymbolIndexes(symbolIndexes),
      sourceFilesScanned: codeFiles.length
    }
  } catch (error) {
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: string }).code)
        : ''

    if (errorCode === 'ENOENT') {
      return createEmptyProjectCodeSymbolIndex()
    }

    throw error
  }
}
