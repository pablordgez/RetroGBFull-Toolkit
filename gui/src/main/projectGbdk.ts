import extractZip from 'extract-zip'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import * as tar from 'tar'
import type { GbdkInstallResult, GbdkToolchainStatus } from '../shared/projectGbdk'
import { getBundledGbdkPath, getBundledGbdkSource } from './projectCodeShared'

interface GithubReleaseAsset {
  name: string
  browser_download_url: string
}

interface GithubReleasePayload {
  tag_name: string
  assets: GithubReleaseAsset[]
}

interface GbdkInstallMetadata {
  version: string
  assetName: string
  installedAt: string
}

const GBDK_RELEASES_API_URL = 'https://api.github.com/repos/gbdk-2020/gbdk-2020/releases/latest'
const GBDK_METADATA_FILE_NAME = '.retrogbfull-gbdk.json'

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

const getExpectedGbdkExecutablePath = (installPath: string): string => {
  return process.platform === 'win32'
    ? join(installPath, 'bin', 'lcc.exe')
    : join(installPath, 'bin', 'lcc')
}

const isValidGbdkDirectory = async (directoryPath: string): Promise<boolean> => {
  try {
    const [directoryStats, includeStats, libStats, executableStats] = await Promise.all([
      stat(directoryPath),
      stat(join(directoryPath, 'include')),
      stat(join(directoryPath, 'lib')),
      stat(getExpectedGbdkExecutablePath(directoryPath))
    ])

    return (
      directoryStats.isDirectory() &&
      includeStats.isDirectory() &&
      libStats.isDirectory() &&
      executableStats.isFile()
    )
  } catch {
    return false
  }
}

const readGbdkInstallMetadata = async (installPath: string): Promise<GbdkInstallMetadata | null> => {
  try {
    const rawContent = await readFile(join(installPath, GBDK_METADATA_FILE_NAME), 'utf-8')
    const parsed = JSON.parse(rawContent) as Partial<GbdkInstallMetadata>

    if (
      typeof parsed.version !== 'string' ||
      typeof parsed.assetName !== 'string' ||
      typeof parsed.installedAt !== 'string'
    ) {
      return null
    }

    return {
      version: parsed.version,
      assetName: parsed.assetName,
      installedAt: parsed.installedAt
    }
  } catch {
    return null
  }
}

const writeGbdkInstallMetadata = async (
  installPath: string,
  metadata: GbdkInstallMetadata
): Promise<void> => {
  await writeFile(
    join(installPath, GBDK_METADATA_FILE_NAME),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf-8'
  )
}

const findExtractedGbdkRoot = async (extractRootPath: string): Promise<string> => {
  if (await isValidGbdkDirectory(extractRootPath)) {
    return extractRootPath
  }

  const entries = await readdir(extractRootPath, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const candidatePath = join(extractRootPath, entry.name)

    if (await isValidGbdkDirectory(candidatePath)) {
      return candidatePath
    }
  }

  throw new Error('The downloaded GBDK archive did not contain a valid toolchain directory.')
}

const downloadReleaseArchive = async (downloadUrl: string, assetName: string): Promise<Buffer> => {
  const response = await fetch(downloadUrl, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'RetroGBFull Toolkit'
    }
  })

  if (!response.ok) {
    throw new Error(
      `Could not download ${assetName} from GitHub. (${response.status} ${response.statusText})`
    )
  }

  return Buffer.from(await response.arrayBuffer())
}

const extractReleaseArchive = async (
  archivePath: string,
  assetName: string,
  destinationPath: string
): Promise<void> => {
  await mkdir(destinationPath, { recursive: true })

  if (assetName.endsWith('.zip')) {
    await extractZip(archivePath, { dir: destinationPath })
    return
  }

  if (assetName.endsWith('.tar.gz')) {
    await tar.x({
      cwd: destinationPath,
      file: archivePath,
      gzip: true
    })
    return
  }

  throw new Error(`Unsupported GBDK archive format: ${assetName}`)
}

