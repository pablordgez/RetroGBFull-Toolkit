import type { ReactElement, RefObject } from 'react'
import type {
  ProjectResourceItem,
  ProjectResourceKind
} from '../../../../shared/projectResourceModels'
import type { ContextMenuOption } from '../ContextMenu/ContextMenuRegion'
import { ResourceManagementGridItem } from './ResourceManagementGridItem'
import type {
  EditingResourceState,
  PendingBankResourceState,
  PendingDeleteResourceState,
  ResourceClipboardOperation,
  ResourceClipboardState
} from './ResourceManagementState'
import {
  getTrackedResourceKind,
  isSceneResource,
  supportsBankOverride
} from './resourceManagementShared'
import { RetroBackIcon } from './ResourceIcons'

interface ResourceManagementGridProps {
  resources?: ProjectResourceItem[]
  currentPath?: string
  editingResource: EditingResourceState | null
  clipboardResource: ResourceClipboardState | null
  selectedResourcePath: string | null
  isInteractionDisabled: boolean
  canPasteClipboardResource: boolean
  renameInputRef: RefObject<HTMLInputElement | null>
  shortcutLabels: {
    copy: string
    cut: string
    paste: string
  }
  startingScenePath: string | null
  onSelectResource: (resourcePath: string) => void
  onOpenResource: (resource: ProjectResourceItem) => void | Promise<void>
  onCommitRename: (resourcePath: string) => void | Promise<void>
  onCancelRename: () => void
  onDraftNameChange: (resourcePath: string, draftName: string) => void
  onPlaceClipboardResource: (
    resource: ProjectResourceItem,
    operation: ResourceClipboardOperation
  ) => void
  onPasteClipboardResource: () => void | Promise<void>
  onShowResourceInFileExplorer: (resource: ProjectResourceItem) => void | Promise<void>
  onSetStartingScene: (scenePath: string | null, sceneName: string | null) => void | Promise<void>
  onBeginResourceEditing: (
    resourcePath: string,
    resourceName: string,
    resourceType: ProjectResourceKind
  ) => void
  onRequestDeleteResource: (resource: PendingDeleteResourceState) => void
  onRequestBankResource: (resource: PendingBankResourceState) => void
  onOpenParentDirectory: () => void | Promise<void>
}

export const ResourceManagementGrid = ({
  resources = [],
  currentPath = '',
  editingResource,
  clipboardResource,
  selectedResourcePath,
  isInteractionDisabled,
  canPasteClipboardResource,
  renameInputRef,
  shortcutLabels,
  startingScenePath,
  onSelectResource,
  onOpenResource,
  onCommitRename,
  onCancelRename,
  onDraftNameChange,
  onPlaceClipboardResource,
  onPasteClipboardResource,
  onShowResourceInFileExplorer,
  onSetStartingScene,
  onBeginResourceEditing,
  onRequestDeleteResource,
  onRequestBankResource,
  onOpenParentDirectory
}: ResourceManagementGridProps): ReactElement => {
  const buildResourceMenuOptions = (
    resource: ProjectResourceItem,
    resourceType: ProjectResourceKind
  ): ContextMenuOption[] => [
    {
      id: `copy-${resource.path}`,
      label: 'Copy',
      shortcutLabel: shortcutLabels.copy,
      disabled: isInteractionDisabled,
      onSelect: () => onPlaceClipboardResource(resource, 'copy')
    },
    {
      id: `cut-${resource.path}`,
      label: 'Cut',
      shortcutLabel: shortcutLabels.cut,
      disabled: isInteractionDisabled,
      onSelect: () => onPlaceClipboardResource(resource, 'cut')
    },
    {
      id: `paste-${resource.path}`,
      label: 'Paste',
      shortcutLabel: shortcutLabels.paste,
      disabled: !canPasteClipboardResource,
      onSelect: () => void onPasteClipboardResource()
    },
    {
      id: `show-in-file-explorer-${resource.path}`,
      label: 'Show In File Explorer',
      disabled: isInteractionDisabled,
      onSelect: () => void onShowResourceInFileExplorer(resource)
    },
    ...(isSceneResource(resource)
      ? [
          {
            id: `start-scene-${resource.path}`,
            label:
              startingScenePath === resource.path ? 'Clear Starting Scene' : 'Set As Starting Scene',
            disabled: isInteractionDisabled,
            onSelect: () => {
              void onSetStartingScene(
                startingScenePath === resource.path ? null : resource.path,
                resource.name
              )
            }
          } satisfies ContextMenuOption
        ]
      : []),
    ...(supportsBankOverride(resource)
      ? [
          {
            id: `bank-${resource.path}`,
            label: 'Bank...',
            disabled: isInteractionDisabled,
            onSelect: () => {
              onRequestBankResource({
                path: resource.path,
                name: resource.name,
                resourceType,
                currentBank: resource.bank ?? 255,
                draftBank: String(resource.bank ?? 255)
              })
            }
          } satisfies ContextMenuOption
        ]
      : []),
    {
      id: `rename-${resource.path}`,
      label: 'Rename',
      disabled: isInteractionDisabled,
      onSelect: () => onBeginResourceEditing(resource.path, resource.name, resourceType)
    },
    {
      id: `delete-${resource.path}`,
      label: 'Delete',
      disabled: isInteractionDisabled,
      onSelect: () => {
        onRequestDeleteResource({
          path: resource.path,
          name: resource.name,
          resourceType,
          scriptKind: resource.type === 'file' ? (resource.scriptKind ?? null) : null
        })
      }
    }
  ]

  return (
    <div className="resource-management-pane__grid">
      {currentPath.length > 0 && (
        <button
          type="button"
          className="resource-management-pane__item resource-management-pane__item--file resource-management-pane__item--back"
          onClick={() => {
            void onOpenParentDirectory()
          }}
          disabled={isInteractionDisabled}
        >
          <RetroBackIcon className="resource-management-pane__folder-icon" />
          <span className="resource-management-pane__item-name">Back</span>
        </button>
      )}

      {resources.map((resource) => {
        const resourceType = getTrackedResourceKind(resource)
        const isSelected = selectedResourcePath === resource.path
        const isPendingCut =
          clipboardResource?.operation === 'cut' &&
          clipboardResource.resourcePath === resource.path

        return (
          <ResourceManagementGridItem
            key={resource.path}
            resource={resource}
            menuOptions={
              resourceType ? buildResourceMenuOptions(resource, resourceType) : undefined
            }
            isEditing={editingResource?.path === resource.path}
            isInteractionDisabled={isInteractionDisabled}
            isPendingCut={Boolean(isPendingCut)}
            isSelected={isSelected}
            editingDraftName={editingResource?.draftName ?? ''}
            renameInputRef={renameInputRef}
            startingScenePath={startingScenePath}
            onSelect={onSelectResource}
            onOpen={onOpenResource}
            onCommitRename={() => onCommitRename(resource.path)}
            onCancelRename={resourceType ? onCancelRename : () => undefined}
            onDraftNameChange={(nextName) => onDraftNameChange(resource.path, nextName)}
          />
        )
      })}
    </div>
  )
}
