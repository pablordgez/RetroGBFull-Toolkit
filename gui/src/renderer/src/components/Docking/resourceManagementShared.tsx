import type { ReactElement } from 'react'
import { PROJECT_ASSET_LABELS } from '../../../../shared/projectAssets'
import { PROJECT_SCRIPT_LABELS, type ProjectScriptKind } from '../../../../shared/projectScripts'
import type {
  ProjectResourceFileItem,
  ProjectResourceItem,
  ProjectResourceKind
} from '../../../../shared/projectResourceModels'
import {
  RetroActorIcon,
  RetroFileIcon,
  RetroFolderIcon,
  RetroMusicIcon,
  RetroSceneIcon,
  RetroSpriteIcon,
  RetroTilemapIcon,
  RetroTilesetIcon,
  RetroWindowIcon
} from './ResourceIcons'

export const buildClassName = (extraClassName?: string): string => {
  return extraClassName ? `resource-management-pane ${extraClassName}` : 'resource-management-pane'
}

export const formatLocationLabel = (currentPath: string): string => {
  return currentPath ? `/${currentPath}` : '/'
}

export const formatFileBadge = (resource: ProjectResourceItem): string => {
  return resource.type === 'file' && resource.extension ? resource.extension.toUpperCase() : 'FILE'
}

export const getResourceTypeLabel = (
  resourceType: ProjectResourceKind,
  scriptKind?: ProjectScriptKind | null
): string => {
  if (resourceType === 'folder') {
    return 'Folder'
  }

  if (resourceType === 'script') {
    return scriptKind ? PROJECT_SCRIPT_LABELS[scriptKind] : 'Script'
  }

  return PROJECT_ASSET_LABELS[resourceType]
}

export const getParentResourcePath = (resourcePath: string): string => {
  const segments = resourcePath.split('/').filter((segment) => segment.length > 0)
  segments.pop()
  return segments.join('/')
}

export const getFriendlyErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (!(error instanceof Error)) {
    return fallbackMessage
  }

  const electronInvokeErrorMatch = error.message.match(
    /^Error invoking remote method '[^']+':(?: Error:)?\s*(.+)$/s
  )

  if (electronInvokeErrorMatch?.[1]) {
    return electronInvokeErrorMatch[1].trim()
  }

  return error.message
}

export const isResourceNameConflictMessage = (message: string): boolean => {
  return message.toLowerCase().includes('already exists')
}

export const getTrackedResourceKind = (
  resource: ProjectResourceItem
): ProjectResourceKind | null => {
  if (resource.type === 'folder') {
    return 'folder'
  }

  if (resource.scriptKind) {
    return 'script'
  }

  return resource.resourceType ?? null
}

export const supportsBankOverride = (
  resource: ProjectResourceItem
): resource is ProjectResourceFileItem => {
  return resource.type === 'file' && resource.bank != null
}

export const isSceneResource = (
  resource: ProjectResourceItem
): resource is ProjectResourceFileItem => {
  return resource.type === 'file' && resource.resourceType === 'scene'
}

export const getResourceIcon = (resource: ProjectResourceItem): ReactElement => {
  if (resource.type === 'folder') {
    return <RetroFolderIcon className="resource-management-pane__folder-icon" />
  }

  switch (resource.resourceType) {
    case 'actor':
      return <RetroActorIcon className="resource-management-pane__folder-icon" />
    case 'sprite':
      return <RetroSpriteIcon className="resource-management-pane__folder-icon" />
    case 'tileset':
      return <RetroTilesetIcon className="resource-management-pane__folder-icon" />
    case 'tilemap':
      return <RetroTilemapIcon className="resource-management-pane__folder-icon" />
    case 'window':
      return <RetroWindowIcon className="resource-management-pane__folder-icon" />
    case 'scene':
      return <RetroSceneIcon className="resource-management-pane__folder-icon" />
    case 'music':
      return <RetroMusicIcon className="resource-management-pane__folder-icon" />
    default:
      return <RetroFileIcon className="resource-management-pane__folder-icon" />
  }
}
