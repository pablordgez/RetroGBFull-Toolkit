import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const extractZipMock = vi.hoisted(() => vi.fn())
const tarExtractMock = vi.hoisted(() => vi.fn())

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  mkdtemp: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn()
}))

const projectCodeSharedMocks = vi.hoisted(() => ({
  getBundledGbdkPath: vi.fn(),
  getBundledGbdkSource: vi.fn()
}))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  const mockedModule = {
    ...actual,
    mkdir: fsMocks.mkdir,
    mkdtemp: fsMocks.mkdtemp,
    readdir: fsMocks.readdir,
    readFile: fsMocks.readFile,
    rename: fsMocks.rename,
    rm: fsMocks.rm,
    stat: fsMocks.stat,
    writeFile: fsMocks.writeFile
  }

  return {
    ...mockedModule,
    default: mockedModule
  }
})

vi.mock('../../src/main/projectCodeShared', () => ({
  getBundledGbdkPath: projectCodeSharedMocks.getBundledGbdkPath,
  getBundledGbdkSource: projectCodeSharedMocks.getBundledGbdkSource
}))

vi.mock('extract-zip', () => ({
  default: extractZipMock
}))

vi.mock('tar', () => ({
  x: tarExtractMock
}))

import {
  getGbdkToolchainStatus,
  installLatestGbdkToolchain,
  selectGbdkReleaseAsset
} from '../../src/main/projectGbdk'

const INSTALL_PATH = '/toolchains/gbdk'
const EXECUTABLE_PATH = join(INSTALL_PATH, 'bin', process.platform === 'win32' ? 'lcc.exe' : 'lcc')
const FETCH_MOCK = vi.fn()

const createDirectoryStats = () => ({
  isDirectory: () => true,
  isFile: () => false
})

const createFileStats = () => ({
  isDirectory: () => false,
  isFile: () => true
})

const getRuntimeReleaseAssetName = (): string => {
  const assetNamesByRuntime: Record<string, string> = {
    'win32:x64': 'gbdk-win64.zip',
    'win32:ia32': 'gbdk-win32.zip',
    'linux:x64': 'gbdk-linux64.tar.gz',
    'linux:arm64': 'gbdk-linux-arm64.tar.gz',
    'darwin:x64': 'gbdk-macos.tar.gz',
    'darwin:arm64': 'gbdk-macos-arm64.tar.gz'
  }

  const assetName = assetNamesByRuntime[`${process.platform}:${process.arch}`]

  if (!assetName) {
    throw new Error(`Unsupported test runtime for projectGbdk.test.ts: ${process.platform}:${process.arch}`)
  }

  return assetName
}

