import { resolvePathWithinProject } from './projectResourcePaths'

export const resolveResourceDirectory = (projectPath: string, resourcePath: string): string => {
  return resolvePathWithinProject(
    projectPath,
    resourcePath,
    'The selected folder is outside the project directory.'
  )
}
