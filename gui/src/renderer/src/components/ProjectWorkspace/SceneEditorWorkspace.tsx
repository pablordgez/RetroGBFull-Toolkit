import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ActorAssetDocument,
  ProjectAssetKind,
  SceneAssetDocument,
  TilemapAssetDocument
} from '../../../../shared/projectAssets'
import { ProjectAssetPickerModal } from '../ProjectAssets/ProjectAssetPickerModal'
import type { ProjectAssetDragPayload } from '../ProjectAssets/projectAssetDrag'
import {
  listProjectAssetsByKind,
  type ProjectAssetOption
} from '../ProjectAssets/projectAssetBrowser'
import { useUndoRedoShortcuts } from '../hooks/history/useUndoRedoShortcuts'
import { ResizablePaneLayout } from '../Layout/ResizablePaneLayout'
import { SceneHierarchyPane } from '../SceneHierarchy/SceneHierarchyPane'
import { SceneInspectorPane } from '../SceneHierarchy/SceneInspectorPane'
import { SceneViewport } from '../SceneHierarchy/SceneViewport'
import { drawTilemapToCanvas, drawWindowToCanvas } from '../SceneHierarchy/sceneRenderUtils'
import { clearFollowCameraInSceneNodeSubtree } from '../SceneHierarchy/sceneHierarchyModel'
import { useSceneAssetReferences } from '../SceneHierarchy/useSceneAssetReferences'
import { useSceneDocumentEditor } from '../SceneHierarchy/useSceneDocumentEditor'
import { isEditableElementTarget } from '../utils/keyboardShortcuts'

interface SceneEditorWorkspaceProps {
  projectPath: string
  scenePath: string | null
  scene: SceneAssetDocument | null
  resourceManagerCurrentPath: string
  sceneLabel?: string | null
  isDirty: boolean
  isSaving: boolean
  statusMessage?: string | null
  onSceneChange: (document: SceneAssetDocument) => void
  onSave: () => void
  onStatus: (tone: 'info' | 'error', text: string) => void
  onResourcesChanged: () => void
}

type SceneAssetPickerState =
  | {
      mode: 'tilemap'
    }
  | {
      mode: 'window'
    }
  | {
      mode: 'actor'
      parentId: string | null
    }
  | {
      mode: 'sprite'
      nodeId: string
    }

const stripActorResourcePaths = (
  node: ActorAssetDocument['root']
): ActorAssetDocument['root'] => {
  return {
    ...node,
    resourcePath: undefined,
    children: node.children.map((childNode) =>
      childNode.type === 'actor' ? stripActorResourcePaths(childNode) : childNode
    )
  }
}

