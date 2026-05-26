import { chmod, mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { getMakeToolchainStatus, selectLatestMakeSourceArchive } from '../../src/main/projectMake'

const tempDirectories: string[] = []
const originalPath = process.env['PATH']
const originalRuntimeMakePath = process.env['RETROGBFULL_RUNTIME_MAKE_PATH']
const originalBundledMakePath = process.env['RETROGBFULL_BUNDLED_MAKE_PATH']

const createTempDirectory = async (): Promise<string> => {
  const directoryPath = await mkdtemp(join(tmpdir(), 'retrogb-make-'))
  tempDirectories.push(directoryPath)
  return directoryPath
}

const createManagedMakeFixture = async (rootPath: string): Promise<void> => {
  await mkdir(join(rootPath, 'bin'), { recursive: true })

  if (process.platform === 'win32') {
    await writeFile(
      join(rootPath, 'bin', 'make.cmd'),
      '@echo off\r\necho GNU Make 4.4.1\r\n',
      'utf-8'
    )
    await writeFile(join(rootPath, 'bin', 'make.exe'), '', 'utf-8')
    return
  }

  await writeFile(join(rootPath, 'bin', 'make'), '#!/bin/sh\necho "GNU Make 4.4.1"\n', 'utf-8')
  await chmod(join(rootPath, 'bin', 'make'), 0o755)
}

const createSystemMakeFixture = async (rootPath: string): Promise<string> => {
  if (process.platform === 'win32') {
    const executablePath = join(rootPath, 'gnumake.cmd')
    await writeFile(executablePath, '@echo off\r\necho GNU Make 4.4.1\r\n', 'utf-8')
    return executablePath
  }

  const executablePath = join(rootPath, 'gmake')
  await writeFile(executablePath, '#!/bin/sh\necho "GNU Make 4.4.1"\n', 'utf-8')
  await chmod(executablePath, 0o755)
  return executablePath
}

describe('projectMake', () => {
  afterEach(async () => {
    if (originalPath === undefined) {
      delete process.env['PATH']
    } else {
      process.env['PATH'] = originalPath
    }

    if (originalRuntimeMakePath === undefined) {
      delete process.env['RETROGBFULL_RUNTIME_MAKE_PATH']
    } else {
      process.env['RETROGBFULL_RUNTIME_MAKE_PATH'] = originalRuntimeMakePath
    }

    if (originalBundledMakePath === undefined) {
      delete process.env['RETROGBFULL_BUNDLED_MAKE_PATH']
    } else {
      process.env['RETROGBFULL_BUNDLED_MAKE_PATH'] = originalBundledMakePath
    }

    await Promise.all(
      tempDirectories.splice(0).map((directoryPath) =>
        rm(directoryPath, { recursive: true, force: true })
      )
    )
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

  it('reports when the configured managed make directory is missing', async () => {
    const workspacePath = await createTempDirectory()
    const installPath = join(workspacePath, 'make')
    process.env['RETROGBFULL_RUNTIME_MAKE_PATH'] = installPath
    delete process.env['RETROGBFULL_BUNDLED_MAKE_PATH']
    process.env['PATH'] = ''

    const status = await getMakeToolchainStatus()

    expect(status.installed).toBe(false)
    expect(status.installPath).toBe(installPath)
    expect(status.source).toBe('runtime-managed')
  })

  it('reports an installed managed make directory and reads stored metadata', async () => {
    const workspacePath = await createTempDirectory()
    const installPath = join(workspacePath, 'make')
    process.env['RETROGBFULL_RUNTIME_MAKE_PATH'] = installPath
    delete process.env['RETROGBFULL_BUNDLED_MAKE_PATH']
    process.env['PATH'] = ''

    await createManagedMakeFixture(installPath)
    await writeFile(
      join(installPath, '.retrogbfull-make.json'),
      `${JSON.stringify({
        version: '4.4.1',
        archiveName: 'make-4.4.1.tar.gz',
        installedAt: '2026-05-26T00:00:00.000Z'
      })}\n`,
      'utf-8'
    )

    const status = await getMakeToolchainStatus()

    expect(status.installed).toBe(true)
    expect(status.version).toBe('4.4.1')
    expect(status.source).toBe('runtime-managed')
  })

  it('falls back to GNU Make found on PATH when no managed install exists', async () => {
    const workspacePath = await createTempDirectory()
    const pathToolDirectory = await createTempDirectory()
    const installPath = join(workspacePath, 'make')
    process.env['RETROGBFULL_RUNTIME_MAKE_PATH'] = installPath
    delete process.env['RETROGBFULL_BUNDLED_MAKE_PATH']

    await createSystemMakeFixture(pathToolDirectory)
    process.env['PATH'] = pathToolDirectory

    const status = await getMakeToolchainStatus()

    expect(status.installed).toBe(true)
    expect(status.source).toBe('system-path')
    expect(status.version).toBe('4.4.1')
  })
})
