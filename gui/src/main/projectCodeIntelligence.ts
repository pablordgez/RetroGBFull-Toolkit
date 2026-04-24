import { readFile } from 'fs/promises'
import { relative, resolve } from 'path'
import {
  createEmptyProjectCodeSymbolIndex,
  mergeProjectCodeSymbolIndexes,
  parseProjectCodeSymbolIndexFromText
} from '../shared/codeIntelligence'
import type { ProjectCodeSymbolIndex } from '../shared/projectCodeWorkspace'
import { ensureProjectDirectory, walkProjectCodeFiles } from './projectCodeFiles'


export const getProjectCodeSymbolIndex = async (projectPath: string): Promise<ProjectCodeSymbolIndex> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const sourceRoot = resolve(normalizedProjectPath, 'src')

  try {
    const codeFiles = await walkProjectCodeFiles(sourceRoot)
    const symbolIndexes = await Promise.all(
      codeFiles.map(async (codeFilePath) => {
        const absolutePath = resolve(sourceRoot, codeFilePath)
        const content = await readFile(absolutePath, 'utf-8')
        // builds symbol index from file content with source path as declaredIn
        return parseProjectCodeSymbolIndexFromText(content, {
          declaredIn: relative(normalizedProjectPath, absolutePath).replace(/\\/g, '/')
        })
      })
    )

    // dedupes across all files (per file dedupe was done in parseProjectCodeSymbolIndexFromText) 
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
