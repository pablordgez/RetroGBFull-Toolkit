import type { ProjectAssetKind } from '../../../../shared/projectAssets'

export interface ProjectAssetDragPayload {
  kind: Extract<ProjectAssetKind, 'actor' | 'tilemap' | 'window'>
  path: string
}

export const PROJECT_ASSET_DRAG_MIME = 'application/x-retrogb-project-asset'

const isProjectAssetDragKind = (
  value: ProjectAssetKind | string
): value is ProjectAssetDragPayload['kind'] => {
  return value === 'actor' || value === 'tilemap' || value === 'window'
}

export const canDragProjectAsset = (
  resourceType: ProjectAssetKind | null | undefined
): resourceType is ProjectAssetDragPayload['kind'] => {
  return Boolean(resourceType && isProjectAssetDragKind(resourceType))
}

export const writeProjectAssetDragPayload = (
  dataTransfer: DataTransfer,
  payload: ProjectAssetDragPayload
): void => {
  const serializedPayload = JSON.stringify(payload)

  dataTransfer.setData(PROJECT_ASSET_DRAG_MIME, serializedPayload)
  dataTransfer.setData('text/plain', payload.path)
  dataTransfer.effectAllowed = 'copy'
}

export const readProjectAssetDragPayload = (
  dataTransfer: Pick<DataTransfer, 'getData'>
): ProjectAssetDragPayload | null => {
  const serializedPayload = dataTransfer.getData(PROJECT_ASSET_DRAG_MIME)

  if (!serializedPayload) {
    return null
  }

  try {
    const parsedPayload = JSON.parse(serializedPayload) as {
      kind?: ProjectAssetKind | string
      path?: unknown
    }
    const nextKind = parsedPayload.kind

    if (!parsedPayload || typeof parsedPayload.path !== 'string') {
      return null
    }

    if (nextKind !== 'actor' && nextKind !== 'tilemap' && nextKind !== 'window') {
      return null
    }

    return {
      kind: nextKind,
      path: parsedPayload.path
    }
  } catch {
    return null
  }
}

export const hasProjectAssetDragPayload = (
  dataTransfer: Pick<DataTransfer, 'getData' | 'types'>
): boolean => {
  if (Array.from(dataTransfer.types ?? []).includes(PROJECT_ASSET_DRAG_MIME)) {
    return true
  }

  return readProjectAssetDragPayload(dataTransfer) !== null
}
