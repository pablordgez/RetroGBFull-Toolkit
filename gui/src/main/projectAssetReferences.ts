import { readFile, writeFile } from 'fs/promises'
import {
  clearProjectAssetDocumentReferences,
  getProjectAssetKindFromFileName,
  parseProjectAssetDocument,
  remapProjectAssetDocumentReferences,
  serializeProjectAssetDocument
} from '../shared/projectAssets'
import { normalizeResourcePath, resolvePathWithinProject } from './projectResourcePaths'
import type { ProjectStoredResourceRecord } from './projectResourceTypes'

const updateProjectAssetReferences = async (
  projectPath: string,
  resources: ProjectStoredResourceRecord[],
  updateDocument: (document: ReturnType<typeof parseProjectAssetDocument>) => {
    document: ReturnType<typeof parseProjectAssetDocument>
    changed: boolean
  }
): Promise<void> => {
  await Promise.all(
    resources.map(async (resource) => {
      if (resource.type !== 'file' || !getProjectAssetKindFromFileName(resource.path)) {
        return
      }

      const absolutePath = resolvePathWithinProject(projectPath, resource.path)

      const document = await (async () => {
        try {
          return parseProjectAssetDocument(JSON.parse(await readFile(absolutePath, 'utf-8')))
        } catch {
          // Keep resource moves usable even if an unrelated asset file is already malformed.
          return null
        }
      })()

      if (!document) {
        return
      }

      const remapped = updateDocument(document)

      if (remapped.changed) {
        await writeFile(absolutePath, serializeProjectAssetDocument(remapped.document), 'utf-8')
      }
    })
  )
}

export const updateProjectAssetReferencePaths = async (
  projectPath: string,
  resources: ProjectStoredResourceRecord[],
  sourceRootPath: string,
  targetRootPath: string
): Promise<void> => {
  const normalizedSourceRootPath = normalizeResourcePath(sourceRootPath)
  const normalizedTargetRootPath = normalizeResourcePath(targetRootPath)

  if (!normalizedSourceRootPath || normalizedSourceRootPath === normalizedTargetRootPath) {
    return
  }

  await updateProjectAssetReferences(projectPath, resources, (document) =>
    remapProjectAssetDocumentReferences(
      document,
      normalizedSourceRootPath,
      normalizedTargetRootPath
    )
  )
}

export const clearProjectAssetReferencePaths = async (
  projectPath: string,
  resources: ProjectStoredResourceRecord[],
  sourceRootPath: string
): Promise<void> => {
  const normalizedSourceRootPath = normalizeResourcePath(sourceRootPath)

  if (!normalizedSourceRootPath) {
    return
  }

  await updateProjectAssetReferences(projectPath, resources, (document) =>
    clearProjectAssetDocumentReferences(document, normalizedSourceRootPath)
  )
}
