import { spawn } from 'child_process'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { delimiter, dirname, extname, join } from 'path'
import * as tar from 'tar'
import type { MakeInstallResult, MakeToolchainStatus } from '../shared/projectMake'
import { getBundledMakePath, getBundledMakeSource } from './projectCodeShared'

interface MakeSourceArchive {
  version: string
  archiveName: string
  downloadUrl: string
}

interface MakeInstallMetadata {
  version: string
  archiveName: string
  installedAt: string
}

const MAKE_RELEASES_INDEX_URL = 'https://ftp.gnu.org/gnu/make/'
const MAKE_METADATA_FILE_NAME = '.retrogbfull-make.json'
const WINDOWS_VSWHERE_FALLBACK_PATH =
  'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe'
const WINDOWS_MANAGED_EXECUTABLE_NAMES = ['make.exe', 'gnumake.exe']
const WINDOWS_PATH_EXECUTABLE_NAMES = [
  'make.exe',
  'gnumake.exe',
  'mingw32-make.exe',
  'make.cmd',
  'gnumake.cmd',
  'mingw32-make.cmd'
]
const POSIX_PATH_EXECUTABLE_NAMES = ['gmake', 'make']

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

const getManagedMakeExecutableCandidates = (installPath: string): string[] => {
  if (process.platform === 'win32') {
    return WINDOWS_MANAGED_EXECUTABLE_NAMES.map((name) => join(installPath, 'bin', name))
  }

  return [join(installPath, 'bin', 'make')]
}

const getExpectedManagedMakeExecutablePath = (installPath: string): string => {
  return getManagedMakeExecutableCandidates(installPath)[0]
}

const readMakeInstallMetadata = async (installPath: string): Promise<MakeInstallMetadata | null> => {
  try {
    const rawContent = await readFile(join(installPath, MAKE_METADATA_FILE_NAME), 'utf-8')
    const parsed = JSON.parse(rawContent) as Partial<MakeInstallMetadata>

    if (
      typeof parsed.version !== 'string' ||
      typeof parsed.archiveName !== 'string' ||
      typeof parsed.installedAt !== 'string'
    ) {
      return null
    }

    return {
      version: parsed.version,
      archiveName: parsed.archiveName,
      installedAt: parsed.installedAt
    }
  } catch {
    return null
  }
}

const writeMakeInstallMetadata = async (
  installPath: string,
  metadata: MakeInstallMetadata
): Promise<void> => {
  await writeFile(
    join(installPath, MAKE_METADATA_FILE_NAME),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf-8'
  )
}

const compareVersionParts = (left: string, right: string): number => {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10))
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10))
  const maxLength = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0

    if (leftPart !== rightPart) {
      return leftPart - rightPart
    }
  }

  return 0
}

export const selectLatestMakeSourceArchive = (indexHtml: string): MakeSourceArchive => {
  const archiveMatches = [...indexHtml.matchAll(/href="(make-([0-9]+(?:\.[0-9]+)*)\.tar\.gz)"/g)]

  if (archiveMatches.length === 0) {
    throw new Error('Could not find any GNU Make source archives on the official GNU download page.')
  }

  const archivesByVersion = new Map<string, MakeSourceArchive>()

  for (const match of archiveMatches) {
    const archiveName = match[1]
    const version = match[2]

    archivesByVersion.set(version, {
      version,
      archiveName,
      downloadUrl: new URL(archiveName, MAKE_RELEASES_INDEX_URL).toString()
    })
  }

  const latestVersion = [...archivesByVersion.keys()].sort(compareVersionParts).at(-1)

  if (!latestVersion) {
    throw new Error('Could not determine the latest GNU Make source archive.')
  }

  return archivesByVersion.get(latestVersion)!
}

