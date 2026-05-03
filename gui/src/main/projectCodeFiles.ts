import { readdir } from 'fs/promises'
import { extname, join } from 'path'
import { ensureProjectDirectory } from './projectCodeShared'

export const PROJECT_CODE_FILE_EXTENSIONS = new Set(['.c', '.h'])
export { ensureProjectDirectory }

// recursively searches for all the .c and .h files in the project
export const walkProjectCodeFiles = async (
  basePath: string,
  currentPath = ''
): Promise<string[]> => {
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

    if (PROJECT_CODE_FILE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      discoveredPaths.push(nextPath)
    }
  }

  return discoveredPaths
}
