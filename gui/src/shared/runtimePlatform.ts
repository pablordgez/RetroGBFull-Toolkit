export type RuntimePlatform = 'win32' | 'darwin' | 'linux' | 'unknown'

export const getCurrentRuntimePlatform = (platform: string): RuntimePlatform => {
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
    return platform
  }

  return 'unknown'
}