const fetchLatestMakeSourceArchive = async (): Promise<MakeSourceArchive> => {
  const response = await fetch(MAKE_RELEASES_INDEX_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'RetroGBFull Toolkit'
    }
  })

  if (!response.ok) {
    throw new Error(
      `Could not fetch the GNU Make download index. (${response.status} ${response.statusText})`
    )
  }

  return selectLatestMakeSourceArchive(await response.text())
}

const downloadArchiveBuffer = async (downloadUrl: string, archiveName: string): Promise<Buffer> => {
  const response = await fetch(downloadUrl, {
    headers: {
      Accept: 'application/gzip,application/octet-stream',
      'User-Agent': 'RetroGBFull Toolkit'
    }
  })

  if (!response.ok) {
    throw new Error(
      `Could not download ${archiveName} from GNU. (${response.status} ${response.statusText})`
    )
  }

  return Buffer.from(await response.arrayBuffer())
}

const runCommand = async (
  command: string,
  args: string[],
  cwd: string,
  options?: { shell?: boolean }
): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: options?.shell ?? false
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve({ stdout, stderr })
        return
      }

      const output = [stderr.trim(), stdout.trim()].find((value) => value.length > 0) ?? 'No output.'
      reject(
        new Error(
          `Command failed (${command} ${args.join(' ')}). ${output}`
        )
      )
    })
  })
}

const parseMakeVersion = (output: string): string | null => {
  const firstLine = output.split(/\r?\n/, 1)[0] ?? ''
  const versionMatch = firstLine.match(/GNU Make\s+([0-9][0-9A-Za-z.\-]*)/)

  return versionMatch?.[1] ?? null
}

const readMakeVersionFromExecutable = async (executablePath: string): Promise<string | null> => {
  try {
    const executableExtension = extname(executablePath).toLowerCase()
    const { stdout, stderr } =
      process.platform === 'win32' &&
      (executableExtension === '.cmd' || executableExtension === '.bat')
        ? await runCommand(executablePath, ['--version'], dirname(executablePath), { shell: true })
        : await runCommand(executablePath, ['--version'], dirname(executablePath))

    return parseMakeVersion(stdout) ?? parseMakeVersion(stderr)
  } catch {
    return null
  }
}

const isGnuMakeExecutable = async (executablePath: string): Promise<boolean> => {
  return (await readMakeVersionFromExecutable(executablePath)) !== null
}

const findExecutableInPath = async (executableName: string): Promise<string | null> => {
  const rawPath = process.env['PATH']

  if (!rawPath) {
    return null
  }

  for (const rawDirectory of rawPath.split(delimiter)) {
    const directoryPath = rawDirectory.replace(/^"+|"+$/g, '').trim()

    if (!directoryPath) {
      continue
    }

    const candidatePath = join(directoryPath, executableName)

    try {
      const candidateStats = await stat(candidatePath)

      if (candidateStats.isFile()) {
        return candidatePath
      }
    } catch {
      // Ignore missing entries from PATH.
    }
  }

  return null
}

const hasWindowsMakeBuildToolchain = async (): Promise<boolean> => {
  if (process.platform !== 'win32') {
    return true
  }

  const [msvcCompilerPath, gccCompilerPath, vswherePath, fallbackVswhereExists] = await Promise.all([
    findExecutableInPath('cl.exe'),
    findExecutableInPath('gcc.exe'),
    findExecutableInPath('vswhere.exe'),
    pathExists(WINDOWS_VSWHERE_FALLBACK_PATH)
  ])

  return Boolean(msvcCompilerPath || gccCompilerPath || vswherePath || fallbackVswhereExists)
}

const findSystemMakeExecutable = async (): Promise<string | null> => {
  const candidateNames =
    process.platform === 'win32' ? WINDOWS_PATH_EXECUTABLE_NAMES : POSIX_PATH_EXECUTABLE_NAMES

  for (const candidateName of candidateNames) {
    const candidatePath = await findExecutableInPath(candidateName)

    if (!candidatePath) {
      continue
    }

    if (await isGnuMakeExecutable(candidatePath)) {
      return candidatePath
    }
  }

  return null
}