export const SceneEditorWorkspace = ({
  projectPath,
  scene,
  resourceManagerCurrentPath,
  sceneLabel,
  isDirty,
  isSaving,
  statusMessage,
  onSceneChange,
  onSave,
  onStatus,
  onResourcesChanged
}: SceneEditorWorkspaceProps): ReactElement => {
  const editor = useSceneDocumentEditor({ scene, onSceneChange })
  const workspaceRef = useRef<HTMLDivElement>(null)
  const {
    tilemapDocument,
    tilemapTilesetDocument,
    windowDocument,
    windowTilesetDocument,
    spritePreviews,
    loadError
  } = useSceneAssetReferences(projectPath, editor)
  const [pickerState, setPickerState] = useState<SceneAssetPickerState | null>(null)
  const [pickerOptions, setPickerOptions] = useState<ProjectAssetOption[]>([])
  const [isPickerLoading, setIsPickerLoading] = useState(false)
  const [pickerErrorMessage, setPickerErrorMessage] = useState<string | null>(null)
  const [isPickerBusy, setIsPickerBusy] = useState(false)
  const [pendingActorSaveChoice, setPendingActorSaveChoice] = useState<{
    nodeId: string
    actorName: string
    existingResourcePath: string
  } | null>(null)
  const [isActorSaveBusy, setIsActorSaveBusy] = useState(false)

  const focusWorkspace = useCallback(() => {
    workspaceRef.current?.focus()
  }, [])

  useUndoRedoShortcuts(
    () => editor.undo(),
    () => editor.redo(),
    {
      enabled: editor.canEdit && pickerState === null,
      containerRef: workspaceRef,
      ignoreEditableTargets: true
    }
  )

  const refreshPickerOptions = useCallback(
    async (nextPickerState: SceneAssetPickerState) => {
      setIsPickerLoading(true)
      setPickerErrorMessage(null)

      try {
        const assetKinds: ProjectAssetKind[] =
          nextPickerState.mode === 'tilemap'
            ? ['tilemap']
            : nextPickerState.mode === 'window'
              ? ['window']
              : nextPickerState.mode === 'actor'
                ? ['actor']
                : ['sprite']
        const nextOptions = await listProjectAssetsByKind(projectPath, assetKinds)
        setPickerOptions(nextOptions)
      } catch (error) {
        console.error('[scene-editor] load asset picker options failed', error)
        setPickerErrorMessage(
          error instanceof Error
            ? error.message
            : 'Something went wrong while loading project assets.'
        )
      } finally {
        setIsPickerLoading(false)
      }
    },
    [projectPath]
  )

  const openPicker = useCallback(
    (nextPickerState: SceneAssetPickerState) => {
      setPickerState(nextPickerState)
      void refreshPickerOptions(nextPickerState)
    },
    [refreshPickerOptions]
  )

  const closePicker = useCallback(() => {
    setPickerState(null)
    setPickerOptions([])
    setPickerErrorMessage(null)
    setIsPickerBusy(false)
  }, [])

  const handleSelectAsset = useCallback(
    async (option: ProjectAssetOption) => {
      if (!pickerState) {
        return
      }

      setIsPickerBusy(true)

      try {
        if (pickerState.mode === 'tilemap') {
          const tilemapPayload = await window.api.loadProjectAssetFile(projectPath, option.path)

          if (tilemapPayload.assetKind !== 'tilemap') {
            throw new Error('The selected asset is not a tilemap.')
          }

          const tilemapDocument = tilemapPayload.document as TilemapAssetDocument
          editor.setTilemapPath(option.path, {
            width: tilemapDocument.width,
            height: tilemapDocument.height
          })
          closePicker()
          focusWorkspace()
          return
        }

        if (pickerState.mode === 'window') {
          editor.setWindowPath(option.path)
          closePicker()
          focusWorkspace()
          return
        }

        if (pickerState.mode === 'sprite') {
          editor.updateActor(pickerState.nodeId, { spritePath: option.path })
          closePicker()
          focusWorkspace()
          return
        }

        const payload = await window.api.loadProjectAssetFile(projectPath, option.path)

        if (payload.assetKind !== 'actor') {
          throw new Error('The selected asset is not an actor.')
        }

        const actorDocument = payload.document as ActorAssetDocument
        editor.loadActor(pickerState.parentId, actorDocument.root, undefined, option.path)
        closePicker()
        focusWorkspace()
      } catch (error) {
        console.error('[scene-editor] apply asset picker selection failed', error)
        setPickerErrorMessage(
          error instanceof Error ? error.message : 'Something went wrong while loading the asset.'
        )
      } finally {
        setIsPickerBusy(false)
      }
    },
    [closePicker, editor, focusWorkspace, pickerState, projectPath]
  )

  const handleSaveActorResource = useCallback(
    async (nodeId: string, saveMode: 'new' | 'overwrite' = 'new') => {
      if (!projectPath) {
        return
      }

      const actorSnapshot = editor.snapshotActor(nodeId)

      if (!actorSnapshot) {
        return
      }

      setIsActorSaveBusy(true)

      try {
        const actorResourceRoot = stripActorResourcePaths(
          clearFollowCameraInSceneNodeSubtree(actorSnapshot) as ActorAssetDocument['root']
        )
        const shouldOverwrite =
          saveMode === 'overwrite' &&
          typeof actorSnapshot.resourcePath === 'string' &&
          actorSnapshot.resourcePath.length > 0
        let savedResourcePath = shouldOverwrite ? actorSnapshot.resourcePath : null

        if (!savedResourcePath) {
          const result = await window.api.createProjectResource(
            projectPath,
            'actor',
            resourceManagerCurrentPath,
            actorSnapshot.name
          )

          savedResourcePath = result.resourcePath
        }

        await window.api.saveProjectAssetFile(projectPath, savedResourcePath, {
          kind: 'actor',
          version: 1,
          root: actorResourceRoot
        })

        editor.setActorResourcePath(nodeId, savedResourcePath)

        if (!shouldOverwrite) {
          onResourcesChanged()
        }

        onStatus(
          'info',
          shouldOverwrite
            ? `Overwrote actor resource "${actorSnapshot.name}".`
            : `Saved actor resource "${actorSnapshot.name}".`
        )
      } catch (error) {
        console.error('[scene-editor] save actor resource failed', error)
        onStatus(
          'error',
          error instanceof Error
            ? error.message
            : 'Something went wrong while saving the actor resource.'
        )
      } finally {
        setIsActorSaveBusy(false)
        setPendingActorSaveChoice(null)
      }
    },
    [editor, onResourcesChanged, onStatus, projectPath, resourceManagerCurrentPath]
  )

  const handleRequestActorResourceSave = useCallback(
    (nodeId: string) => {
      const actorSnapshot = editor.snapshotActor(nodeId)

      if (!actorSnapshot) {
        return
      }

      if (typeof actorSnapshot.resourcePath === 'string' && actorSnapshot.resourcePath.length > 0) {
        setPendingActorSaveChoice({
          nodeId,
          actorName: actorSnapshot.name,
          existingResourcePath: actorSnapshot.resourcePath
        })
        return
      }

      void handleSaveActorResource(nodeId)
    },
    [editor, handleSaveActorResource]
  )

  const pickerCopy = useMemo(() => {
    if (!pickerState) {
      return null
    }

    if (pickerState.mode === 'tilemap') {
      return {
        title: 'Load Tilemap',
        description: 'Choose which tracked tilemap should define this scene.',
        emptyMessage: 'No tilemaps were found in this project yet.'
      }
    }

    if (pickerState.mode === 'window') {
      return {
        title: 'Load Window',
        description: 'Choose which tracked window should render on top of this scene.',
        emptyMessage: 'No windows were found in this project yet.'
      }
    }

    if (pickerState.mode === 'actor') {
      return {
        title: 'Load Actor',
        description: 'Choose an actor resource to insert into the scene hierarchy.',
        emptyMessage: 'No actor resources were found in this project yet.'
      }
    }

    return {
      title: 'Select Sprite',
      description: 'Choose which sprite the selected actor should render in the scene.',
      emptyMessage: 'No sprites were found in this project yet.'
    }
  }, [pickerState])

  const tilemapSize = useMemo(
    () =>
      tilemapDocument
        ? {
            width: tilemapDocument.width,
            height: tilemapDocument.height
          }
        : null,
    [tilemapDocument]
  )
  const clampActorsToMap = editor.clampActorsToMap

  useEffect(() => {
    clampActorsToMap(tilemapSize)
  }, [clampActorsToMap, tilemapSize])

  const drawSceneTilemap = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (!tilemapDocument || !tilemapTilesetDocument) {
        return
      }

      drawTilemapToCanvas(canvas, tilemapDocument, tilemapTilesetDocument)
    },
    [tilemapDocument, tilemapTilesetDocument]
  )

  const drawSceneWindow = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (!windowDocument || !windowTilesetDocument) {
        return
      }

      drawWindowToCanvas(canvas, windowDocument, windowTilesetDocument)
    },
    [windowDocument, windowTilesetDocument]
  )

  const handleDropProjectAsset = useCallback(
    async (
      payload: ProjectAssetDragPayload,
      dropPosition: {
        x: number
        y: number
      }
    ) => {
      try {
        if (payload.kind === 'tilemap') {
          const tilemapPayload = await window.api.loadProjectAssetFile(projectPath, payload.path)

          if (tilemapPayload.assetKind !== 'tilemap') {
            throw new Error('The dropped asset is not a tilemap.')
          }

          const tilemapDocument = tilemapPayload.document as TilemapAssetDocument
          editor.setTilemapPath(payload.path, {
            width: tilemapDocument.width,
            height: tilemapDocument.height
          })
          focusWorkspace()
          return
        }

        if (payload.kind === 'window') {
          const windowPayload = await window.api.loadProjectAssetFile(projectPath, payload.path)

          if (windowPayload.assetKind !== 'window') {
            throw new Error('The dropped asset is not a window.')
          }

          editor.setWindowPath(payload.path)
          focusWorkspace()
          return
        }

        const actorPayload = await window.api.loadProjectAssetFile(projectPath, payload.path)

        if (actorPayload.assetKind !== 'actor') {
          throw new Error('The dropped asset is not an actor.')
        }

        editor.loadActor(
          null,
          (actorPayload.document as ActorAssetDocument).root,
          dropPosition,
          payload.path
        )
        focusWorkspace()
      } catch (error) {
        console.error('[scene-editor] drop project asset failed', error)
        onStatus(
          'error',
          error instanceof Error ? error.message : 'Something went wrong while dropping the asset.'
        )
      }
    },
    [editor, focusWorkspace, onStatus, projectPath]
  )

  return (
    <div
      ref={workspaceRef}
      className="project-workspace__scene-editor"
      tabIndex={-1}
      onPointerDownCapture={(event) => {
        if (isEditableElementTarget(event.target)) {
          return
        }

        focusWorkspace()
      }}
    >
      <ResizablePaneLayout
        className="project-workspace__editor-layout"
        direction="horizontal"
        panePosition="start"
        pane={
          <SceneHierarchyPane
            className="project-workspace__editor-pane project-workspace__editor-pane--sidebar"
            editor={editor}
            sceneLabel={sceneLabel}
            isDirty={isDirty}
            isSaving={isSaving}
            statusMessage={statusMessage}
            onSave={onSave}
            onRequestTilemapLoad={() => {
              openPicker({ mode: 'tilemap' })
            }}
            onRequestWindowLoad={() => {
              openPicker({ mode: 'window' })
            }}
            onRequestActorLoad={(parentId) => {
              openPicker({ mode: 'actor', parentId })
            }}
            onSaveActorResource={handleRequestActorResourceSave}
          />
        }
        initialPaneSize={260}
        minPaneSize={180}
        maxPaneSizeRatio={0.3}
        resizeHandleLabel="Resize scene hierarchy"
      >
        <ResizablePaneLayout
          className="project-workspace__editor-secondary-layout"
          direction="horizontal"
          panePosition="end"
          pane={
            <SceneInspectorPane
              key={`${editor.selectedNode?.id ?? 'no-node'}:${editor.selectedActor?.x ?? 0}:${
                editor.selectedActor?.y ?? 0
              }:${editor.selectedActor?.spritePath ?? 'no-sprite'}:${
                editor.selectedActor?.followCamera ?? false
              }:${editor.selectedCollision?.x ?? 0}:${editor.selectedCollision?.y ?? 0}:${
                editor.selectedCollision?.width ?? 0
              }:${editor.selectedCollision?.height ?? 0}:${
                editor.selectedCollision?.isBlocking ?? false
              }`}
              className="project-workspace__editor-pane project-workspace__editor-pane--inspector"
              editor={editor}
              tilemapSize={tilemapSize}
              onRequestSpriteSelection={(nodeId) => {
                openPicker({ mode: 'sprite', nodeId })
              }}
            />
          }
          initialPaneSize={280}
          minPaneSize={220}
          maxPaneSizeRatio={0.35}
          resizeHandleLabel="Resize scene inspector"
        >
          <section
            className="project-workspace__editor-pane project-workspace__editor-pane--main"
            data-testid="project-workspace-surface"
          >
            {!scene && (
              <div className="project-workspace__empty-state">
                Create or load a new scene to start working
              </div>
            )}

            {scene && (
              <SceneViewport
                editor={editor}
                tilemapSize={tilemapSize}
                loadError={loadError}
                spritePreviews={spritePreviews}
                tilemapDocument={tilemapDocument}
                tilesetDocumentLoaded={Boolean(tilemapTilesetDocument)}
                windowDocument={windowDocument}
                windowTilesetDocumentLoaded={Boolean(windowTilesetDocument)}
                onActorSelect={(nodeId) => {
                  editor.selectNode(nodeId)
                }}
                onCollisionSelect={(nodeId) => {
                  editor.selectNode(nodeId)
                }}
                onViewportBackgroundSelect={() => {
                  editor.selectNode(null)
                }}
                onProjectAssetDrop={(payload, dropPosition) => {
                  void handleDropProjectAsset(payload, dropPosition)
                }}
                drawTilemap={drawSceneTilemap}
                drawWindow={drawSceneWindow}
              />
            )}
          </section>
        </ResizablePaneLayout>
      </ResizablePaneLayout>

      {pickerState && pickerCopy && (
        <ProjectAssetPickerModal
          title={pickerCopy.title}
          description={pickerCopy.description}
          options={pickerOptions}
          isLoading={isPickerLoading}
          errorMessage={pickerErrorMessage}
          emptyMessage={pickerCopy.emptyMessage}
          noneLabel={
            pickerState.mode === 'tilemap'
              ? 'No Tilemap'
              : pickerState.mode === 'window'
                ? 'No Window'
                : null
          }
          isBusy={isPickerBusy}
          onRefresh={() => {
            void refreshPickerOptions(pickerState)
          }}
          onClose={closePicker}
          onSelectNone={
            pickerState.mode === 'tilemap'
              ? () => {
                  editor.setTilemapPath(null)
                  closePicker()
                  focusWorkspace()
                }
              : pickerState.mode === 'window'
                ? () => {
                    editor.setWindowPath(null)
                    closePicker()
                    focusWorkspace()
                  }
                : null
          }
          onSelect={(option) => {
            void handleSelectAsset(option)
          }}
        />
      )}

      {pendingActorSaveChoice && (
        <div className="editor-modal-backdrop">
          <div className="editor-modal" role="dialog" aria-modal="true">
            <h2>Save &quot;{pendingActorSaveChoice.actorName}&quot;?</h2>
            <p className="editor-modal-copy">
              This actor came from &quot;{pendingActorSaveChoice.existingResourcePath}&quot;. You
              can overwrite that actor resource or save a new one in /
              {resourceManagerCurrentPath || ''}.
            </p>

            <div className="editor-modal-actions">
              <button
                type="button"
                onClick={() => setPendingActorSaveChoice(null)}
                disabled={isActorSaveBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSaveActorResource(pendingActorSaveChoice.nodeId, 'new')
                }}
                disabled={isActorSaveBusy}
              >
                Save New
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSaveActorResource(pendingActorSaveChoice.nodeId, 'overwrite')
                }}
                disabled={isActorSaveBusy}
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
