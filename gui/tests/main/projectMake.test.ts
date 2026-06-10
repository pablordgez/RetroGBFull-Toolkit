import { EventEmitter } from 'events'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tarExtractMock = vi.hoisted(() => vi.fn())

const fsMocks = vi.hoisted(() => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  mkdtemp: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn()
}))

const spawnMock = vi.hoisted(() => vi.fn())

const projectCodeSharedMocks = vi.hoisted(() => ({
  getBundledMakePath: vi.fn(),
  getBundledMakeSource: vi.fn()
}))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  const mockedModule = {
    ...actual,
    copyFile: fsMocks.copyFile,
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

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  const mockedModule = {
    ...actual,
    spawn: spawnMock
  }

  return {
    ...mockedModule,
    default: mockedModule
  }
})

vi.mock('../../src/main/projectCodeShared', () => ({
  getBundledMakePath: projectCodeSharedMocks.getBundledMakePath,
  getBundledMakeSource: projectCodeSharedMocks.getBundledMakeSource
}))

vi.mock('tar', () => ({
  x: tarExtractMock
}))

import {
  getMakeToolchainStatus,
  installLatestMakeToolchain,
  selectLatestMakeSourceArchive
} from '../../src/main/projectMake'

const originalPath = process.env['PATH']
const INSTALL_PATH = '/toolchains/make'
const MANAGED_EXECUTABLE_PATH = join(
  INSTALL_PATH,
  'bin',
  process.platform === 'win32' ? 'make.exe' : 'make'
)
const SYSTEM_EXECUTABLE_NAME = process.platform === 'win32' ? 'make.exe' : 'gmake'
const SYSTEM_EXECUTABLE_PATH = join('/system/bin', SYSTEM_EXECUTABLE_NAME)

const createFileStats = () => ({
  isDirectory: () => false,
  isFile: () => true
})

const FETCH_MOCK = vi.fn()

const createSuccessfulChild = (stdout = '', stderr = '') => {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
  }

  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()

  queueMicrotask(() => {
    if (stdout) {
      child.stdout.emit('data', Buffer.from(stdout))
    }

    if (stderr) {
      child.stderr.emit('data', Buffer.from(stderr))
    }

    child.emit('close', 0)
  })

  return child
}

