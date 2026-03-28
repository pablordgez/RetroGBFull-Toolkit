import {
  type CSSProperties,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { ContextMenuOption, ContextMenuRegion } from '../ContextMenu/ContextMenuRegion'
import { RetroActorIcon, RetroFolderIcon } from '../Docking/ResourceIcons'
import { useHistory } from '../hooks/history/useHistory'
import { useUndoRedoShortcuts } from '../hooks/history/useUndoRedoShortcuts'
import { isEditableElementTarget, getCommandShortcutLabelPrefix } from '../utils/keyboardShortcuts'
import { SceneAssetDocument, SceneAssetNode } from '../../../../shared/projectAssets'
import {
  type EditingSceneNodeState,
  type SceneHierarchyClipboardState,
  type SceneHierarchyClipboardOperation,
  type SceneHierarchyHistoryState,
  buildUniqueSceneNodeName,
  cloneSceneNodeSnapshot,
  cloneSceneNodeWithFreshIds,
  findSceneNodeById,
  findSceneNodeRecord,
  getDefaultSceneNodeName,
  getSceneChildNodes,
  insertSceneNode,
  isValidScenePasteTarget,
  removeSceneNodeById,
  sceneSubtreeContainsNodeId,
  updateSceneNodeById
} from './sceneHierarchyModel'
import './SceneHierarchyPane.css'

interface SceneHierarchyPaneProps {
  className?: string
  scene: SceneAssetDocument | null
  sceneLabel?: string | null
  isDirty: boolean
  isSaving: boolean
  statusMessage?: string | null
  onSceneChange: (document: SceneAssetDocument) => void
  onSave: () => void
}

const buildClassName = (baseClassName: string, extraClassName?: string): string => {
  return extraClassName ? `${baseClassName} ${extraClassName}` : baseClassName
}

const getNodeIcon = (type: SceneAssetNode['type']): ReactElement => {
  return type === 'actor' ? (
    <RetroActorIcon className="scene-hierarchy-pane__icon" />
  ) : (
    <RetroFolderIcon className="scene-hierarchy-pane__icon" />
  )
}

export const SceneHierarchyPane = ({
  className,
  scene,
  sceneLabel,
  isDirty,
  isSaving,
  statusMessage,
  onSceneChange,
  onSave
}: SceneHierarchyPaneProps): ReactElement => {
  const paneRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const nextNodeIdRef = useRef(1)
  const [nodes, setNodes] = useState<SceneAssetNode[]>(scene?.nodes ?? [])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [clipboard, setClipboard] = useState<SceneHierarchyClipboardState | null>(null)
  const [editingNode, setEditingNode] = useState<EditingSceneNodeState | null>(null)
  const [isPaneFocused, setIsPaneFocused] = useState(false)
  const { record, undo, redo } = useHistory()

  const canEdit = Boolean(scene)
  const editingNodeId = editingNode?.nodeId ?? null

  const publishSceneNodes = useCallback(
    (nextNodes: SceneAssetNode[]) => {
      setNodes(nextNodes)

      if (!scene) {
        return
      }

      onSceneChange({
        ...scene,
        nodes: nextNodes
      })
    },
    [onSceneChange, scene]
  )

  const createNodeId = useCallback((): string => {
    const nextNodeId = nextNodeIdRef.current
    nextNodeIdRef.current += 1
    return `scene-node-${nextNodeId}`
  }, [])

  const applyHistoryState = useCallback(
    (nextState: SceneHierarchyHistoryState) => {
      publishSceneNodes(nextState.nodes)
      setSelectedNodeId(nextState.selectedNodeId)
      setClipboard(nextState.clipboard)
      setEditingNode(null)
    },
    [publishSceneNodes]
  )

  const captureHistoryState = useCallback(
    (nextValues?: Partial<SceneHierarchyHistoryState>): SceneHierarchyHistoryState => {
      return {
        nodes: nextValues?.nodes ?? nodes,
        selectedNodeId:
          nextValues && 'selectedNodeId' in nextValues
            ? (nextValues.selectedNodeId ?? null)
            : selectedNodeId,
        clipboard:
          nextValues && 'clipboard' in nextValues ? (nextValues.clipboard ?? null) : clipboard
      }
    },
    [clipboard, nodes, selectedNodeId]
  )

  const recordHistoryTransition = useCallback(
    (previousState: SceneHierarchyHistoryState, nextState: SceneHierarchyHistoryState) => {
      record({
        undo: () => {
          applyHistoryState(previousState)
        },
        redo: () => {
          applyHistoryState(nextState)
        }
      })
    },
    [applyHistoryState, record]
  )

  const selectedNode = useMemo(() => {
    return selectedNodeId ? findSceneNodeById(nodes, selectedNodeId) : null
  }, [nodes, selectedNodeId])

  const shortcutLabels = useMemo(() => {
    const commandKey = getCommandShortcutLabelPrefix()

    return {
      copy: `${commandKey}C`,
      cut: `${commandKey}X`,
      paste: `${commandKey}V`
    }
  }, [])

  const canPasteToRoot = useMemo(() => {
    return canEdit && isValidScenePasteTarget(nodes, clipboard, null)
  }, [canEdit, clipboard, nodes])

  const beginEditingNode = useCallback(
    (nodeId: string) => {
      const node = findSceneNodeById(nodes, nodeId)

      if (!node || !canEdit) {
        return
      }

      setSelectedNodeId(nodeId)
      setEditingNode({
        nodeId,
        draftName: node.name,
        originalName: node.name
      })
    },
    [canEdit, nodes]
  )

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

  const handleCreateNode = useCallback(
    (type: SceneAssetNode['type'], parentId: string | null) => {
      if (!scene || editingNode) {
        return
      }

      const nodeName = buildUniqueSceneNodeName(
        getSceneChildNodes(nodes, parentId),
        getDefaultSceneNodeName(type)
      )
      const nextNode: SceneAssetNode = {
        id: createNodeId(),
        type,
        name: nodeName,
        isCollapsed: false,
        children: []
      }
      const nextNodes = insertSceneNode(nodes, parentId, nextNode)
      const previousState = captureHistoryState()
      const nextState = captureHistoryState({
        nodes: nextNodes,
        selectedNodeId: nextNode.id
      })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
      setEditingNode({
        nodeId: nextNode.id,
        draftName: nextNode.name,
        originalName: nextNode.name
      })
    },
    [
      applyHistoryState,
      captureHistoryState,
      createNodeId,
      editingNode,
      nodes,
      recordHistoryTransition,
      scene
    ]
  )

  const handleDeleteNode = useCallback(
    (nodeId: string): void => {
      if (!scene || editingNode) {
        return
      }

      const removal = removeSceneNodeById(nodes, nodeId)

      if (!removal) {
        return
      }

      const nextClipboard =
        clipboard?.operation === 'cut' &&
        clipboard.sourceNodeId &&
        sceneSubtreeContainsNodeId(removal.removedNode, clipboard.sourceNodeId)
          ? null
          : clipboard
      const previousState = captureHistoryState()
      const nextState = captureHistoryState({
        nodes: removal.nodes,
        selectedNodeId: removal.parentId,
        clipboard: nextClipboard
      })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      captureHistoryState,
      clipboard,
      editingNode,
      nodes,
      recordHistoryTransition,
      scene
    ]
  )

  const handleToggleCollapsed = useCallback(
    (nodeId: string): void => {
      if (!scene) {
        return
      }

      const nextNodes = updateSceneNodeById(nodes, nodeId, (node) => ({
        ...node,
        isCollapsed: !node.isCollapsed
      }))

      publishSceneNodes(nextNodes)
    },
    [nodes, publishSceneNodes, scene]
  )

  const handleStageClipboard = useCallback(
    (nodeId: string, operation: SceneHierarchyClipboardOperation) => {
      if (!scene || editingNode) {
        return
      }

      const node = findSceneNodeById(nodes, nodeId)

      if (!node) {
        return
      }

      const previousState = captureHistoryState()
      const nextState = captureHistoryState({
        selectedNodeId: nodeId,
        clipboard: {
          operation,
          node: cloneSceneNodeSnapshot(node),
          sourceNodeId: operation === 'cut' ? nodeId : null
        }
      })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [applyHistoryState, captureHistoryState, editingNode, nodes, recordHistoryTransition, scene]
  )

  const handlePasteNodes = useCallback(
    (targetParentId: string | null): void => {
      if (
        !scene ||
        editingNode ||
        !isValidScenePasteTarget(nodes, clipboard, targetParentId) ||
        !clipboard
      ) {
        return
      }

      const previousState = captureHistoryState()

      if (clipboard.operation === 'copy') {
        const pastedNode = cloneSceneNodeWithFreshIds(clipboard.node, createNodeId)
        pastedNode.name = buildUniqueSceneNodeName(
          getSceneChildNodes(nodes, targetParentId),
          clipboard.node.name
        )

        const nextNodes = insertSceneNode(nodes, targetParentId, pastedNode)
        const nextState = captureHistoryState({
          nodes: nextNodes,
          selectedNodeId: pastedNode.id
        })

        applyHistoryState(nextState)
        recordHistoryTransition(previousState, nextState)
        return
      }

      if (!clipboard.sourceNodeId) {
        return
      }

      const removal = removeSceneNodeById(nodes, clipboard.sourceNodeId)

      if (!removal) {
        return
      }

      const nextNodes = insertSceneNode(removal.nodes, targetParentId, removal.removedNode)
      const nextState = captureHistoryState({
        nodes: nextNodes,
        selectedNodeId: removal.removedNode.id,
        clipboard: null
      })

      applyHistoryState(nextState)
      recordHistoryTransition(previousState, nextState)
    },
    [
      applyHistoryState,
      captureHistoryState,
      clipboard,
      createNodeId,
      editingNode,
      nodes,
      recordHistoryTransition,
      scene
    ]
  )

  const commitRename = useCallback(() => {
    if (!scene || !editingNode) {
      return
    }

    const trimmedName = editingNode.draftName.trim()

    if (trimmedName.length === 0 || trimmedName === editingNode.originalName) {
      setEditingNode(null)
      return
    }

    const nodeRecord = findSceneNodeRecord(nodes, editingNode.nodeId)

    if (!nodeRecord) {
      setEditingNode(null)
      return
    }

    const siblingNodes = getSceneChildNodes(nodes, nodeRecord.parentId)
    const nextName = buildUniqueSceneNodeName(siblingNodes, trimmedName, editingNode.nodeId)
    const nextNodes = updateSceneNodeById(nodes, editingNode.nodeId, (node) => ({
      ...node,
      name: nextName
    }))
    const previousState = captureHistoryState()
    const nextState = captureHistoryState({ nodes: nextNodes })

    applyHistoryState(nextState)
    recordHistoryTransition(previousState, nextState)
  }, [applyHistoryState, captureHistoryState, editingNode, nodes, recordHistoryTransition, scene])

  const executeHistoryAction = useCallback(
    async (action: 'undo' | 'redo') => {
      if (!scene || editingNode) {
        return
      }

      await (action === 'undo' ? undo() : redo())
    },
    [editingNode, redo, scene, undo]
  )

  useUndoRedoShortcuts(
    () => executeHistoryAction('undo'),
    () => executeHistoryAction('redo'),
    {
      enabled: isPaneFocused && canEdit,
      ignoreEditableTargets: true
    }
  )

  useEffect(() => {
    if (!isPaneFocused || !canEdit) {
      return
    }

    const handleShortcuts = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || isEditableElementTarget(event.target)) {
        return
      }

      if (event.key.toLowerCase() === 'c' && selectedNode) {
        event.preventDefault()
        handleStageClipboard(selectedNode.id, 'copy')
        return
      }

      if (event.key.toLowerCase() === 'x' && selectedNode) {
        event.preventDefault()
        handleStageClipboard(selectedNode.id, 'cut')
        return
      }

      if (event.key.toLowerCase() === 'v') {
        const targetParentId = selectedNode?.id ?? null

        if (!isValidScenePasteTarget(nodes, clipboard, targetParentId)) {
          return
        }

        event.preventDefault()
        handlePasteNodes(targetParentId)
      }
    }

    window.addEventListener('keydown', handleShortcuts)
    return () => window.removeEventListener('keydown', handleShortcuts)
  }, [
    canEdit,
    clipboard,
    handlePasteNodes,
    handleStageClipboard,
    isPaneFocused,
    nodes,
    selectedNode
  ])

  const rootMenuOptions = useMemo((): ContextMenuOption[] => {
    return [
      {
        id: 'scene-new',
        label: 'New...',
        children: [
          {
            id: 'scene-new-actor',
            label: 'Actor',
            disabled: !canEdit || Boolean(editingNode),
            onSelect: () => handleCreateNode('actor', null)
          },
          {
            id: 'scene-new-folder',
            label: 'Folder',
            disabled: !canEdit || Boolean(editingNode),
            onSelect: () => handleCreateNode('folder', null)
          }
        ]
      },
      {
        id: 'scene-paste',
        label: 'Paste',
        shortcutLabel: shortcutLabels.paste,
        disabled: !canPasteToRoot || Boolean(editingNode),
        onSelect: () => handlePasteNodes(null)
      }
    ]
  }, [
    canEdit,
    canPasteToRoot,
    editingNode,
    handleCreateNode,
    handlePasteNodes,
    shortcutLabels.paste
  ])

  const footerStatus = scene
    ? (statusMessage ?? (isDirty ? 'Unsaved changes.' : 'No unsaved changes.'))
    : 'Open a scene to edit its hierarchy.'

  const renderNode = (node: SceneAssetNode, depth: number): ReactElement => {
    const hasChildren = node.children.length > 0
    const isSelected = selectedNodeId === node.id
    const isEditing = editingNode?.nodeId === node.id
    const isCut = clipboard?.operation === 'cut' && clipboard.sourceNodeId === node.id
    const canPasteIntoNode = canEdit && isValidScenePasteTarget(nodes, clipboard, node.id)
    const rowStyle: CSSProperties = {
      paddingLeft: `${depth * 18}px`
    }
    const nodeMenuOptions: ContextMenuOption[] = [
      {
        id: `node-new-${node.id}`,
        label: 'New...',
        children: [
          {
            id: `node-new-actor-${node.id}`,
            label: 'Actor',
            disabled: !canEdit || Boolean(editingNode),
            onSelect: () => handleCreateNode('actor', node.id)
          },
          {
            id: `node-new-folder-${node.id}`,
            label: 'Folder',
            disabled: !canEdit || Boolean(editingNode),
            onSelect: () => handleCreateNode('folder', node.id)
          }
        ]
      },
      {
        id: `node-copy-${node.id}`,
        label: 'Copy',
        shortcutLabel: shortcutLabels.copy,
        disabled: !canEdit || Boolean(editingNode),
        onSelect: () => handleStageClipboard(node.id, 'copy')
      },
      {
        id: `node-cut-${node.id}`,
        label: 'Cut',
        shortcutLabel: shortcutLabels.cut,
        disabled: !canEdit || Boolean(editingNode),
        onSelect: () => handleStageClipboard(node.id, 'cut')
      },
      {
        id: `node-paste-${node.id}`,
        label: 'Paste',
        shortcutLabel: shortcutLabels.paste,
        disabled: !canPasteIntoNode || Boolean(editingNode),
        onSelect: () => handlePasteNodes(node.id)
      },
      {
        id: `node-rename-${node.id}`,
        label: 'Rename',
        disabled: !canEdit || Boolean(editingNode),
        onSelect: () => beginEditingNode(node.id)
      },
      {
        id: `node-delete-${node.id}`,
        label: 'Delete',
        disabled: !canEdit || Boolean(editingNode),
        onSelect: () => handleDeleteNode(node.id)
      }
    ]

    return (
      <div key={node.id}>
        <ContextMenuRegion options={nodeMenuOptions} className="scene-hierarchy-pane__item-menu">
          <div
            className="scene-hierarchy-pane__row"
            style={rowStyle}
            onContextMenuCapture={() => {
              setSelectedNodeId(node.id)
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
                  setSelectedNodeId(node.id)
                  handleToggleCollapsed(node.id)
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
                  value={editingNode?.draftName ?? ''}
                  aria-label={`Name for ${node.name}`}
                  onChange={(event) => {
                    const nextDraftName = event.target.value
                    setEditingNode((currentEditingNode) => {
                      if (!currentEditingNode || currentEditingNode.nodeId !== node.id) {
                        return currentEditingNode
                      }

                      return {
                        ...currentEditingNode,
                        draftName: nextDraftName
                      }
                    })
                  }}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitRename()
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setEditingNode(null)
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
                  setSelectedNodeId(node.id)
                  paneRef.current?.focus()
                }}
              >
                {getNodeIcon(node.type)}
                <span className="scene-hierarchy-pane__label">{node.name}</span>
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
        <div
          className="scene-hierarchy-pane__tree"
          role="tree"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedNodeId(null)
            }
          }}
          onContextMenuCapture={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedNodeId(null)
              paneRef.current?.focus()
            }
          }}
        >
          {nodes.map((node) => renderNode(node, 0))}
        </div>

        <div className="scene-hierarchy-pane__footer">
          <div className="scene-hierarchy-pane__footer-copy">
            <strong>{sceneLabel ?? 'No Scene'}</strong>
            <span>{footerStatus}</span>
          </div>

          <button type="button" onClick={() => void onSave()} disabled={!scene || isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </ContextMenuRegion>
  )
}