const extractSourceArchive = async (archivePath: string, destinationPath: string): Promise<void> => {
  await mkdir(destinationPath, { recursive: true })
  await tar.x({
    cwd: destinationPath,
    file: archivePath,
    gzip: true
  })
}

const findExtractedSourceRoot = async (extractRootPath: string): Promise<string> => {
  const entries = await readdir(extractRootPath, { withFileTypes: true })
  const matchingDirectory = entries.find(
    (entry) => entry.isDirectory() && /^make-\d/.test(entry.name)
  )

  if (!matchingDirectory) {
    throw new Error('The downloaded GNU Make archive did not contain a valid source directory.')
  }

  return join(extractRootPath, matchingDirectory.name)
}

const findFilesByName = async (rootPath: string, targetNames: Set<string>): Promise<string[]> => {
  const matches: string[] = []
  const directoriesToVisit = [rootPath]

  while (directoriesToVisit.length > 0) {
    const currentPath = directoriesToVisit.pop()

    if (!currentPath) {
      continue
    }

    let entries

    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryPath = join(currentPath, entry.name)

      if (entry.isDirectory()) {
        directoriesToVisit.push(entryPath)
        continue
      }

      if (entry.isFile() && targetNames.has(entry.name.toLowerCase())) {
        matches.push(entryPath)
      }
    }
  }

  return matches
}

const findFirstCallableMakeExecutable = async (candidatePaths: string[]): Promise<string | null> => {
  for (const candidatePath of candidatePaths) {
    try {
      const candidateStats = await stat(candidatePath)

      if (!candidateStats.isFile()) {
        continue
      }
    } catch {
      continue
    }

    if (await isGnuMakeExecutable(candidatePath)) {
      return candidatePath
    }
  }

  return null
}

const resolveManagedMakeExecutablePath = async (installPath: string): Promise<string | null> => {
  const directExecutablePath = await findFirstCallableMakeExecutable(
    getManagedMakeExecutableCandidates(installPath)
  )

  if (directExecutablePath) {
    return directExecutablePath
  }

  const discoveredExecutablePaths = await findFilesByName(
    installPath,
    new Set(['make.exe', 'gnumake.exe', 'make', 'gmake', 'make.cmd', 'gnumake.cmd'])
  )

  return findFirstCallableMakeExecutable(discoveredExecutablePaths)
}

const summarizeCommandOutput = (stdout: string, stderr: string): string => {
  const combinedOutput = [stdout.trim(), stderr.trim()].filter((value) => value.length > 0).join('\n')

  if (!combinedOutput) {
    return 'No build output was captured.'
  }

  const outputLines = combinedOutput.split(/\r?\n/)
  const trailingLines = outputLines.slice(-12)

  return trailingLines.join('\n')
}

