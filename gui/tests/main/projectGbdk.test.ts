import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { getGbdkToolchainStatus, selectGbdkReleaseAsset } from '../../src/main/projectGbdk'

const tempDirectories: string[] = []
const originalRuntimeGbdkPath = process.env['RETROGBFULL_RUNTIME_GBDK_PATH']
const originalBundledGbdkPath = process.env['RETROGBFULL_BUNDLED_GBDK_PATH']

const createTempDirectory = async (): Promise<string> => {
  const directoryPath = await mkdtemp(join(tmpdir(), 'retrogb-gbdk-'))
  tempDirectories.push(directoryPath)
  return directoryPath
}

const createGbdkFixture = async (rootPath: string): Promise<void> => {
  await mkdir(join(rootPath, 'include'), { recursive: true })
  await mkdir(join(rootPath, 'lib'), { recursive: true })
  await mkdir(join(rootPath, 'bin'), { recursive: true })
  await writeFile(
    join(rootPath, 'bin', process.platform === 'win32' ? 'lcc.exe' : 'lcc'),
    '',
    'utf-8'
  )
}

describe('projectGbdk', () => {
  afterEach(async () => {
    if (originalRuntimeGbdkPath === undefined) {
      delete process.env['RETROGBFULL_RUNTIME_GBDK_PATH']
    } else {
      process.env['RETROGBFULL_RUNTIME_GBDK_PATH'] = originalRuntimeGbdkPath
    }

    if (originalBundledGbdkPath === undefined) {
      delete process.env['RETROGBFULL_BUNDLED_GBDK_PATH']
    } else {
      process.env['RETROGBFULL_BUNDLED_GBDK_PATH'] = originalBundledGbdkPath
    }

    await Promise.all(
      tempDirectories.splice(0).map((directoryPath) =>
        rm(directoryPath, { recursive: true, force: true })
      )
    )
  })

  it('reports when the configured runtime gbdk directory is missing', async () => {
    const workspacePath = await createTempDirectory()
    const installPath = join(workspacePath, 'gbdk')
    process.env['RETROGBFULL_RUNTIME_GBDK_PATH'] = installPath
    delete process.env['RETROGBFULL_BUNDLED_GBDK_PATH']

    const status = await getGbdkToolchainStatus()

    expect(status.installed).toBe(false)
    expect(status.installPath).toBe(installPath)
    expect(status.source).toBe('runtime-managed')
  })

  it('reports an installed gbdk directory and reads stored metadata', async () => {
    const workspacePath = await createTempDirectory()
    const installPath = join(workspacePath, 'gbdk')
    process.env['RETROGBFULL_RUNTIME_GBDK_PATH'] = installPath
    delete process.env['RETROGBFULL_BUNDLED_GBDK_PATH']

    await createGbdkFixture(installPath)
    await writeFile(
      join(installPath, '.retrogbfull-gbdk.json'),
      `${JSON.stringify({
        version: 'gbdk-4.5.0',
        assetName: 'gbdk-win64.zip',
        installedAt: '2026-05-05T00:00:00.000Z'
      })}\n`,
      'utf-8'
    )

    const status = await getGbdkToolchainStatus()

    expect(status.installed).toBe(true)
    expect(status.version).toBe('gbdk-4.5.0')
    expect(status.message).toContain(installPath)
  })

  it('selects the expected GitHub release asset for each supported platform', () => {
    const assets = [
      { name: 'gbdk-win64.zip', browser_download_url: 'https://example.com/win64.zip' },
      { name: 'gbdk-win32.zip', browser_download_url: 'https://example.com/win32.zip' },
      { name: 'gbdk-linux64.tar.gz', browser_download_url: 'https://example.com/linux64.tar.gz' },
      {
        name: 'gbdk-linux-arm64.tar.gz',
        browser_download_url: 'https://example.com/linux-arm64.tar.gz'
      },
      { name: 'gbdk-macos.tar.gz', browser_download_url: 'https://example.com/macos.tar.gz' },
      {
        name: 'gbdk-macos-arm64.tar.gz',
        browser_download_url: 'https://example.com/macos-arm64.tar.gz'
      }
    ]

    expect(selectGbdkReleaseAsset(assets, 'win32', 'x64').name).toBe('gbdk-win64.zip')
    expect(selectGbdkReleaseAsset(assets, 'win32', 'ia32').name).toBe('gbdk-win32.zip')
    expect(selectGbdkReleaseAsset(assets, 'linux', 'x64').name).toBe('gbdk-linux64.tar.gz')
    expect(selectGbdkReleaseAsset(assets, 'linux', 'arm64').name).toBe(
      'gbdk-linux-arm64.tar.gz'
    )
    expect(selectGbdkReleaseAsset(assets, 'darwin', 'x64').name).toBe('gbdk-macos.tar.gz')
    expect(selectGbdkReleaseAsset(assets, 'darwin', 'arm64').name).toBe(
      'gbdk-macos-arm64.tar.gz'
    )
  })
})
