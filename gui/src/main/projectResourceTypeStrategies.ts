import type { Stats } from 'fs'
import { cp, mkdir, rename, stat, writeFile } from 'fs/promises'
import { join, relative } from 'path'
import { ProjectLauncherError } from './projectLauncherPrimitives'
import {
  createDefaultProjectAssetDocument,
  type ProjectAssetKind,
  serializeProjectAssetDocument
} from '../shared/projectAssets'
import {
  moveProjectScriptFilesToDeletedContainer,
  renameProjectScriptFiles,
  restoreProjectScriptFilesFromDeletedContainer,
  scriptFilesExist,
  transferProjectScriptFiles
} from './projectCode'
import { normalizeResourcePath } from './projectResourcePaths'
import type { ProjectResourceKind, ProjectResourceTransferMode } from './projectResourceTypes'

interface CreateResourceOnDiskOptions {
  projectPath: string
  parentDirectory: string
  resourceType: ProjectResourceKind
  targetResourceFileName: string
}

interface ResourcePathOptions {
  projectPath: string
  resourcePath: string
}

interface RenameResourceOnDiskOptions extends ResourcePathOptions {
  nextResourcePath: string
  resolveResourceDirectory: (projectPath: string, resourcePath: string) => string
}

interface DeletedResourceOnDiskOptions extends ResourcePathOptions {
  deletedContentPath: string
  resolveResourceDirectory: (projectPath: string, resourcePath: string) => string
}

interface ReadTransferSourceOptions extends ResourcePathOptions {
  sourceAbsolutePath: string
}

interface TransferResourceOnDiskOptions extends ResourcePathOptions {
  targetResourcePath: string
  mode: ProjectResourceTransferMode
  sourceAbsolutePath: string
  targetAbsolutePath: string
  sourceStats: Stats | null
}

interface ProjectResourceTypeStrategy {
  create: (options: CreateResourceOnDiskOptions) => Promise<void>
  rename: (options: RenameResourceOnDiskOptions) => Promise<void>
  moveToDeleted: (options: DeletedResourceOnDiskOptions) => Promise<void>
  restoreFromDeleted: (options: DeletedResourceOnDiskOptions) => Promise<void>
  readTransferSourceStats: (options: ReadTransferSourceOptions) => Promise<Stats | null>
  transfer: (options: TransferResourceOnDiskOptions) => Promise<void>
}

const buildDeletedContentResourcePath = (
  projectPath: string,
  deletedContentPath: string
): string => {
  return normalizeResourcePath(relative(projectPath, deletedContentPath).replace(/\\/g, '/'))
}

const createDefaultAssetResourceFile = async ({
  parentDirectory,
  resourceType,
  targetResourceFileName
}: CreateResourceOnDiskOptions): Promise<void> => {
  await writeFile(
    join(parentDirectory, targetResourceFileName),
    serializeProjectAssetDocument(
      createDefaultProjectAssetDocument(resourceType as ProjectAssetKind)
    ),
    'utf-8'
  )
}

const folderResourceStrategy: ProjectResourceTypeStrategy = {
  create: async ({ parentDirectory, targetResourceFileName }) => {
    await mkdir(join(parentDirectory, targetResourceFileName), { recursive: false })
  },
  rename: async ({ projectPath, resourcePath, nextResourcePath, resolveResourceDirectory }) => {
    await rename(
      resolveResourceDirectory(projectPath, resourcePath),
      resolveResourceDirectory(projectPath, nextResourcePath)
    )
  },
  moveToDeleted: async ({
    projectPath,
    resourcePath,
    deletedContentPath,
    resolveResourceDirectory
  }) => {
    await rename(resolveResourceDirectory(projectPath, resourcePath), deletedContentPath)
  },
  restoreFromDeleted: async ({
    projectPath,
    resourcePath,
    deletedContentPath,
    resolveResourceDirectory
  }) => {
    await rename(deletedContentPath, resolveResourceDirectory(projectPath, resourcePath))
  },
  readTransferSourceStats: async ({ sourceAbsolutePath }) => {
    const sourceStats = await stat(sourceAbsolutePath)

    if (!sourceStats.isDirectory()) {
      throw new ProjectLauncherError('The selected folder could not be found.')
    }

    return sourceStats
  },
  transfer: async ({ sourceAbsolutePath, targetAbsolutePath, mode, sourceStats }) => {
    if (mode === 'copy') {
      if (sourceStats?.isDirectory()) {
        await cp(sourceAbsolutePath, targetAbsolutePath, { recursive: true, errorOnExist: true })
      } else {
        await cp(sourceAbsolutePath, targetAbsolutePath, { errorOnExist: true })
      }
      return
    }

    await rename(sourceAbsolutePath, targetAbsolutePath)
  }
}

const assetResourceStrategy: ProjectResourceTypeStrategy = {
  create: createDefaultAssetResourceFile,
  rename: folderResourceStrategy.rename,
  moveToDeleted: folderResourceStrategy.moveToDeleted,
  restoreFromDeleted: folderResourceStrategy.restoreFromDeleted,
  readTransferSourceStats: async ({ sourceAbsolutePath }) => {
    const sourceStats = await stat(sourceAbsolutePath)

    if (!sourceStats.isFile()) {
      throw new ProjectLauncherError('The selected asset could not be found.')
    }

    return sourceStats
  },
  transfer: folderResourceStrategy.transfer
}

const scriptResourceStrategy: ProjectResourceTypeStrategy = {
  create: createDefaultAssetResourceFile,
  rename: async ({ projectPath, resourcePath, nextResourcePath }) => {
    await renameProjectScriptFiles(projectPath, resourcePath, nextResourcePath)
  },
  moveToDeleted: async ({ projectPath, resourcePath, deletedContentPath }) => {
    await moveProjectScriptFilesToDeletedContainer(
      projectPath,
      resourcePath,
      buildDeletedContentResourcePath(projectPath, deletedContentPath)
    )
  },
  restoreFromDeleted: async ({ projectPath, resourcePath, deletedContentPath }) => {
    await restoreProjectScriptFilesFromDeletedContainer(
      projectPath,
      resourcePath,
      buildDeletedContentResourcePath(projectPath, deletedContentPath)
    )
  },
  readTransferSourceStats: async ({ projectPath, resourcePath }) => {
    if (!(await scriptFilesExist(projectPath, resourcePath))) {
      throw new ProjectLauncherError('The selected script could not be found.')
    }

    return null
  },
  transfer: async ({ projectPath, resourcePath, targetResourcePath, mode }) => {
    await transferProjectScriptFiles(projectPath, resourcePath, targetResourcePath, mode)
  }
}

export const getProjectResourceTypeStrategy = (
  resourceType: ProjectResourceKind
): ProjectResourceTypeStrategy => {
  if (resourceType === 'folder') {
    return folderResourceStrategy
  }

  if (resourceType === 'script') {
    return scriptResourceStrategy
  }

  return assetResourceStrategy
}