const installExtractedGbdkDirectory = async (
  extractedDirectoryPath: string,
  installPath: string
): Promise<boolean> => {
  const installParentPath = dirname(installPath)
  const backupPath = join(
    installParentPath,
    `.retrogbfull-gbdk-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
  const hadExistingInstallation = await pathExists(installPath)

  try {
    if (hadExistingInstallation) {
      await rename(installPath, backupPath)
    }

    await rename(extractedDirectoryPath, installPath)

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

const fetchLatestRelease = async (): Promise<GithubReleasePayload> => {
  const response = await fetch(GBDK_RELEASES_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'RetroGBFull Toolkit'
    }
  })

  if (!response.ok) {
    throw new Error(
      `Could not fetch the latest GBDK release from GitHub. (${response.status} ${response.statusText})`
    )
  }

  return (await response.json()) as GithubReleasePayload
}

const buildUnsupportedPlatformMessage = (platform: NodeJS.Platform, arch: string): string => {
  return `Automatic GBDK installation is not available for ${platform} (${arch}).`
}

export const selectGbdkReleaseAsset = (
  assets: GithubReleaseAsset[],
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): GithubReleaseAsset => {
  const selectors: Record<string, (asset: GithubReleaseAsset) => boolean> = {
    'win32:x64': (asset) => /win64\.zip$/i.test(asset.name),
    'win32:ia32': (asset) => /win32\.zip$/i.test(asset.name),
    'linux:x64': (asset) => /linux64\.tar\.gz$/i.test(asset.name),
    'linux:arm64': (asset) => /linux-arm64\.tar\.gz$/i.test(asset.name),
    'darwin:x64': (asset) => /macos\.tar\.gz$/i.test(asset.name),
    'darwin:arm64': (asset) => /macos-arm64\.tar\.gz$/i.test(asset.name)
  }

  const selector = selectors[`${platform}:${arch}`]

  if (!selector) {
    throw new Error(buildUnsupportedPlatformMessage(platform, arch))
  }

  const asset = assets.find(selector)

  if (!asset) {
    throw new Error(`The latest GBDK release does not include an installer for ${platform} (${arch}).`)
  }

  return asset
}

export const getGbdkToolchainStatus = async (): Promise<GbdkToolchainStatus> => {
  const installPath = getBundledGbdkPath()
  const executablePath = getExpectedGbdkExecutablePath(installPath)
  const installed = await isValidGbdkDirectory(installPath)
  const metadata = installed ? await readGbdkInstallMetadata(installPath) : null

  return {
    installed,
    installPath,
    executablePath,
    version: metadata?.version ?? null,
    source: getBundledGbdkSource(),
    message: installed
      ? `GBDK is available at ${installPath}.`
      : `GBDK was not found at ${installPath}.`
  }
}

export const installLatestGbdkToolchain = async (): Promise<GbdkInstallResult> => {
  const installPath = getBundledGbdkPath()
  const installParentPath = dirname(installPath)
  await mkdir(installParentPath, { recursive: true })
  const stagingRootPath = await mkdtemp(join(installParentPath, '.retrogbfull-gbdk-'))
  const release = await fetchLatestRelease()
  const asset = selectGbdkReleaseAsset(release.assets)
  const archivePath = join(stagingRootPath, asset.name)
  const extractRootPath = join(stagingRootPath, 'extracted')

  try {
    const archiveBuffer = await downloadReleaseArchive(asset.browser_download_url, asset.name)
    await writeFile(archivePath, archiveBuffer)
    await extractReleaseArchive(archivePath, asset.name, extractRootPath)

    const extractedGbdkPath = await findExtractedGbdkRoot(extractRootPath)
    const replacedExisting = await installExtractedGbdkDirectory(extractedGbdkPath, installPath)

    await writeGbdkInstallMetadata(installPath, {
      version: release.tag_name,
      assetName: asset.name,
      installedAt: new Date().toISOString()
    })

    return {
      installed: true,
      installPath,
      executablePath: getExpectedGbdkExecutablePath(installPath),
      version: release.tag_name,
      source: getBundledGbdkSource(),
      message: `Installed ${release.tag_name} to ${installPath}.`,
      releaseTag: release.tag_name,
      assetName: asset.name,
      replacedExisting
    }
  } finally {
    await rm(stagingRootPath, { recursive: true, force: true })
  }
}
