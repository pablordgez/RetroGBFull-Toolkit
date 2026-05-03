import type { ReactElement, RefObject } from 'react'
import { ContextMenuRegion, type ContextMenuOption } from '../ContextMenu/ContextMenuRegion'
import {
  canDragProjectAsset,
  writeProjectAssetDragPayload
} from '../ProjectAssets/projectAssetDrag'
import type { ProjectResourceItem } from '../../../../shared/projectResourceModels'
import {
  formatFileBadge,
  getResourceIcon,
  getResourceTypeLabel,
  getTrackedResourceKind,
  isSceneResource
} from './resourceManagementShared'

interface ResourceManagementGridItemProps {
  editingDraftName: string
  isEditing: boolean
  isInteractionDisabled: boolean
  isPendingCut: boolean
  isSelected: boolean
  menuOptions?: ContextMenuOption[]
  onCancelRename: () => void
  onCommitRename: () => void | Promise<void>
  onDraftNameChange: (nextName: string) => void
  onOpen: (resource: ProjectResourceItem) => void | Promise<void>
  onSelect: (resourcePath: string) => void
  renameInputRef: RefObject<HTMLInputElement | null>
  resource: ProjectResourceItem
  startingScenePath: string | null
}

export const ResourceManagementGridItem = ({
  editingDraftName,
  isEditing,
  isInteractionDisabled,
  isPendingCut,
  isSelected,
  menuOptions,
  onCancelRename,
  onCommitRename,
  onDraftNameChange,
  onOpen,
  onSelect,
  renameInputRef,
  resource,
  startingScenePath
}: ResourceManagementGridItemProps): ReactElement => {
  const resourceType = getTrackedResourceKind(resource)

  if (!resourceType || !menuOptions) {
    return (
      <div
        key={resource.path}
        className="resource-management-pane__item resource-management-pane__item--file"
        role="listitem"
      >
        <span className="resource-management-pane__file-chip" aria-hidden="true">
          {formatFileBadge(resource)}
        </span>
        <span className="resource-management-pane__item-name">{resource.name}</span>
        <span className="resource-management-pane__item-badge">{formatFileBadge(resource)}</span>
      </div>
    )
  }

  const isDraggableAsset = resource.type === 'file' && canDragProjectAsset(resource.resourceType)

  return (
    <ContextMenuRegion
      key={resource.path}
      options={menuOptions}
      className="resource-management-pane__item-menu"
    >
      {isEditing ? (
        <div
          className={`resource-management-pane__item ${
            resource.type === 'folder'
              ? 'resource-management-pane__item--folder'
              : 'resource-management-pane__item--asset'
          } ${isSelected ? 'resource-management-pane__item--selected' : ''} ${
            isPendingCut ? 'resource-management-pane__item--cut' : ''
          }`}
          role="listitem"
          onContextMenuCapture={() => onSelect(resource.path)}
        >
          {getResourceIcon(resource)}
          <input
            ref={renameInputRef}
            type="text"
            aria-label={`${getResourceTypeLabel(resourceType, resource.type === 'file' ? resource.scriptKind : null)} name for ${resource.name}`}
            value={editingDraftName}
            onChange={(event) => {
              onDraftNameChange(event.target.value)
            }}
            onBlur={() => {
              void onCommitRename()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void onCommitRename()
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                onCancelRename()
              }
            }}
            onClick={(event) => event.stopPropagation()}
          />
          {isSceneResource(resource) && startingScenePath === resource.path && (
            <span className="resource-management-pane__item-badge">START</span>
          )}
        </div>
      ) : (
        <button
          type="button"
          className={`resource-management-pane__item ${
            resource.type === 'folder'
              ? 'resource-management-pane__item--folder'
              : 'resource-management-pane__item--asset'
          } ${isSelected ? 'resource-management-pane__item--selected' : ''} ${
            isPendingCut ? 'resource-management-pane__item--cut' : ''
          }`}
          role="listitem"
          onClick={() => onSelect(resource.path)}
          onContextMenuCapture={() => onSelect(resource.path)}
          onDoubleClick={() => {
            void onOpen(resource)
          }}
          draggable={isDraggableAsset}
          onDragStart={(event) => {
            if (resource.type !== 'file' || !canDragProjectAsset(resource.resourceType)) {
              return
            }

            onSelect(resource.path)
            writeProjectAssetDragPayload(event.dataTransfer, {
              kind: resource.resourceType,
              path: resource.path
            })
          }}
          disabled={isInteractionDisabled}
        >
          {getResourceIcon(resource)}
          <span className="resource-management-pane__item-name">{resource.name}</span>
          {isSceneResource(resource) && startingScenePath === resource.path && (
            <span className="resource-management-pane__item-badge">START</span>
          )}
        </button>
      )}
    </ContextMenuRegion>
  )
}
