import { ipcMain } from 'electron'
import { getGbdkToolchainStatus, installLatestGbdkToolchain } from './projectGbdk'
import { getMakeToolchainStatus, installLatestMakeToolchain } from './projectMake'
import { getCurrentRuntimePlatform } from '../shared/runtimePlatform'

export const registerToolchainIpcHandlers = (): void => {
  ipcMain.handle('gbdk:status', async () => {
    return getGbdkToolchainStatus()
  })

  ipcMain.handle('gbdk:install-latest', async () => {
    return installLatestGbdkToolchain()
  })

  ipcMain.handle('make:status', async () => {
    return getMakeToolchainStatus()
  })

  ipcMain.handle('make:install-latest', async () => {
    return installLatestMakeToolchain()
  })

  ipcMain.handle('app:runtime-platform', async () => {
    return getCurrentRuntimePlatform(process.platform)
  })
}
