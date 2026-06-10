export type MakeToolchainSource =
  | 'development-root'
  | 'override'
  | 'runtime-managed'
  | 'system-path'

export interface MakeToolchainStatus {
  installed: boolean
  installPath: string
  executablePath: string
  version: string | null
  source: MakeToolchainSource
  message: string
}

export interface MakeInstallResult extends MakeToolchainStatus {
  releaseVersion: string
  archiveName: string
  replacedExisting: boolean
}
