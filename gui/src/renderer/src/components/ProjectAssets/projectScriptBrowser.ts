import type { ProjectScriptKind } from '../../../../shared/projectScripts'

export interface ProjectScriptOption {
  kind: ProjectScriptKind
  name: string
  path: string
}

const sortProjectScriptOptions = (options: ProjectScriptOption[]): ProjectScriptOption[] => {
  return [...options].sort((left, right) => left.path.localeCompare(right.path))
}

export const listProjectScriptsByKind = async (
  projectPath: string,
  scriptKinds: ProjectScriptKind[]
): Promise<ProjectScriptOption[]> => {
  if (!projectPath) {
    return []
  }

  const scriptGroups = await Promise.all(
    scriptKinds.map((scriptKind) => window.api.listProjectScriptResources(projectPath, scriptKind))
  )

  return sortProjectScriptOptions(
    scriptGroups.flat().map((resource) => ({
      kind: resource.scriptKind,
      name: resource.name,
      path: resource.path
    }))
  )
}
