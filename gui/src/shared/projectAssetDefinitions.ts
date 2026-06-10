import type { ProjectAssetKind } from './projectAssetTypes'

interface ProjectAssetDefinition {
  extension: string
  label: string
}

export const PROJECT_ASSET_DEFINITIONS: Record<ProjectAssetKind, ProjectAssetDefinition> = {
  sprite: { extension: '.rgbsprite.json', label: 'Sprite' },
  tileset: { extension: '.rgbtileset.json', label: 'Tileset' },
  tilemap: { extension: '.rgbtilemap.json', label: 'Tilemap' },
  window: { extension: '.rgbwindow.json', label: 'Window' },
  scene: { extension: '.rgbscene.json', label: 'Scene' },
  actor: { extension: '.rgbactor.json', label: 'Actor' },
  music: { extension: '.rgbmusic.json', label: 'Music' }
}

export const PROJECT_ASSET_EXTENSIONS: Record<ProjectAssetKind, string> = Object.fromEntries(
  Object.entries(PROJECT_ASSET_DEFINITIONS).map(([assetKind, definition]) => [
    assetKind,
    definition.extension
  ])
) as Record<ProjectAssetKind, string>

export const PROJECT_ASSET_LABELS: Record<ProjectAssetKind, string> = Object.fromEntries(
  Object.entries(PROJECT_ASSET_DEFINITIONS).map(([assetKind, definition]) => [
    assetKind,
    definition.label
  ])
) as Record<ProjectAssetKind, string>

export const buildProjectAssetFileName = (
  assetKind: ProjectAssetKind,
  assetName: string
): string => {
  return `${assetName}${PROJECT_ASSET_EXTENSIONS[assetKind]}`
}

export const getProjectAssetKindFromFileName = (fileName: string): ProjectAssetKind | null => {
  const normalizedFileName = fileName.toLowerCase()

  for (const [assetKind, extension] of Object.entries(PROJECT_ASSET_EXTENSIONS) as Array<
    [ProjectAssetKind, string]
  >) {
    if (normalizedFileName.endsWith(extension)) {
      return assetKind
    }
  }

  return null
}

export const getProjectAssetDisplayName = (fileName: string): string => {
  const assetKind = getProjectAssetKindFromFileName(fileName)

  if (!assetKind) {
    return fileName
  }

  return fileName.slice(0, -PROJECT_ASSET_EXTENSIONS[assetKind].length)
}
