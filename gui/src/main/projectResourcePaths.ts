import { isAbsolute, relative, resolve } from 'path'
import { ProjectLauncherError } from './projectLauncher'
import { DEFAULT_PROJECT_RESOURCE_BANK } from '../shared/projectResourceModels'

export const normalizeResourcePath = (resourcePath: string): string => {
  return resourcePath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.')
    .join('/')
}

export const normalizeParentPath = (resourcePath: string | null | undefined): string | null => {
  const normalizedPath = normalizeResourcePath(resourcePath ?? '')
  return normalizedPath.length > 0 ? normalizedPath : null
}

// returns the absolute path to a resource within the project
export const resolvePathWithinProject = (
  projectPath: string,
  resourcePath: string,
  errorMessage = 'The selected path is outside the project directory.',
  normalizePath = true
): string => {
  const normalizedPath = normalizePath ? normalizeResourcePath(resourcePath) : resourcePath
  const targetPath = resolve(projectPath, normalizedPath || '.')
  const relativePath = relative(projectPath, targetPath)

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new ProjectLauncherError(errorMessage)
  }

  return targetPath
}

export const isValidProjectResourceBank = (value: unknown): value is number => {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255
}

export const normalizeProjectResourceBank = (value: unknown): number => {
  return isValidProjectResourceBank(value) ? Number(value) : DEFAULT_PROJECT_RESOURCE_BANK
}