const replaceInstalledDirectory = async (
  replacementPath: string,
  installPath: string
): Promise<boolean> => {
  const installParentPath = dirname(installPath)
  const backupPath = join(
    installParentPath,
    `.retrogbfull-make-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
  const hadExistingInstallation = await pathExists(installPath)

  try {
    if (hadExistingInstallation) {
      await rename(installPath, backupPath)
    }

    await rename(replacementPath, installPath)

    if (hadExistingInstallation) {
      await rm(backupPath, { recursive: true, force: true })
    }

    return hadExistingInstallation
  } catch (error) {
    if (hadExistingInstallation && !(await pathExists(installPath)) && (await pathExists(backupPath))) {
      await rename(backupPath, installPath)
    }

    throw error
  }
}

const installMakeFromSourceOnPosix = async (
  sourceRootPath: string,
  stagedInstallPath: string
): Promise<void> => {
  await runCommand('sh', ['./configure', `--prefix=${stagedInstallPath}`], sourceRootPath)
  await runCommand('sh', ['./build.sh'], sourceRootPath)
  await runCommand(join(sourceRootPath, 'make'), ['install'], sourceRootPath)
}

const installMakeFromSourceOnWindows = async (
  sourceRootPath: string,
  stagedInstallPath: string
): Promise<void> => {
  let previousBuildErrorMessage = ''
  let buildOutputSummary = ''

  try {
    const buildResult = await runCommand(
      'cmd.exe',
      ['/d', '/c', 'build_w32.bat', '--without-guile'],
      sourceRootPath
    )
    buildOutputSummary = summarizeCommandOutput(buildResult.stdout, buildResult.stderr)
  } catch (error) {
    const msvcError = error instanceof Error ? error : new Error(String(error))
    previousBuildErrorMessage = msvcError.message

    try {
      const buildResult = await runCommand(
        'cmd.exe',
        ['/d', '/c', 'build_w32.bat', '--without-guile', 'gcc'],
        sourceRootPath
      )
      buildOutputSummary = summarizeCommandOutput(buildResult.stdout, buildResult.stderr)
    } catch (gccError) {
      const nextError = gccError instanceof Error ? gccError : new Error(String(gccError))
      throw new Error(
        `Could not build GNU Make from the official Windows source package. Tried the MSVC and MinGW build flows from README.W32. ${msvcError.message} ${nextError.message}`
      )
    }
  }

  const outputCandidates = [
    join(sourceRootPath, 'WinRel', 'gnumake.exe'),
    join(sourceRootPath, 'GccRel', 'gnumake.exe'),
    join(sourceRootPath, 'WinDebug', 'gnumake.exe'),
    join(sourceRootPath, 'GccDebug', 'gnumake.exe'),
    join(sourceRootPath, 'TccRel', 'gnumake.exe'),
    join(sourceRootPath, 'TccDebug', 'gnumake.exe'),
    join(sourceRootPath, 'WinRel', 'make.exe'),
    join(sourceRootPath, 'GccRel', 'make.exe'),
    join(sourceRootPath, 'WinDebug', 'make.exe'),
    join(sourceRootPath, 'GccDebug', 'make.exe'),
    join(sourceRootPath, 'TccRel', 'make.exe'),
    join(sourceRootPath, 'TccDebug', 'make.exe')
  ]
  const builtExecutablePath = await findFirstCallableMakeExecutable(outputCandidates)
  const fallbackExecutablePath =
    builtExecutablePath ??
    (await findFirstCallableMakeExecutable(
      await findFilesByName(sourceRootPath, new Set(['gnumake.exe', 'make.exe', 'make.cmd', 'gnumake.cmd']))
    ))

  if (!fallbackExecutablePath) {
    const previousErrorMessage = previousBuildErrorMessage ? ` ${previousBuildErrorMessage}` : ''
    const outputSummaryMessage = buildOutputSummary ? ` Build output:\n${buildOutputSummary}` : ''

    throw new Error(
      `GNU Make finished building, but the expected Windows executable was not found.${previousErrorMessage}${outputSummaryMessage}`
    )
  }

  const binDirectoryPath = join(stagedInstallPath, 'bin')
  await mkdir(binDirectoryPath, { recursive: true })
  await copyFile(fallbackExecutablePath, join(binDirectoryPath, 'gnumake.exe'))
  await copyFile(fallbackExecutablePath, join(binDirectoryPath, 'make.exe'))
  await writeFile(
    join(binDirectoryPath, 'make.cmd'),
    '@echo off\r\n"%~dp0gnumake.exe" %*\r\n',
    'utf-8'
  )
}

export const getMakeToolchainStatus = async (): Promise<MakeToolchainStatus> => {
  const installPath = getBundledMakePath()
  const managedExecutablePath = await resolveManagedMakeExecutablePath(installPath)

  if (managedExecutablePath) {
    const metadata = await readMakeInstallMetadata(installPath)
    const detectedVersion = await readMakeVersionFromExecutable(managedExecutablePath)

    return {
      installed: true,
      installPath,
      executablePath: managedExecutablePath,
      version: metadata?.version ?? detectedVersion,
      source: getBundledMakeSource(),
      message: `GNU Make is available at ${managedExecutablePath}.`
    }
  }

  const systemExecutablePath = await findSystemMakeExecutable()

  if (systemExecutablePath) {
    return {
      installed: true,
      installPath: dirname(systemExecutablePath),
      executablePath: systemExecutablePath,
      version: await readMakeVersionFromExecutable(systemExecutablePath),
      source: 'system-path',
      message: `GNU Make is available from ${systemExecutablePath}.`
    }
  }

  return {
    installed: false,
    installPath,
    executablePath: getExpectedManagedMakeExecutablePath(installPath),
    version: null,
    source: getBundledMakeSource(),
    message: `GNU Make was not found at ${installPath}.`
  }
}

export const installLatestMakeToolchain = async (): Promise<MakeInstallResult> => {
  const currentStatus = await getMakeToolchainStatus()
  const release = await fetchLatestMakeSourceArchive()

  if (currentStatus.installed && currentStatus.version === release.version) {
    return {
      ...currentStatus,
      message: `GNU Make ${release.version} is already available at ${currentStatus.executablePath}.`,
      releaseVersion: release.version,
      archiveName: release.archiveName,
      replacedExisting: false
    }
  }

  if (process.platform === 'win32' && !(await hasWindowsMakeBuildToolchain())) {
    const existingStatusMessage = currentStatus.installed
      ? ` Existing GNU Make remains available at ${currentStatus.executablePath}.`
      : ''

    throw new Error(
      `Automatic GNU Make installation from the official GNU source package on Windows requires a supported compiler environment such as MSVC or MinGW GCC, but none was found on PATH.${existingStatusMessage}`
    )
  }

  const installPath = getBundledMakePath()
  const installParentPath = dirname(installPath)
  await mkdir(installParentPath, { recursive: true })
  const stagingRootPath = await mkdtemp(join(installParentPath, '.retrogbfull-make-'))
  const archivePath = join(stagingRootPath, release.archiveName)
  const extractRootPath = join(stagingRootPath, 'source')
  const stagedInstallPath = join(stagingRootPath, 'install')

  try {
    const archiveBuffer = await downloadArchiveBuffer(release.downloadUrl, release.archiveName)
    await writeFile(archivePath, archiveBuffer)
    await extractSourceArchive(archivePath, extractRootPath)

    const sourceRootPath = await findExtractedSourceRoot(extractRootPath)

    if (process.platform === 'win32') {
      await installMakeFromSourceOnWindows(sourceRootPath, stagedInstallPath)
    } else if (process.platform === 'linux' || process.platform === 'darwin') {
      await installMakeFromSourceOnPosix(sourceRootPath, stagedInstallPath)
    } else {
      throw new Error(`Automatic GNU Make installation is not available for ${process.platform}.`)
    }

    const replacedExisting = await replaceInstalledDirectory(stagedInstallPath, installPath)
    const installedExecutablePath = await resolveManagedMakeExecutablePath(installPath)

    if (!installedExecutablePath) {
      throw new Error('GNU Make was installed, but the managed executable could not be found afterwards.')
    }

    await writeMakeInstallMetadata(installPath, {
      version: release.version,
      archiveName: release.archiveName,
      installedAt: new Date().toISOString()
    })

    return {
      installed: true,
      installPath,
      executablePath: installedExecutablePath,
      version: release.version,
      source: getBundledMakeSource(),
      message: `Installed GNU Make ${release.version} to ${installPath}.`,
      releaseVersion: release.version,
      archiveName: release.archiveName,
      replacedExisting
    }
  } finally {
    await rm(stagingRootPath, { recursive: true, force: true })
  }
}
