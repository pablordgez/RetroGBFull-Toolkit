import { type CSSProperties, type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import { ContextMenuOption, ContextMenuRegion } from '../ContextMenu/ContextMenuRegion'
import {
  RetroActorIcon,
  RetroCollisionIcon,
  RetroFolderIcon,
  RetroTilemapIcon,
  RetroWindowIcon
} from '../Docking/ResourceIcons'
import { getCommandShortcutLabelPrefix, isEditableElementTarget } from '../utils/keyboardShortcuts'
import type { SceneAssetNode } from '../../../../shared/projectAssets'
import { isSceneActorNode, isSceneCollisionNode } from './sceneHierarchyModel'
import type { SceneDocumentEditor } from './useSceneDocumentEditor'
import './SceneHierarchyPane.css'

interface SceneHierarchyPaneProps {
  className?: string
  editor: SceneDocumentEditor
  sceneLabel?: string | null
  isDirty: boolean
  isSaving: boolean
  statusMessage?: string | null
  onSave: () => void
  onRequestTilemapLoad: () => void
  onRequestWindowLoad: () => void
  onRequestActorLoad: (parentId: string | null) => void
  onSaveActorResource: (nodeId: string) => void
}

const buildClassName = (baseClassName: string, extraClassName?: string): string => {
  return extraClassName ? `${baseClassName} ${extraClassName}` : baseClassName
}

const getNodeIcon = (type: SceneAssetNode['type']): ReactElement => {
  switch (type) {
    case 'actor':
      return <RetroActorIcon className="scene-hierarchy-pane__icon" />
    case 'collision':
      return <RetroCollisionIcon className="scene-hierarchy-pane__icon" />
    default:
      return <RetroFolderIcon className="scene-hierarchy-pane__icon" />
  }
}

export const SceneHierarchyPane = ({
  className,
  editor,
  sceneLabel,
  isDirty,
  isSaving,
  statusMessage,
  onSave,
  onRequestTilemapLoad,
  onRequestWindowLoad,
  onRequestActorLoad,
  onSaveActorResource
}: SceneHierarchyPaneProps): ReactElement => {
  const paneRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [isPaneFocused, setIsPaneFocused] = useState(false)
  const editingNodeId = editor.editingNode?.nodeId ?? null

  const shortcutLabels = useMemo(() => {
    const commandKey = getCommandShortcutLabelPrefix()

    return {
      copy: `${commandKey}C`,
      cut: `${commandKey}X`,
      paste: `${commandKey}V`
    }
  }, [])

  useEffect(() => {
    if (!editingNodeId || !renameInputRef.current) {
      return
    }

    const animationFrame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [editingNodeId])

  useEffect(() => {
    if (!isPaneFocused || !editor.canEdit) {
      return
    }

    const handleShortcuts = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || isEditableElementTarget(event.target)) {
        return
      }

      if (event.key.toLowerCase() === 'c' && editor.selectedNode) {
        event.preventDefault()
        editor.stageClipboard(editor.selectedNode.id, 'copy')
        return
      }

      if (event.key.toLowerCase() === 'x' && editor.selectedNode) {
        event.preventDefault()
        editor.stageClipboard(editor.selectedNode.id, 'cut')
        return
      }

      if (event.key.toLowerCase() === 'v' && editor.canPasteTo(editor.selectedNode?.id ?? null)) {
        event.preventDefault()
        editor.pasteNodes(editor.selectedNode?.id ?? null)
      }
    }

    window.addEventListener('keydown', handleShortcuts)
    return () => window.removeEventListener('keydown', handleShortcuts)
  }, [editor, isPaneFocused])

  const rootMenuOptions = useMemo((): ContextMenuOption[] => {
    return [
      {
        id: 'scene-new',
        label: 'New...',
        children: [
          {
            id: 'scene-new-actor',
            label: 'Actor',
            disabled: !editor.canCreateNode('actor', null),
            onSelect: () => editor.createNode('actor', null)
          },
          {
            id: 'scene-new-collision',
            label: 'Collision',
            disabled: !editor.canCreateNode('collision', null),
            onSelect: () => editor.createNode('collision', null)
          },
          {
            id: 'scene-new-folder',
            label: 'Folder',
            disabled: !editor.canCreateNode('folder', null),
            onSelect: () => editor.createNode('folder', null)
          }
        ]
      },
      {
        id: 'scene-load',
        label: 'Load...',
        children: [
          {
            id: 'scene-load-tilemap',
            label: 'Tilemap',
            disabled: !editor.canEdit || Boolean(editor.editingNode),
            onSelect: onRequestTilemapLoad
          },
          {
            id: 'scene-load-actor',
            label: 'Actor',
            disabled: !editor.canEdit || Boolean(editor.editingNode),
            onSelect: () => onRequestActorLoad(null)
          }
        ]
      },
      {
        id: 'scene-paste',
        label: 'Paste',
        shortcutLabel: shortcutLabels.paste,
        disabled: !editor.canPasteTo(null) || Boolean(editor.editingNode),
        onSelect: () => editor.pasteNodes(null)
      }
    ]
  }, [editor, onRequestActorLoad, onRequestTilemapLoad, shortcutLabels.paste])

  const footerStatus = editor.canEdit
    ? (statusMessage ?? (isDirty ? 'Unsaved changes.' : 'No unsaved changes.'))
    : 'Open a scene to edit its hierarchy.'

  const renderNode = (node: SceneAssetNode, depth: number): ReactElement => {
    const hasChildren = node.children.length > 0
    const isSelected = editor.selectedNodeId === node.id
    const isEditing = editor.editingNode?.nodeId === node.id
    const isCut = editor.clipboard?.operation === 'cut' && editor.clipboard.sourceNodeId === node.id
    const canPasteIntoNode = editor.canPasteTo(node.id)
    const rowStyle: CSSProperties = {
      paddingLeft: `${depth * 18}px`
    }
    const nodeMenuOptions: ContextMenuOption[] = [
      ...(isSceneCollisionNode(node)
        ? []
        : [
            {
              id: `node-new-${node.id}`,
              label: 'New...',
              children: [
                {
                  id: `node-new-actor-${node.id}`,
                  label: 'Actor',
                  disabled: !editor.canCreateNode('actor', node.id),
                  onSelect: () => editor.createNode('actor', node.id)
                },
                {
                  id: `node-new-collision-${node.id}`,
                  label: 'Collision',
                  disabled: !editor.canCreateNode('collision', node.id),
                  onSelect: () => editor.createNode('collision', node.id)
                },
                {
                  id: `node-new-folder-${node.id}`,
                  label: 'Folder',
                  disabled: !editor.canCreateNode('folder', node.id),
                  onSelect: () => editor.createNode('folder', node.id)
                }
              ]
            } satisfies ContextMenuOption,
            {
              id: `node-load-${node.id}`,
              label: 'Load...',
              children: [
                {
                  id: `node-load-actor-${node.id}`,
                  label: 'Actor',
                  disabled: !editor.canEdit || Boolean(editor.editingNode),
                  onSelect: () => onRequestActorLoad(node.id)
                }
              ]
            } satisfies ContextMenuOption
          ]),
      {
        id: `node-copy-${node.id}`,
        label: 'Copy',
        shortcutLabel: shortcutLabels.copy,
        disabled: !editor.canEdit || Boolean(editor.editingNode),
        onSelect: () => editor.stageClipboard(node.id, 'copy')
      },
      {
        id: `node-cut-${node.id}`,
        label: 'Cut',
        shortcutLabel: shortcutLabels.cut,
        disabled: !editor.canEdit || Boolean(editor.editingNode),
        onSelect: () => editor.stageClipboard(node.id, 'cut')
      },
      {
        id: `node-paste-${node.id}`,
        label: 'Paste',
        shortcutLabel: shortcutLabels.paste,
        disabled: !canPasteIntoNode || Boolean(editor.editingNode),
        onSelect: () => editor.pasteNodes(node.id)
      },
      {
        id: `node-rename-${node.id}`,
        label: 'Rename',
        disabled: !editor.canEdit || Boolean(editor.editingNode),
        onSelect: () => editor.beginEditingNode(node.id)
      },
      ...(isSceneActorNode(node)
        ? [
            {
              id: `node-save-actor-${node.id}`,
              label: 'Save As Resource',
              disabled: !editor.canEdit || Boolean(editor.editingNode),
              onSelect: () => onSaveActorResource(node.id)
            } satisfies ContextMenuOption
          ]
        : []),
      {
        id: `node-delete-${node.id}`,
        label: 'Delete',
        disabled: !editor.canEdit || Boolean(editor.editingNode),
        onSelect: () => editor.deleteNode(node.id)
      }
    ]

    return (
      <div key={node.id}>
        <ContextMenuRegion options={nodeMenuOptions} className="scene-hierarchy-pane__item-menu">
          <div
            className="scene-hierarchy-pane__row"
            style={rowStyle}
            onContextMenuCapture={() => {
              editor.selectNode(node.id)
              paneRef.current?.focus()
            }}
          >
            {hasChildren ? (
              <button
                type="button"
                className="scene-hierarchy-pane__toggle"
                aria-label={node.isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  editor.selectNode(node.id)
                  editor.toggleCollapsed(node.id)
                }}
              >
                {node.isCollapsed ? '>' : 'v'}
              </button>
            ) : (
              <span className="scene-hierarchy-pane__toggle-placeholder" aria-hidden="true" />
            )}

            {isEditing ? (
              <div
                className="scene-hierarchy-pane__rename"
                role="treeitem"
                aria-expanded={hasChildren ? !node.isCollapsed : undefined}
              >
                {getNodeIcon(node.type)}
                <input
                  ref={renameInputRef}
                  type="text"
                  value={editor.editingNode?.draftName ?? ''}
                  aria-label={`Name for ${node.name}`}
                  onChange={(event) => {
                    editor.setEditingNodeDraftName(event.target.value)
                  }}
                  onBlur={editor.commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      editor.commitRename()
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault()
                      editor.cancelEditingNode()
                    }
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
            ) : (
              <button
                type="button"
                className={buildClassName(
                  'scene-hierarchy-pane__node',
                  [
                    isSelected ? 'scene-hierarchy-pane__node--selected' : '',
                    isCut ? 'scene-hierarchy-pane__node--cut' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')
                )}
                role="treeitem"
                aria-expanded={hasChildren ? !node.isCollapsed : undefined}
                onClick={() => {
                  editor.selectNode(node.id)
                  paneRef.current?.focus()
                }}
              >
                {getNodeIcon(node.type)}
                <span className="scene-hierarchy-pane__label">{node.name}</span>
                {isSceneActorNode(node) && node.followCamera && (
                  <span className="scene-hierarchy-pane__badge">CAM</span>
                )}
              </button>
            )}
          </div>
        </ContextMenuRegion>

        {!node.isCollapsed && node.children.length > 0 && (
          <div className="scene-hierarchy-pane__children" role="group">
            {node.children.map((childNode) => renderNode(childNode, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <ContextMenuRegion options={rootMenuOptions}>
      <div
        ref={paneRef}
        className={buildClassName('scene-hierarchy-pane', className)}
        data-testid="project-workspace-scene-sidebar"
        tabIndex={0}
        onFocusCapture={() => setIsPaneFocused(true)}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget

          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
            setIsPaneFocused(false)
          }
        }}
        onMouseDown={() => {
          paneRef.current?.focus()
        }}
      >
        <div className="scene-hierarchy-pane__scene-chip" aria-hidden="true">
          <div className="scene-hierarchy-pane__scene-chip-copy">
            <RetroTilemapIcon className="scene-hierarchy-pane__scene-chip-icon" />
            <span>
              {editor.tilemapPath ? editor.tilemapPath.split('/').pop() : 'No tilemap loaded'}
            </span>
          </div>

          <button
            type="button"
            className="scene-hierarchy-pane__scene-chip-action"
            onClick={() => {
              onRequestTilemapLoad()
            }}
            disabled={!editor.canEdit || Boolean(editor.editingNode)}
          >
            Load...
          </button>
        </div>

        <div className="scene-hierarchy-pane__scene-chip" aria-hidden="true">
          <div className="scene-hierarchy-pane__scene-chip-copy">
            <RetroWindowIcon className="scene-hierarchy-pane__scene-chip-icon" />
            <span>
              {editor.windowPath ? editor.windowPath.split('/').pop() : 'No window loaded'}
            </span>
          </div>

          <button
            type="button"
            className="scene-hierarchy-pane__scene-chip-action"
            onClick={() => {
              onRequestWindowLoad()
            }}
            disabled={!editor.canEdit || Boolean(editor.editingNode)}
          >
            Load...
          </button>
        </div>

        <div
          className="scene-hierarchy-pane__tree"
          role="tree"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              editor.selectNode(null)
            }
          }}
          onContextMenuCapture={(event) => {
            if (event.target === event.currentTarget) {
              editor.selectNode(null)
              paneRef.current?.focus()
            }
          }}
        >
          {editor.nodes.map((node) => renderNode(node, 0))}
        </div>

        <div className="scene-hierarchy-pane__footer">
          <div className="scene-hierarchy-pane__footer-copy">
            <strong>{sceneLabel ?? 'No Scene'}</strong>
            <span>{footerStatus}</span>
          </div>

          <div className="scene-hierarchy-pane__footer-actions">
            <button
              type="button"
              onClick={() => void editor.undo()}
              disabled={!editor.canEdit || !editor.canUndo || Boolean(editor.editingNode)}
            >
              Undo
            </button>

            <button
              type="button"
              onClick={() => void editor.redo()}
              disabled={!editor.canEdit || !editor.canRedo || Boolean(editor.editingNode)}
            >
              Redo
            </button>

            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!editor.canEdit || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </ContextMenuRegion>
  )
}
