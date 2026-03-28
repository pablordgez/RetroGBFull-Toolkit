import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ContextMenuOption, ContextMenuRegion } from '../ContextMenu/ContextMenuRegion'
import { useHistory } from '../hooks/history/useHistory'
import { useUndoRedoShortcuts } from '../hooks/history/useUndoRedoShortcuts'
import { getCommandShortcutLabelPrefix, isEditableElementTarget } from '../utils/keyboardShortcuts'
import { ProjectAssetKind, PROJECT_ASSET_LABELS } from '../../../../shared/projectAssets'
import { type ResourceMutationEvent } from './projectResourceEvents'
import {
  RetroFileIcon,
  RetroSceneIcon,
  RetroFolderIcon,
  RetroSpriteIcon,
  RetroTilemapIcon,
  RetroTilesetIcon
} from './ResourceIcons'
import './ResourceManagementPane.css'

interface ResourceManagementPaneProps {
  className?: string
  projectPath?: string
  refreshVersion?: number
  onOpenScene?: (scenePath: string) => void | Promise<void>
  onResourceMutation?: (event: ResourceMutationEvent) => void
}

interface ProjectResourceItem {
  type: 'folder' | 'file'
  name: string
  fileName?: string
  path: string
  parentPath?: string | null
  id?: string
  extension?: string | null
  resourceType?: ProjectAssetKind | null
}

interface ProjectResourceView {
  projectName: string
  projectPath: string
  currentPath: string
  parentPath: string | null
  items: ProjectResourceItem[]
}

type ProjectResourceKind = 'folder' | ProjectAssetKind | 'script'

interface ProjectResourceMutationResult {
  view: ProjectResourceView
  resourceType: ProjectResourceKind
  resourcePath: string
  resourceName: string
  parentPath: string
}

interface ProjectDeletedResourceResult extends ProjectResourceMutationResult {
  deletionId: string
}

interface EditingResourceState {
  path: string
  draftName: string
  originalName: string
  resourceType: Exclude<ProjectResourceKind, 'script'>
}

interface PendingDeleteResourceState {
  path: string
  name: string
  resourceType: Exclude<ProjectResourceKind, 'script'>
}

type ResourceClipboardOperation = 'copy' | 'cut'

interface ResourceClipboardState {
  operation: ResourceClipboardOperation
  resourcePath: string
  resourceName: string
  resourceType: Exclude<ProjectResourceKind, 'script'>
  parentPath: string
}

type ResourceStatusTone = 'error' | 'info'

const buildClassName = (extraClassName?: string): string => {
  return extraClassName ? `resource-management-pane ${extraClassName}` : 'resource-management-pane'
}

const formatLocationLabel = (currentPath: string): string => {
  return currentPath ? `/${currentPath}` : '/'
}

const formatFileBadge = (resource: ProjectResourceItem): string => {
  return resource.extension ? resource.extension.toUpperCase() : 'FILE'
}

const getResourceTypeLabel = (resourceType: Exclude<ProjectResourceKind, 'script'>): string => {
  return resourceType === 'folder' ? 'Folder' : PROJECT_ASSET_LABELS[resourceType]
}

const getParentResourcePath = (resourcePath: string): string => {
  const segments = resourcePath.split('/').filter((segment) => segment.length > 0)
  segments.pop()
  return segments.join('/')
}

const getResourceIcon = (resource: ProjectResourceItem): ReactElement => {
  if (resource.type === 'folder') {
    return <RetroFolderIcon className="resource-management-pane__folder-icon" />
  }

  switch (resource.resourceType) {
    case 'sprite':
      return <RetroSpriteIcon className="resource-management-pane__folder-icon" />
    case 'tileset':
      return <RetroTilesetIcon className="resource-management-pane__folder-icon" />
    case 'tilemap':
      return <RetroTilemapIcon className="resource-management-pane__folder-icon" />
    case 'scene':
      return <RetroSceneIcon className="resource-management-pane__folder-icon" />
    default:
      return <RetroFileIcon className="resource-management-pane__folder-icon" />
  }
}