describe('projectGbdk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', FETCH_MOCK)
    projectCodeSharedMocks.getBundledGbdkPath.mockReturnValue(INSTALL_PATH)
    projectCodeSharedMocks.getBundledGbdkSource.mockReturnValue('runtime-managed')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reports when the configured runtime gbdk directory is missing', async () => {
    fsMocks.stat.mockRejectedValue(new Error('missing'))

    const status = await getGbdkToolchainStatus()

    expect(status.installed).toBe(false)
    expect(status.installPath).toBe(INSTALL_PATH)
    expect(status.executablePath).toBe(EXECUTABLE_PATH)
    expect(status.source).toBe('runtime-managed')
    expect(fsMocks.readFile).not.toHaveBeenCalled()
  })

  it('reports an installed gbdk directory and reads stored metadata', async () => {
    fsMocks.stat.mockImplementation(async (targetPath: string) => {
      if (
        targetPath === INSTALL_PATH ||
        targetPath === join(INSTALL_PATH, 'include') ||
        targetPath === join(INSTALL_PATH, 'lib')
      ) {
        return createDirectoryStats()
      }

      if (targetPath === EXECUTABLE_PATH) {
        return createFileStats()
      }

      throw new Error(`Unexpected stat path: ${targetPath}`)
    })
    fsMocks.readFile.mockResolvedValue(
      `${JSON.stringify({
        version: 'gbdk-4.5.0',
        assetName: 'gbdk-win64.zip',
        installedAt: '2026-05-05T00:00:00.000Z'
      })}\n`
    )

    const status = await getGbdkToolchainStatus()

    expect(status.installed).toBe(true)
    expect(status.version).toBe('gbdk-4.5.0')
    expect(status.message).toContain(INSTALL_PATH)
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      join(INSTALL_PATH, '.retrogbfull-gbdk.json'),
      'utf-8'
    )
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

  it('throws useful errors when the platform is unsupported or an asset is missing', () => {
    const assets = [
      { name: 'gbdk-win64.zip', browser_download_url: 'https://example.com/win64.zip' }
    ]

    expect(() => selectGbdkReleaseAsset(assets, 'linux', 'arm64')).toThrow(
      'does not include an installer for linux (arm64)'
    )
    expect(() => selectGbdkReleaseAsset(assets, 'aix' as NodeJS.Platform, 'ppc64')).toThrow(
      'Automatic GBDK installation is not available for aix (ppc64).'
    )
  })

  it('reports installed directories even when metadata is unreadable', async () => {
    fsMocks.stat.mockImplementation(async (targetPath: string) => {
      if (
        targetPath === INSTALL_PATH ||
        targetPath === join(INSTALL_PATH, 'include') ||
        targetPath === join(INSTALL_PATH, 'lib')
      ) {
        return createDirectoryStats()
      }

      if (targetPath === EXECUTABLE_PATH) {
        return createFileStats()
      }

      throw new Error(`Unexpected stat path: ${targetPath}`)
    })
    fsMocks.readFile.mockResolvedValue('{"version":42}\n')

    const status = await getGbdkToolchainStatus()

    expect(status.installed).toBe(true)
    expect(status.version).toBeNull()
    expect(status.message).toContain('GBDK is available')
  })

  it('downloads, extracts, and installs the latest toolchain release', async () => {
    const releaseTag = 'gbdk-4.5.0'
    const assetName = getRuntimeReleaseAssetName()
    const stagingRootPath = '/toolchains/.retrogbfull-gbdk-stage'
    const extractRootPath = join(stagingRootPath, 'extracted')
    const archivePath = join(stagingRootPath, assetName)

    fsMocks.mkdir.mockResolvedValue(undefined)
    fsMocks.mkdtemp.mockResolvedValue(stagingRootPath)
    fsMocks.writeFile.mockResolvedValue(undefined)
    fsMocks.rename.mockResolvedValue(undefined)
    fsMocks.rm.mockResolvedValue(undefined)
    fsMocks.stat.mockImplementation(async (targetPath: string) => {
      if (
        targetPath === extractRootPath ||
        targetPath === join(extractRootPath, 'include') ||
        targetPath === join(extractRootPath, 'lib')
      ) {
        return createDirectoryStats()
      }

      if (targetPath === join(extractRootPath, 'bin', process.platform === 'win32' ? 'lcc.exe' : 'lcc')) {
        return createFileStats()
      }

      throw new Error(`Missing path: ${targetPath}`)
    })
    FETCH_MOCK
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tag_name: releaseTag,
          assets: [
            { name: assetName, browser_download_url: `https://example.com/${assetName}` },
            { name: 'gbdk-win64.zip', browser_download_url: 'https://example.com/gbdk-win64.zip' },
            { name: 'gbdk-linux64.tar.gz', browser_download_url: 'https://example.com/gbdk-linux64.tar.gz' }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer
      })

    const result = await installLatestGbdkToolchain()

    expect(result).toEqual(
      expect.objectContaining({
        installed: true,
        installPath: INSTALL_PATH,
        executablePath: EXECUTABLE_PATH,
        version: releaseTag,
        releaseTag,
        assetName,
        replacedExisting: false
      })
    )
    expect(fsMocks.mkdir).toHaveBeenCalledWith('/toolchains', { recursive: true })
    expect(fsMocks.writeFile).toHaveBeenCalledWith(archivePath, expect.any(Buffer))
    if (assetName.endsWith('.zip')) {
      expect(extractZipMock).toHaveBeenCalledWith(archivePath, { dir: extractRootPath })
      expect(tarExtractMock).not.toHaveBeenCalled()
    } else {
      expect(tarExtractMock).toHaveBeenCalledWith({
        cwd: extractRootPath,
        file: archivePath,
        gzip: true
      })
    }
    expect(fsMocks.rename).toHaveBeenCalledWith(extractRootPath, INSTALL_PATH)
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      join(INSTALL_PATH, '.retrogbfull-gbdk.json'),
      expect.stringContaining(`"version": "${releaseTag}"`),
      'utf-8'
    )
    expect(fsMocks.rm).toHaveBeenCalledWith(stagingRootPath, { recursive: true, force: true })
  })

  it('reports when the install replaced an existing managed toolchain', async () => {
    const releaseTag = 'gbdk-4.5.1'
    const assetName = getRuntimeReleaseAssetName()
    const stagingRootPath = '/toolchains/.retrogbfull-gbdk-stage'
    const extractRootPath = join(stagingRootPath, 'extracted')

    fsMocks.mkdir.mockResolvedValue(undefined)
    fsMocks.mkdtemp.mockResolvedValue(stagingRootPath)
    fsMocks.writeFile.mockResolvedValue(undefined)
    fsMocks.rename.mockResolvedValue(undefined)
    fsMocks.rm.mockResolvedValue(undefined)
    fsMocks.stat.mockImplementation(async (targetPath: string) => {
      if (
        targetPath === INSTALL_PATH ||
        targetPath === extractRootPath ||
        targetPath === join(extractRootPath, 'include') ||
        targetPath === join(extractRootPath, 'lib')
      ) {
        return createDirectoryStats()
      }

      if (targetPath === join(extractRootPath, 'bin', process.platform === 'win32' ? 'lcc.exe' : 'lcc')) {
        return createFileStats()
      }

      throw new Error(`Missing path: ${targetPath}`)
    })
    FETCH_MOCK
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tag_name: releaseTag,
          assets: [{ name: assetName, browser_download_url: `https://example.com/${assetName}` }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([9, 8, 7]).buffer
      })

    const result = await installLatestGbdkToolchain()

    expect(result.replacedExisting).toBe(true)
    expect(fsMocks.rename).toHaveBeenNthCalledWith(
      1,
      INSTALL_PATH,
      expect.stringContaining('.retrogbfull-gbdk-backup-')
    )
    expect(fsMocks.rename).toHaveBeenNthCalledWith(2, extractRootPath, INSTALL_PATH)
  })
})
