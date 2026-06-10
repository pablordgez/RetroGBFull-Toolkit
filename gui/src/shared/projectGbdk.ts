export type GbdkToolchainSource = 'development-root' | 'runtime-managed' | 'override'

export interface GbdkToolchainStatus {
  installed: boolean
  installPath: string
  executablePath: string
  version: string | null
  source: GbdkToolchainSource
  message: string
}

export interface GbdkInstallResult extends GbdkToolchainStatus {
  releaseTag: string
  assetName: string
  replacedExisting: boolean
}
