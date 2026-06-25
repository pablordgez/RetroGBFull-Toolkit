export type ProjectScriptKind = 'actor' | 'scene' | 'general'

export const PROJECT_SCRIPT_LABELS: Record<ProjectScriptKind, string> = {
  actor: 'Actor Script',
  scene: 'Scene Script',
  general: 'General Script'
}

export const PROJECT_SCRIPT_DIRECTORY_BY_KIND: Record<ProjectScriptKind, string> = {
  actor: 'src/CustomActors',
  scene: 'src/CustomScenes',
  general: 'src/Scripts'
}

export const PROJECT_SCRIPT_SOURCE_EXTENSION = '.c'
export const PROJECT_SCRIPT_HEADER_EXTENSION = '.h'

export const buildProjectScriptFileName = (scriptName: string): string => {
  return `${scriptName}${PROJECT_SCRIPT_SOURCE_EXTENSION}`
}

export const buildProjectScriptHeaderFileName = (scriptName: string): string => {
  return `${scriptName}${PROJECT_SCRIPT_HEADER_EXTENSION}`
}

export const getProjectScriptDisplayName = (fileName: string): string => {
  const normalizedFileName = fileName.toLowerCase()

  if (normalizedFileName.endsWith(PROJECT_SCRIPT_SOURCE_EXTENSION)) {
    return fileName.slice(0, -PROJECT_SCRIPT_SOURCE_EXTENSION.length)
  }

  if (normalizedFileName.endsWith(PROJECT_SCRIPT_HEADER_EXTENSION)) {
    return fileName.slice(0, -PROJECT_SCRIPT_HEADER_EXTENSION.length)
  }

  return fileName
}

export const getProjectScriptKindFromPath = (resourcePath: string): ProjectScriptKind | null => {
  const normalizedPath = resourcePath.replace(/\\/g, '/').toLowerCase()

  for (const [scriptKind, directory] of Object.entries(PROJECT_SCRIPT_DIRECTORY_BY_KIND) as Array<
    [ProjectScriptKind, string]
  >) {
    if (normalizedPath.startsWith(`${directory.toLowerCase()}/`)) {
      return scriptKind
    }
  }

  return null
}

export const isProjectScriptPathWithinKindRoot = (
  scriptKind: ProjectScriptKind,
  resourcePath: string
): boolean => {
  const normalizedPath = resourcePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const rootPath = PROJECT_SCRIPT_DIRECTORY_BY_KIND[scriptKind].toLowerCase()

  return normalizedPath === rootPath || normalizedPath.startsWith(`${rootPath}/`)
}

const getProjectScriptKindDirectoryName = (scriptKind: ProjectScriptKind): string => {
  const scriptDirectory = PROJECT_SCRIPT_DIRECTORY_BY_KIND[scriptKind].replace(/\\/g, '/')
  return scriptDirectory.split('/').at(-1) ?? scriptDirectory
}

export const getProjectScriptKindRootFromPath = (
  scriptKind: ProjectScriptKind,
  resourcePath: string
): string | null => {
  const normalizedSegments = resourcePath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
  const scriptDirectoryName = getProjectScriptKindDirectoryName(scriptKind).toLowerCase()
  const scriptDirectoryIndex = normalizedSegments.findIndex(
    (segment) => segment.toLowerCase() === scriptDirectoryName
  )

  if (scriptDirectoryIndex < 0) {
    return null
  }

  return normalizedSegments.slice(0, scriptDirectoryIndex + 1).join('/')
}

export const isProjectScriptPathWithinAllowedKindRoot = (
  scriptKind: ProjectScriptKind,
  scriptResourcePath: string,
  resourcePath: string
): boolean => {
  if (isProjectScriptPathWithinKindRoot(scriptKind, resourcePath)) {
    return true
  }

  const currentKindRoot = getProjectScriptKindRootFromPath(scriptKind, scriptResourcePath)

  if (!currentKindRoot) {
    return false
  }

  const normalizedPath = resourcePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const normalizedCurrentKindRoot = currentKindRoot.toLowerCase()

  return (
    normalizedPath === normalizedCurrentKindRoot ||
    normalizedPath.startsWith(`${normalizedCurrentKindRoot}/`)
  )
}

export const isProjectScriptSourcePath = (resourcePath: string): boolean => {
  return resourcePath.toLowerCase().endsWith(PROJECT_SCRIPT_SOURCE_EXTENSION)
}
