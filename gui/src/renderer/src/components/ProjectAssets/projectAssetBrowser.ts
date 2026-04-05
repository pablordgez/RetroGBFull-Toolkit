import type { ProjectAssetKind } from '../../../../shared/projectAssets'

export interface ProjectAssetOption {
  kind: ProjectAssetKind
  name: string
  path: string
}

const sortProjectAssetOptions = (options: ProjectAssetOption[]): ProjectAssetOption[] => {
  return [...options].sort((left, right) => left.path.localeCompare(right.path))
}

export const listProjectAssetsByKind = async (
  projectPath: string,
  assetKinds: ProjectAssetKind[],
  currentPath = ''
): Promise<ProjectAssetOption[]> => {
  if (!projectPath) {
    return []
  }

  const resourceView = await window.api.getProjectResources(projectPath, currentPath)
  const localAssets = resourceView.items
    .filter(
      (
        resource
      ): resource is typeof resource & { type: 'file'; resourceType: ProjectAssetKind } => {
        return (
          resource.type === 'file' &&
          typeof resource.resourceType === 'string' &&
          assetKinds.includes(resource.resourceType)
        )
      }
    )
    .map((resource) => ({
      kind: resource.resourceType,
      name: resource.name,
      path: resource.path
    }))

  const nestedAssets = await Promise.all(
    resourceView.items
      .filter(
        (resource): resource is typeof resource & { type: 'folder' } => resource.type === 'folder'
      )
      .map((resource) => listProjectAssetsByKind(projectPath, assetKinds, resource.path))
  )

  return sortProjectAssetOptions([...localAssets, ...nestedAssets.flat()])
}