describe('projectMake', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', FETCH_MOCK)
    projectCodeSharedMocks.getBundledMakePath.mockReturnValue(INSTALL_PATH)
    projectCodeSharedMocks.getBundledMakeSource.mockReturnValue('runtime-managed')
  })

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env['PATH']
    } else {
      process.env['PATH'] = originalPath
    }

    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('selects the latest official GNU Make source archive from the GNU index', () => {
    const archive = selectLatestMakeSourceArchive(`
      <a href="make-4.3.tar.gz">make-4.3.tar.gz</a>
      <a href="make-4.4.tar.gz">make-4.4.tar.gz</a>
      <a href="make-4.4.1.tar.gz">make-4.4.1.tar.gz</a>
    `)

    expect(archive.version).toBe('4.4.1')
    expect(archive.archiveName).toBe('make-4.4.1.tar.gz')
    expect(archive.downloadUrl).toBe('https://ftp.gnu.org/gnu/make/make-4.4.1.tar.gz')
  })

  it('throws when the GNU download index contains no source archives', () => {
    expect(() => selectLatestMakeSourceArchive('<html><body>No archives here</body></html>')).toThrow(
      'Could not find any GNU Make source archives on the official GNU download page.'
    )
  })

  it('reports when the configured managed make directory is missing', async () => {
    process.env['PATH'] = ''
    fsMocks.stat.mockRejectedValue(new Error('missing'))
    fsMocks.readdir.mockRejectedValue(new Error('missing'))

    const status = await getMakeToolchainStatus()

    expect(status.installed).toBe(false)
    expect(status.installPath).toBe(INSTALL_PATH)
    expect(status.executablePath).toBe(MANAGED_EXECUTABLE_PATH)
    expect(status.source).toBe('runtime-managed')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('reports an installed managed make directory and reads stored metadata', async () => {
    process.env['PATH'] = ''
    fsMocks.stat.mockImplementation(async (targetPath: string) => {
      if (targetPath === MANAGED_EXECUTABLE_PATH) {
        return createFileStats()
      }

      throw new Error(`Unexpected stat path: ${targetPath}`)
    })
    fsMocks.readFile.mockResolvedValue(
      `${JSON.stringify({
        version: '4.4.1',
        archiveName: 'make-4.4.1.tar.gz',
        installedAt: '2026-05-26T00:00:00.000Z'
      })}\n`
    )
    spawnMock.mockImplementation(() => createSuccessfulChild('GNU Make 4.4.1\n'))

    const status = await getMakeToolchainStatus()

    expect(status.installed).toBe(true)
    expect(status.version).toBe('4.4.1')
    expect(status.source).toBe('runtime-managed')
    expect(status.executablePath).toBe(MANAGED_EXECUTABLE_PATH)
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      join(INSTALL_PATH, '.retrogbfull-make.json'),
      'utf-8'
    )
  })

  it('falls back to the detected executable version when install metadata is invalid', async () => {
    process.env['PATH'] = ''
    fsMocks.stat.mockImplementation(async (targetPath: string) => {
      if (targetPath === MANAGED_EXECUTABLE_PATH) {
        return createFileStats()
      }

      throw new Error(`Unexpected stat path: ${targetPath}`)
    })
    fsMocks.readFile.mockResolvedValue('{"version":42}\n')
    spawnMock.mockImplementation(() => createSuccessfulChild('GNU Make 4.4.1\n'))

    const status = await getMakeToolchainStatus()

    expect(status.installed).toBe(true)
    expect(status.version).toBe('4.4.1')
    expect(status.source).toBe('runtime-managed')
  })

  it('falls back to GNU Make found on PATH when no managed install exists', async () => {
    process.env['PATH'] = '/system/bin'
    fsMocks.stat.mockImplementation(async (targetPath: string) => {
      if (targetPath === SYSTEM_EXECUTABLE_PATH) {
        return createFileStats()
      }

      throw new Error(`Unexpected stat path: ${targetPath}`)
    })
    fsMocks.readdir.mockRejectedValue(new Error('missing'))
    spawnMock.mockImplementation(() => createSuccessfulChild('GNU Make 4.4.1\n'))

    const status = await getMakeToolchainStatus()

    expect(status.installed).toBe(true)
    expect(status.source).toBe('system-path')
    expect(status.version).toBe('4.4.1')
    expect(status.executablePath).toBe(SYSTEM_EXECUTABLE_PATH)
  })

  it('skips non-GNU POSIX candidates on PATH until it finds GNU Make', async () => {
    const originalPlatform = process.platform
    const posixSystemPath = '/system/bin'
    const firstCandidatePath = join(posixSystemPath, 'gmake')
    const secondCandidatePath = join(posixSystemPath, 'make')

    Object.defineProperty(process, 'platform', { value: 'linux' })
    process.env['PATH'] = posixSystemPath

    fsMocks.stat.mockImplementation(async (targetPath: string) => {
      if (targetPath === firstCandidatePath || targetPath === secondCandidatePath) {
        return createFileStats()
      }

      throw new Error(`Unexpected stat path: ${targetPath}`)
    })
    fsMocks.readdir.mockRejectedValue(new Error('missing'))
    spawnMock.mockImplementation((command: string) => {
      if (command === firstCandidatePath) {
        return createSuccessfulChild('BSD make 1.0\n')
      }

      return createSuccessfulChild('GNU Make 4.4.1\n')
    })

    try {
      const status = await getMakeToolchainStatus()

      expect(status.installed).toBe(true)
      expect(status.source).toBe('system-path')
      expect(status.executablePath).toBe(secondCandidatePath)
      expect(status.version).toBe('4.4.1')
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
  })

  it('returns early when the managed installation already matches the latest release', async () => {
    process.env['PATH'] = ''
    FETCH_MOCK.mockResolvedValue({
      ok: true,
      text: async () => '<a href="make-4.4.1.tar.gz">make-4.4.1.tar.gz</a>'
    })
    fsMocks.stat.mockImplementation(async (targetPath: string) => {
      if (targetPath === MANAGED_EXECUTABLE_PATH) {
        return createFileStats()
      }

      throw new Error(`Unexpected stat path: ${targetPath}`)
    })
    fsMocks.readFile.mockResolvedValue(
      `${JSON.stringify({
        version: '4.4.1',
        archiveName: 'make-4.4.1.tar.gz',
        installedAt: '2026-05-26T00:00:00.000Z'
      })}\n`
    )
    spawnMock.mockImplementation(() => createSuccessfulChild('GNU Make 4.4.1\n'))

    const result = await installLatestMakeToolchain()

    expect(result).toEqual(
      expect.objectContaining({
        installed: true,
        executablePath: MANAGED_EXECUTABLE_PATH,
        version: '4.4.1',
        releaseVersion: '4.4.1',
        archiveName: 'make-4.4.1.tar.gz',
        replacedExisting: false
      })
    )
    expect(fsMocks.mkdtemp).not.toHaveBeenCalled()
    expect(FETCH_MOCK).toHaveBeenCalledTimes(1)
  })

  it('downloads, builds, and installs the latest managed make toolchain', async () => {
    process.env['PATH'] = process.platform === 'win32' ? '/compiler/bin' : ''

    const stagingRootPath = '/toolchains/.retrogbfull-make-stage'
    const archiveName = 'make-4.4.1.tar.gz'
    const archivePath = join(stagingRootPath, archiveName)
    const extractRootPath = join(stagingRootPath, 'source')
    const sourceRootPath = join(extractRootPath, 'make-4.4.1')
    const stagedInstallPath = join(stagingRootPath, 'install')
    const stagedManagedExecutablePath = join(
      stagedInstallPath,
      'bin',
      process.platform === 'win32' ? 'make.exe' : 'make'
    )
    const installedManagedExecutablePath = join(
      INSTALL_PATH,
      'bin',
      process.platform === 'win32' ? 'make.exe' : 'make'
    )
    const builtWindowsExecutablePath = join(sourceRootPath, 'WinRel', 'gnumake.exe')
    let installationPromoted = false

    FETCH_MOCK
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<a href="${archiveName}">${archiveName}</a>`
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
      })

    fsMocks.mkdir.mockResolvedValue(undefined)
    fsMocks.mkdtemp.mockResolvedValue(stagingRootPath)
    fsMocks.writeFile.mockResolvedValue(undefined)
    fsMocks.copyFile.mockResolvedValue(undefined)
    fsMocks.rm.mockResolvedValue(undefined)
    fsMocks.rename.mockImplementation(async (fromPath: string, toPath: string) => {
      if (fromPath === stagedInstallPath && toPath === INSTALL_PATH) {
        installationPromoted = true
      }
    })
    fsMocks.readdir.mockImplementation(async (targetPath: string) => {
      if (targetPath === extractRootPath) {
        return [
          {
            name: 'make-4.4.1',
            isDirectory: () => true,
            isFile: () => false
          }
        ]
      }

      throw new Error(`Missing directory: ${targetPath}`)
    })
    fsMocks.stat.mockImplementation(async (targetPath: string) => {
      if (process.platform === 'win32' && targetPath === join('/compiler/bin', 'cl.exe')) {
        return createFileStats()
      }

      if (process.platform === 'win32' && targetPath === builtWindowsExecutablePath) {
        return createFileStats()
      }

      if (targetPath === stagedManagedExecutablePath) {
        return createFileStats()
      }

      if (installationPromoted && targetPath === installedManagedExecutablePath) {
        return createFileStats()
      }

      throw new Error(`Missing path: ${targetPath}`)
    })
    spawnMock.mockImplementation((command: string, args: string[]) => {
      if (args.includes('--version')) {
        return createSuccessfulChild('GNU Make 4.4.1\n')
      }

      return createSuccessfulChild('build ok\n')
    })

    const result = await installLatestMakeToolchain()

    expect(result).toEqual(
      expect.objectContaining({
        installed: true,
        installPath: INSTALL_PATH,
        executablePath: installedManagedExecutablePath,
        version: '4.4.1',
        releaseVersion: '4.4.1',
        archiveName,
        replacedExisting: false
      })
    )
    expect(tarExtractMock).toHaveBeenCalledWith({
      cwd: extractRootPath,
      file: archivePath,
      gzip: true
    })
    expect(fsMocks.rename).toHaveBeenCalledWith(stagedInstallPath, INSTALL_PATH)
    if (process.platform === 'win32') {
      expect(fsMocks.copyFile).toHaveBeenCalledTimes(2)
    } else {
      expect(spawnMock).toHaveBeenCalledWith(
        'sh',
        ['./configure', `--prefix=${stagedInstallPath}`],
        {
          cwd: sourceRootPath,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        }
      )
    }
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      join(INSTALL_PATH, '.retrogbfull-make.json'),
      expect.stringContaining('"version": "4.4.1"'),
      'utf-8'
    )
    expect(fsMocks.rm).toHaveBeenCalledWith(stagingRootPath, { recursive: true, force: true })
  })

  it('cleans up and reports when automatic installation is unavailable on the current platform', async () => {
    const originalPlatform = process.platform
    const stagingRootPath = '/toolchains/.retrogbfull-make-stage'
    const archiveName = 'make-4.4.1.tar.gz'
    const archivePath = join(stagingRootPath, archiveName)
    const extractRootPath = join(stagingRootPath, 'source')

    Object.defineProperty(process, 'platform', { value: 'freebsd' })
    process.env['PATH'] = ''

    FETCH_MOCK
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<a href="${archiveName}">${archiveName}</a>`
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
      })

    fsMocks.stat.mockRejectedValue(new Error('missing'))
    fsMocks.mkdir.mockResolvedValue(undefined)
    fsMocks.mkdtemp.mockResolvedValue(stagingRootPath)
    fsMocks.writeFile.mockResolvedValue(undefined)
    fsMocks.rm.mockResolvedValue(undefined)
    fsMocks.readdir.mockImplementation(async (targetPath: string) => {
      if (targetPath === extractRootPath) {
        return [
          {
            name: 'make-4.4.1',
            isDirectory: () => true,
            isFile: () => false
          }
        ]
      }

      throw new Error(`Missing directory: ${targetPath}`)
    })

    try {
      await expect(installLatestMakeToolchain()).rejects.toThrow(
        'Automatic GNU Make installation is not available for freebsd.'
      )
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }

    expect(tarExtractMock).toHaveBeenCalledWith({
      cwd: extractRootPath,
      file: archivePath,
      gzip: true
    })
    expect(fsMocks.rm).toHaveBeenCalledWith(stagingRootPath, { recursive: true, force: true })
  })
})