export const ResourceManagementPane = ({
  className,
  projectPath = '',
  refreshVersion = 0,
  onOpenScene,
  onResourceMutation
}: ResourceManagementPaneProps): ReactElement => {
  const renameInputRef = useRef<HTMLInputElement>(null)
  const isCommittingRenameRef = useRef(false)
  const lastAppliedRefreshVersionRef = useRef(refreshVersion)
  const { record, undo, redo } = useHistory()
  const [resourceView, setResourceView] = useState<ProjectResourceView | null>(null)
  const [editingResource, setEditingResource] = useState<EditingResourceState | null>(null)
  const [pendingDeleteResource, setPendingDeleteResource] =
    useState<PendingDeleteResourceState | null>(null)
  const [selectedResourcePath, setSelectedResourcePath] = useState<string | null>(null)
  const [clipboardResource, setClipboardResource] = useState<ResourceClipboardState | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusTone, setStatusTone] = useState<ResourceStatusTone>('error')
  const [isBusy, setIsBusy] = useState(false)
  const [isHistoryBusy, setIsHistoryBusy] = useState(false)

  const isInteractionDisabled = isBusy || isHistoryBusy
  const currentResourcePath = resourceView?.currentPath ?? ''
  const editingResourcePath = editingResource?.path ?? null

  const showErrorStatus = (message: string): void => {
    setStatusTone('error')
    setStatusMessage(message)
  }

  const showInfoStatus = (message: string): void => {
    setStatusTone('info')
    setStatusMessage(message)
  }

  const loadResources = useCallback(
    async (nextPath = '') => {
      if (!projectPath) {
        setResourceView(null)
        return { ok: false, errorMessage: null as string | null }
      }

      setIsBusy(true)

      try {
        const nextView = await window.api.getProjectResources(projectPath, nextPath)
        setResourceView(nextView)
        setStatusMessage(null)
        return { ok: true, errorMessage: null as string | null }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Something went wrong while loading project resources. Please try again.'

        console.error('[resource-management-pane] getProjectResources failed', error)
        showErrorStatus(errorMessage)
        return { ok: false, errorMessage }
      } finally {
        setIsBusy(false)
      }
    },
    [projectPath]
  )

  useEffect(() => {
    if (!projectPath) {
      setResourceView(null)
      setEditingResource(null)
      setPendingDeleteResource(null)
      setSelectedResourcePath(null)
      setClipboardResource(null)
      showErrorStatus('This window was opened without a project path.')
      return
    }

    void loadResources('')
  }, [loadResources, projectPath])

  useEffect(() => {
    if (!projectPath || refreshVersion === lastAppliedRefreshVersionRef.current) {
      return
    }

    lastAppliedRefreshVersionRef.current = refreshVersion
    void loadResources(currentResourcePath)
  }, [currentResourcePath, loadResources, projectPath, refreshVersion])

  useEffect(() => {
    if (!editingResource) {
      return
    }

    const matchingResource = resourceView?.items.find(
      (resource) => resource.path === editingResource.path
    )

    if (!matchingResource) {
      setEditingResource(null)
    }
  }, [editingResource, resourceView])

  useEffect(() => {
    if (!selectedResourcePath) {
      return
    }

    const matchingResource = resourceView?.items.find(
      (resource) => resource.path === selectedResourcePath
    )

    if (!matchingResource) {
      setSelectedResourcePath(null)
    }
  }, [resourceView, selectedResourcePath])

  useEffect(() => {
    if (!editingResourcePath || !renameInputRef.current) {
      return
    }

    const animationFrame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [editingResourcePath])

  const applyResourceMutation = (
    result: ProjectResourceMutationResult | ProjectDeletedResourceResult
  ): void => {
    setResourceView(result.view)
    setStatusMessage(null)
  }

  const notifyResourceMutation = useCallback(
    (event: ResourceMutationEvent) => {
      onResourceMutation?.(event)
    },
    [onResourceMutation]
  )

  const beginResourceEditing = (
    resourcePath: string,
    resourceName: string,
    resourceType: Exclude<ProjectResourceKind, 'script'>
  ): void => {
    setSelectedResourcePath(resourcePath)
    setEditingResource({
      path: resourcePath,
      draftName: resourceName,
      originalName: resourceName,
      resourceType
    })
    setStatusMessage(null)
  }

  const executeHistoryAction = useCallback(
    async (action: 'undo' | 'redo') => {
      if (isBusy || pendingDeleteResource || editingResource) {
        return
      }

      setIsHistoryBusy(true)

      try {
        await (action === 'undo' ? undo() : redo())
      } catch (error) {
        console.error(`[resource-management-pane] ${action} failed`, error)
        showErrorStatus(
          error instanceof Error
            ? error.message
            : `Something went wrong while trying to ${action}. Please try again.`
        )
      } finally {
        setIsHistoryBusy(false)
      }
    },
    [editingResource, isBusy, pendingDeleteResource, redo, undo]
  )

  const selectedTrackedResource = useMemo(() => {
    const matchingResource = resourceView?.items.find(
      (resource) => resource.path === selectedResourcePath
    )

    if (!matchingResource) {
      return null
    }

    return matchingResource
  }, [resourceView, selectedResourcePath])

  const shortcutLabels = useMemo(() => {
    const commandKey = getCommandShortcutLabelPrefix()

    return {
      copy: `${commandKey}C`,
      cut: `${commandKey}X`,
      paste: `${commandKey}V`
    }
  }, [])

  const canPasteClipboardResource = useMemo(() => {
    if (
      !projectPath ||
      !clipboardResource ||
      isInteractionDisabled ||
      Boolean(pendingDeleteResource) ||
      Boolean(editingResource)
    ) {
      return false
    }

    return !(
      clipboardResource.operation === 'cut' && clipboardResource.parentPath === currentResourcePath
    )
  }, [
    clipboardResource,
    currentResourcePath,
    editingResource,
    isInteractionDisabled,
    pendingDeleteResource,
    projectPath
  ])

  const placeClipboardResource = useCallback(
    (resource: ProjectResourceItem, operation: ResourceClipboardOperation) => {
      const resourceType: Exclude<ProjectResourceKind, 'script'> | null =
        resource.type === 'folder' ? 'folder' : (resource.resourceType ?? null)

      if (!resourceType || isInteractionDisabled) {
        return
      }

      setSelectedResourcePath(resource.path)
      setClipboardResource({
        operation,
        resourcePath: resource.path,
        resourceName: resource.name,
        resourceType,
        parentPath: getParentResourcePath(resource.path)
      })
      showInfoStatus(
        operation === 'copy' ? `Copied "${resource.name}".` : `"${resource.name}" is ready to move.`
      )
    },
    [isInteractionDisabled]
  )

  useUndoRedoShortcuts(
    () => executeHistoryAction('undo'),
    () => executeHistoryAction('redo'),
    {
      enabled: Boolean(projectPath) && !pendingDeleteResource,
      ignoreEditableTargets: true
    }
  )

  const handlePasteClipboardResource = useCallback(async () => {
    if (!projectPath || !clipboardResource || !canPasteClipboardResource) {
      return
    }

    const destinationParentPath = currentResourcePath
    setIsBusy(true)

    try {
      const transferMode = clipboardResource.operation === 'copy' ? 'copy' : 'move'
      const result = await window.api.transferProjectResource(
        projectPath,
        clipboardResource.resourceType,
        clipboardResource.resourcePath,
        destinationParentPath,
        transferMode
      )

      if (clipboardResource.operation === 'copy') {
        let deletionId: string | null = null

        record({
          undo: async () => {
            const deletedResult = await window.api.deleteProjectResource(
              projectPath,
              result.resourceType,
              result.resourcePath,
              deletionId ?? undefined
            )
            deletionId = deletedResult.deletionId
            applyResourceMutation(deletedResult)
            notifyResourceMutation({
              action: 'delete',
              resourceType: result.resourceType as Exclude<ProjectResourceKind, 'script'>,
              resourcePath: deletedResult.resourcePath
            })
          },
          redo: async () => {
            if (deletionId) {
              const restoredResult = await window.api.restoreDeletedProjectResource(
                projectPath,
                deletionId
              )
              applyResourceMutation(restoredResult)
              notifyResourceMutation({
                action: 'restore',
                resourceType: restoredResult.resourceType as Exclude<ProjectResourceKind, 'script'>,
                resourcePath: restoredResult.resourcePath
              })
              return
            }

            const redoneResult = await window.api.transferProjectResource(
              projectPath,
              clipboardResource.resourceType,
              clipboardResource.resourcePath,
              destinationParentPath,
              'copy'
            )
            applyResourceMutation(redoneResult)
            notifyResourceMutation({
              action: 'copy',
              resourceType: redoneResult.resourceType as Exclude<ProjectResourceKind, 'script'>,
              resourcePath: redoneResult.resourcePath,
              previousResourcePath: clipboardResource.resourcePath
            })
          },
          dispose: async () => {
            if (!deletionId) {
              return
            }

            await window.api.finalizeDeletedProjectResource(projectPath, deletionId)
          }
        })
      } else {
        const sourceResourcePath = clipboardResource.resourcePath
        const sourceParentPath = clipboardResource.parentPath
        const destinationResourcePath = result.resourcePath

        record({
          undo: async () => {
            const revertedResult = await window.api.transferProjectResource(
              projectPath,
              clipboardResource.resourceType,
              destinationResourcePath,
              sourceParentPath,
              'move'
            )
            applyResourceMutation(revertedResult)
            notifyResourceMutation({
              action: 'move',
              resourceType: clipboardResource.resourceType,
              resourcePath: revertedResult.resourcePath,
              previousResourcePath: destinationResourcePath
            })
          },
          redo: async () => {
            const redoneResult = await window.api.transferProjectResource(
              projectPath,
              clipboardResource.resourceType,
              sourceResourcePath,
              destinationParentPath,
              'move'
            )
            applyResourceMutation(redoneResult)
            notifyResourceMutation({
              action: 'move',
              resourceType: clipboardResource.resourceType,
              resourcePath: redoneResult.resourcePath,
              previousResourcePath: sourceResourcePath
            })
          }
        })

        setClipboardResource(null)
      }

      applyResourceMutation(result)
      setSelectedResourcePath(result.resourcePath)
      notifyResourceMutation({
        action: clipboardResource.operation === 'copy' ? 'copy' : 'move',
        resourceType: result.resourceType as Exclude<ProjectResourceKind, 'script'>,
        resourcePath: result.resourcePath,
        previousResourcePath: clipboardResource.resourcePath
      })
    } catch (error) {
      console.error('[resource-management-pane] transferProjectResource failed', error)
      showErrorStatus(
        error instanceof Error
          ? error.message
          : 'Something went wrong while pasting the resource. Please try again.'
      )
    } finally {
      setIsBusy(false)
    }
  }, [
    canPasteClipboardResource,
    clipboardResource,
    currentResourcePath,
    notifyResourceMutation,
    projectPath,
    record
  ])

  useEffect(() => {
    if (!projectPath) {
      return
    }

    const handleShortcut = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || isEditableElementTarget(event.target)) {
        return
      }

      const lowerKey = event.key.toLowerCase()

      if (
        lowerKey === 'c' &&
        selectedTrackedResource &&
        !isInteractionDisabled &&
        !editingResource &&
        !pendingDeleteResource
      ) {
        event.preventDefault()
        placeClipboardResource(selectedTrackedResource, 'copy')
        return
      }

      if (
        lowerKey === 'x' &&
        selectedTrackedResource &&
        !isInteractionDisabled &&
        !editingResource &&
        !pendingDeleteResource
      ) {
        event.preventDefault()
        placeClipboardResource(selectedTrackedResource, 'cut')
        return
      }

      if (lowerKey === 'v' && canPasteClipboardResource) {
        event.preventDefault()
        void handlePasteClipboardResource()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [
    canPasteClipboardResource,
    editingResource,
    handlePasteClipboardResource,
    isInteractionDisabled,
    pendingDeleteResource,
    placeClipboardResource,
    projectPath,
    selectedTrackedResource
  ])

  const commitResourceRename = useCallback(async () => {
    if (!editingResource || !projectPath || isCommittingRenameRef.current) {
      return
    }

    const trimmedName = editingResource.draftName.trim()

    if (trimmedName.length === 0) {
      showErrorStatus('Resource name is required.')
      return
    }

    if (trimmedName === editingResource.originalName) {
      setEditingResource(null)
      return
    }

    isCommittingRenameRef.current = true
    setIsBusy(true)

    try {
      const previousPath = editingResource.path
      const previousName = editingResource.originalName
      const result = await window.api.renameProjectResource(
        projectPath,
        editingResource.resourceType,
        previousPath,
        trimmedName
      )

      record({
        undo: async () => {
          const revertedResult = await window.api.renameProjectResource(
            projectPath,
            editingResource.resourceType,
            result.resourcePath,
            previousName
          )
          applyResourceMutation(revertedResult)
          notifyResourceMutation({
            action: 'rename',
            resourceType: editingResource.resourceType,
            resourcePath: revertedResult.resourcePath,
            previousResourcePath: result.resourcePath
          })
        },
        redo: async () => {
          const redoneResult = await window.api.renameProjectResource(
            projectPath,
            editingResource.resourceType,
            previousPath,
            trimmedName
          )
          applyResourceMutation(redoneResult)
          notifyResourceMutation({
            action: 'rename',
            resourceType: editingResource.resourceType,
            resourcePath: redoneResult.resourcePath,
            previousResourcePath: previousPath
          })
        }
      })

      applyResourceMutation(result)
      setSelectedResourcePath(result.resourcePath)
      setEditingResource(null)
      notifyResourceMutation({
        action: 'rename',
        resourceType: editingResource.resourceType,
        resourcePath: result.resourcePath,
        previousResourcePath: previousPath
      })
    } catch (error) {
      console.error('[resource-management-pane] renameProjectResource failed', error)
      showErrorStatus(
        error instanceof Error
          ? error.message
          : 'Something went wrong while renaming the resource. Please try again.'
      )
    } finally {
      isCommittingRenameRef.current = false
      setIsBusy(false)
    }
  }, [editingResource, notifyResourceMutation, projectPath, record])

  const handleCreateResource = useCallback(
    async (resourceType: Exclude<ProjectResourceKind, 'script'>) => {
      if (!projectPath) {
        return
      }

      setIsBusy(true)

      try {
        const result = await window.api.createProjectResource(
          projectPath,
          resourceType,
          resourceView?.currentPath ?? ''
        )
        let deletionId: string | null = null

        record({
          undo: async () => {
            const deletedResult = await window.api.deleteProjectResource(
              projectPath,
              result.resourceType,
              result.resourcePath,
              deletionId ?? undefined
            )
            deletionId = deletedResult.deletionId
            applyResourceMutation(deletedResult)
            notifyResourceMutation({
              action: 'delete',
              resourceType: result.resourceType as Exclude<ProjectResourceKind, 'script'>,
              resourcePath: deletedResult.resourcePath
            })
          },
          redo: async () => {
            if (deletionId) {
              const restoredResult = await window.api.restoreDeletedProjectResource(
                projectPath,
                deletionId
              )
              applyResourceMutation(restoredResult)
              notifyResourceMutation({
                action: 'restore',
                resourceType: restoredResult.resourceType as Exclude<ProjectResourceKind, 'script'>,
                resourcePath: restoredResult.resourcePath
              })
              return
            }

            const recreatedResult = await window.api.createProjectResource(
              projectPath,
              result.resourceType,
              result.parentPath,
              result.resourceName
            )
            applyResourceMutation(recreatedResult)
            notifyResourceMutation({
              action: 'create',
              resourceType: recreatedResult.resourceType as Exclude<ProjectResourceKind, 'script'>,
              resourcePath: recreatedResult.resourcePath
            })
          },
          dispose: async () => {
            if (!deletionId) {
              return
            }

            await window.api.finalizeDeletedProjectResource(projectPath, deletionId)
          }
        })

        applyResourceMutation(result)
        setSelectedResourcePath(result.resourcePath)
        notifyResourceMutation({
          action: 'create',
          resourceType: result.resourceType as Exclude<ProjectResourceKind, 'script'>,
          resourcePath: result.resourcePath
        })
        beginResourceEditing(
          result.resourcePath,
          result.resourceName,
          result.resourceType as Exclude<ProjectResourceKind, 'script'>
        )
      } catch (error) {
        console.error('[resource-management-pane] createProjectResource failed', error)
        showErrorStatus(
          error instanceof Error
            ? error.message
            : 'Something went wrong while creating the resource. Please try again.'
        )
      } finally {
        setIsBusy(false)
      }
    },
    [notifyResourceMutation, projectPath, record, resourceView?.currentPath]
  )

  const handleDeleteResource = useCallback(async () => {
    if (!projectPath || !pendingDeleteResource) {
      return
    }

    setIsBusy(true)

    try {
      const deletedResult = await window.api.deleteProjectResource(
        projectPath,
        pendingDeleteResource.resourceType,
        pendingDeleteResource.path
      )

      record({
        undo: async () => {
          const restoredResult = await window.api.restoreDeletedProjectResource(
            projectPath,
            deletedResult.deletionId
          )
          applyResourceMutation(restoredResult)
          notifyResourceMutation({
            action: 'restore',
            resourceType: restoredResult.resourceType as Exclude<ProjectResourceKind, 'script'>,
            resourcePath: restoredResult.resourcePath
          })
        },
        redo: async () => {
          const redoneResult = await window.api.deleteProjectResource(
            projectPath,
            deletedResult.resourceType,
            deletedResult.resourcePath,
            deletedResult.deletionId
          )
          applyResourceMutation(redoneResult)
          notifyResourceMutation({
            action: 'delete',
            resourceType: deletedResult.resourceType as Exclude<ProjectResourceKind, 'script'>,
            resourcePath: redoneResult.resourcePath
          })
        },
        dispose: async () => {
          await window.api.finalizeDeletedProjectResource(projectPath, deletedResult.deletionId)
        }
      })

      applyResourceMutation(deletedResult)
      setSelectedResourcePath(null)
      setEditingResource(null)
      setPendingDeleteResource(null)
      notifyResourceMutation({
        action: 'delete',
        resourceType: pendingDeleteResource.resourceType,
        resourcePath: deletedResult.resourcePath
      })
    } catch (error) {
      console.error('[resource-management-pane] deleteProjectResource failed', error)
      showErrorStatus(
        error instanceof Error
          ? error.message
          : 'Something went wrong while deleting the resource. Please try again.'
      )
    } finally {
      setIsBusy(false)
    }
  }, [notifyResourceMutation, pendingDeleteResource, projectPath, record])

  const handleOpenResource = useCallback(
    async (resource: ProjectResourceItem) => {
      if (!projectPath || isInteractionDisabled) {
        return
      }

      try {
        if (resource.type === 'folder') {
          const openedFolderResult = await loadResources(resource.path)

          if (!openedFolderResult.ok) {
            await loadResources(currentResourcePath)

            if (openedFolderResult.errorMessage) {
              showErrorStatus(openedFolderResult.errorMessage)
            }
          }

          return
        }

        if (resource.resourceType === 'scene' && onOpenScene) {
          await onOpenScene(resource.path)
          return
        }

        if (resource.resourceType) {
          await window.api.openProjectAssetEditor(resource.resourceType, projectPath, resource.path)
        }
      } catch (error) {
        console.error('[resource-management-pane] open resource failed', error)
        await loadResources(currentResourcePath)
        showErrorStatus(
          error instanceof Error
            ? error.message
            : 'Something went wrong while opening the resource. Please try again.'
        )
      }
    },
    [currentResourcePath, isInteractionDisabled, loadResources, onOpenScene, projectPath]
  )

  const rootMenuOptions = useMemo((): ContextMenuOption[] => {
    return [
      {
        id: 'new',
        label: 'New...',
        children: [
          {
            id: 'new-folder',
            label: 'Folder',
            disabled: !projectPath || isInteractionDisabled,
            onSelect: () => void handleCreateResource('folder')
          },
          {
            id: 'new-sprite',
            label: 'Sprite',
            disabled: !projectPath || isInteractionDisabled,
            onSelect: () => void handleCreateResource('sprite')
          },
          {
            id: 'new-tileset',
            label: 'Tileset',
            disabled: !projectPath || isInteractionDisabled,
            onSelect: () => void handleCreateResource('tileset')
          },
          {
            id: 'new-tilemap',
            label: 'Tilemap',
            disabled: !projectPath || isInteractionDisabled,
            onSelect: () => void handleCreateResource('tilemap')
          },
          {
            id: 'new-scene',
            label: 'Scene',
            disabled: !projectPath || isInteractionDisabled,
            onSelect: () => void handleCreateResource('scene')
          },
          { id: 'new-script', label: 'Script', disabled: true }
        ]
      },
      {
        id: 'paste',
        label: 'Paste',
        shortcutLabel: shortcutLabels.paste,
        disabled: !canPasteClipboardResource,
        onSelect: () => void handlePasteClipboardResource()
      }
    ]
  }, [
    canPasteClipboardResource,
    handleCreateResource,
    handlePasteClipboardResource,
    isInteractionDisabled,
    projectPath,
    shortcutLabels.paste
  ])

  return (
    <ContextMenuRegion options={rootMenuOptions}>
      <div className={buildClassName(className)} data-testid="resource-management-pane">
        <div className="resource-management-pane__chrome">
          <div className="resource-management-pane__toolbar">
            <div className="resource-management-pane__location">
              <strong>{resourceView?.projectName ?? 'Project Resources'}</strong>
              <span className="resource-management-pane__path">
                {formatLocationLabel(resourceView?.currentPath ?? '')}
              </span>
            </div>

            {resourceView !== null && resourceView.currentPath.length > 0 && (
              <button
                type="button"
                className="resource-management-pane__back-button"
                onClick={() => {
                  void loadResources(resourceView.parentPath ?? '')
                }}
                disabled={isInteractionDisabled}
              >
                Back
              </button>
            )}
          </div>

          {statusMessage && (
            <div
              className={`resource-management-pane__status resource-management-pane__status--${statusTone}`}
              role="status"
            >
              {statusMessage}
            </div>
          )}

          <div className="resource-management-pane__grid" role="list">
            {resourceView?.items.map((resource) => {
              const resourceType: Exclude<ProjectResourceKind, 'script'> | null =
                resource.type === 'folder' ? 'folder' : (resource.resourceType ?? null)
              const isEditing = editingResource?.path === resource.path
              const isSelected = selectedResourcePath === resource.path
              const isPendingCut =
                clipboardResource?.operation === 'cut' &&
                clipboardResource.resourcePath === resource.path

              if (resourceType) {
                const resourceMenuOptions: ContextMenuOption[] = [
                  {
                    id: `copy-${resource.path}`,
                    label: 'Copy',
                    shortcutLabel: shortcutLabels.copy,
                    disabled: isInteractionDisabled || !resourceType,
                    onSelect: () => placeClipboardResource(resource, 'copy')
                  },
                  {
                    id: `cut-${resource.path}`,
                    label: 'Cut',
                    shortcutLabel: shortcutLabels.cut,
                    disabled: isInteractionDisabled || !resourceType,
                    onSelect: () => placeClipboardResource(resource, 'cut')
                  },
                  {
                    id: `paste-${resource.path}`,
                    label: 'Paste',
                    shortcutLabel: shortcutLabels.paste,
                    disabled: !canPasteClipboardResource,
                    onSelect: () => void handlePasteClipboardResource()
                  },
                  {
                    id: `rename-${resource.path}`,
                    label: 'Rename',
                    disabled: isInteractionDisabled,
                    onSelect: () => beginResourceEditing(resource.path, resource.name, resourceType)
                  },
                  {
                    id: `delete-${resource.path}`,
                    label: 'Delete',
                    disabled: isInteractionDisabled,
                    onSelect: () => {
                      setPendingDeleteResource({
                        path: resource.path,
                        name: resource.name,
                        resourceType
                      })
                    }
                  }
                ]

                return (
                  <ContextMenuRegion
                    key={resource.path}
                    options={resourceMenuOptions}
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
                        onContextMenuCapture={() => setSelectedResourcePath(resource.path)}
                      >
                        {getResourceIcon(resource)}
                        <input
                          ref={renameInputRef}
                          type="text"
                          aria-label={`${getResourceTypeLabel(resourceType)} name for ${resource.name}`}
                          value={editingResource?.draftName ?? ''}
                          onChange={(event) => {
                            const nextName = event.target.value
                            setEditingResource((currentResource) => {
                              if (!currentResource || currentResource.path !== resource.path) {
                                return currentResource
                              }

                              return {
                                ...currentResource,
                                draftName: nextName
                              }
                            })
                          }}
                          onBlur={() => {
                            void commitResourceRename()
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void commitResourceRename()
                            }

                            if (event.key === 'Escape') {
                              event.preventDefault()
                              setEditingResource(null)
                              setStatusMessage(null)
                            }
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
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
                        onClick={() => setSelectedResourcePath(resource.path)}
                        onContextMenuCapture={() => setSelectedResourcePath(resource.path)}
                        onDoubleClick={() => {
                          void handleOpenResource(resource)
                        }}
                        disabled={isInteractionDisabled}
                      >
                        {getResourceIcon(resource)}
                        <span className="resource-management-pane__item-name">{resource.name}</span>
                      </button>
                    )}
                  </ContextMenuRegion>
                )
              }

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
                  <span className="resource-management-pane__item-badge">
                    {formatFileBadge(resource)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {pendingDeleteResource && (
          <div className="resource-management-pane__modal-backdrop">
            <div className="resource-management-pane__modal" role="dialog" aria-modal="true">
              <h2>Delete &quot;{pendingDeleteResource.name}&quot;?</h2>
              <p className="resource-management-pane__modal-copy">
                This action cannot be reversed and will remove everything inside that{' '}
                {getResourceTypeLabel(pendingDeleteResource.resourceType).toLowerCase()}.
              </p>

              <div className="resource-management-pane__modal-actions">
                <button
                  type="button"
                  onClick={() => setPendingDeleteResource(null)}
                  disabled={isInteractionDisabled}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteResource()}
                  disabled={isInteractionDisabled}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ContextMenuRegion>
  )
}
