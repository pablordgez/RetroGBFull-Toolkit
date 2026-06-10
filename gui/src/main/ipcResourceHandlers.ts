import { ipcMain } from 'electron'
import {
  createProjectFolder,
  createProjectResource,
  deleteProjectFolder,
  deleteProjectResource,
  finalizeDeletedProjectResource,
  getProjectResourceErrorMessage,
  listProjectResources,
  renameProjectFolder,
  renameProjectResource,
  restoreDeletedProjectResource,
  scanProjectDirectory,
  transferProjectResource,
  updateProjectResourceBank,
  updateProjectStartingScene
} from './projectResources'

export const registerResourceIpcHandlers = (): void => {
  ipcMain.handle('project:resources:list', async (_, projectPath: string, currentPath?: string) => {
    try {
      return await listProjectResources(projectPath, currentPath)
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'load'))
    }
  })

  ipcMain.handle('project:resources:create-folder', async (_, projectPath: string, parentPath?: string) => {
    try {
      return await createProjectFolder(projectPath, parentPath)
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'create'))
    }
  })

  ipcMain.handle(
    'project:resources:create',
    async (_, projectPath: string, resourceType: string, parentPath?: string, resourceName?: string) => {
      try {
        return await createProjectResource(
          projectPath,
          resourceType as Parameters<typeof createProjectResource>[1],
          parentPath,
          resourceName
        )
      } catch (error) {
        throw new Error(getProjectResourceErrorMessage(error, 'create'))
      }
    }
  )

  ipcMain.handle(
    'project:resources:rename-folder',
    async (_, projectPath: string, folderPath: string, nextName: string) => {
      try {
        return await renameProjectFolder(projectPath, folderPath, nextName)
      } catch (error) {
        throw new Error(getProjectResourceErrorMessage(error, 'rename'))
      }
    }
  )

  ipcMain.handle(
    'project:resources:rename',
    async (_, projectPath: string, resourceType: string, resourcePath: string, nextName: string) => {
      try {
        return await renameProjectResource(
          projectPath,
          resourceType as Parameters<typeof renameProjectResource>[1],
          resourcePath,
          nextName
        )
      } catch (error) {
        throw new Error(getProjectResourceErrorMessage(error, 'rename'))
      }
    }
  )

  ipcMain.handle('project:resources:delete-folder', async (_, projectPath: string, folderPath: string) => {
    try {
      return await deleteProjectFolder(projectPath, folderPath)
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'delete'))
    }
  })

  ipcMain.handle(
    'project:resources:delete',
    async (_, projectPath: string, resourceType: string, resourcePath: string, deletionId?: string) => {
      try {
        return await deleteProjectResource(
          projectPath,
          resourceType as Parameters<typeof deleteProjectResource>[1],
          resourcePath,
          deletionId
        )
      } catch (error) {
        throw new Error(getProjectResourceErrorMessage(error, 'delete'))
      }
    }
  )

  ipcMain.handle(
    'project:resources:transfer',
    async (
      _,
      projectPath: string,
      resourceType: string,
      resourcePath: string,
      destinationParentPath?: string,
      mode?: string
    ) => {
      try {
        return await transferProjectResource(
          projectPath,
          resourceType as Parameters<typeof transferProjectResource>[1],
          resourcePath,
          destinationParentPath,
          mode as Parameters<typeof transferProjectResource>[4]
        )
      } catch (error) {
        throw new Error(getProjectResourceErrorMessage(error, 'paste'))
      }
    }
  )

  ipcMain.handle(
    'project:resources:update-bank',
    async (_, projectPath: string, resourceType: string, resourcePath: string, bank: number) => {
      try {
        return await updateProjectResourceBank(
          projectPath,
          resourceType as Parameters<typeof updateProjectResourceBank>[1],
          resourcePath,
          bank
        )
      } catch (error) {
        throw new Error(getProjectResourceErrorMessage(error, 'bank'))
      }
    }
  )

  ipcMain.handle(
    'project:resources:update-starting-scene',
    async (_, projectPath: string, scenePath: string | null) => {
      try {
        return await updateProjectStartingScene(projectPath, scenePath)
      } catch (error) {
        throw new Error(getProjectResourceErrorMessage(error, 'create'))
      }
    }
  )

  ipcMain.handle('project:resources:scan', async (_, projectPath: string) => {
    try {
      return await scanProjectDirectory(projectPath)
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'load'))
    }
  })

  ipcMain.handle('project:resources:restore-deleted', async (_, projectPath: string, deletionId: string) => {
    try {
      return await restoreDeletedProjectResource(projectPath, deletionId)
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'create'))
    }
  })

  ipcMain.handle('project:resources:finalize-deleted', async (_, projectPath: string, deletionId: string) => {
    try {
      await finalizeDeletedProjectResource(projectPath, deletionId)
      return true
    } catch (error) {
      throw new Error(getProjectResourceErrorMessage(error, 'delete'))
    }
  })
}
