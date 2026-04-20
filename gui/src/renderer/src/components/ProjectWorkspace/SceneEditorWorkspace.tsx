import { type ReactElement, useCallback, useEffect, useMemo, useRef } from 'react'
import type {
  ActorAssetDocument,
  SceneAssetDocument,
  TilemapAssetDocument
} from '../../../../shared/projectAssets'
import { ProjectAssetPickerModal } from '../ProjectAssets/ProjectAssetPickerModal'
import { ProjectScriptPickerModal } from '../ProjectAssets/ProjectScriptPickerModal'
import type { ProjectAssetDragPayload } from '../ProjectAssets/projectAssetDrag'
import { useUndoRedoShortcuts } from '../hooks/history/useUndoRedoShortcuts'
import { ResizablePaneLayout } from '../Layout/ResizablePaneLayout'
import { SceneHierarchyPane } from '../SceneHierarchy/SceneHierarchyPane'
import { SceneInspectorPane } from '../SceneHierarchy/SceneInspectorPane'
import { SceneViewport } from '../SceneHierarchy/SceneViewport'
import { drawTilemapToCanvas, drawWindowToCanvas } from '../SceneHierarchy/sceneRenderUtils'
import { useSceneAssetReferences } from '../SceneHierarchy/useSceneAssetReferences'
import { useSceneDocumentEditor } from '../SceneHierarchy/useSceneDocumentEditor'
import { useSceneWorkspacePickers } from './useSceneWorkspacePickers'
import { useSceneWorkspaceScriptData } from './useSceneWorkspaceScriptData'
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

  const focusWorkspace = useCallback(() => {
    workspaceRef.current?.focus()
  }, [])

  const {
    pickerState,
    pickerOptions,
    isPickerLoading,
    pickerErrorMessage,
    isPickerBusy,
    openPicker,
    closePicker,
    refreshPickerOptions,
    handleSelectAsset,
    scriptPickerState,
    scriptPickerOptions,
    isScriptPickerLoading,
    scriptPickerErrorMessage,
    isScriptPickerBusy,
    openScriptPicker,
    closeScriptPicker,
    refreshScriptPickerOptions,
    handleSelectScript,
    pendingActorSaveChoice,
    setPendingActorSaveChoice,
    isActorSaveBusy,
    handleSaveActorResource,
    handleRequestActorResourceSave,
    pickerCopy,
    scriptPickerCopy
  } = useSceneWorkspacePickers({
    editor,
    focusWorkspace,
    onResourcesChanged,
    onStatus,
    projectPath,
    resourceManagerCurrentPath
  })
  const {
    sceneScriptOptions,
    actorScriptOptions,
    collisionCallbackCandidates,
    isCollisionCallbackPickerLoading,
    collisionCallbackPickerErrorMessage,
    maxCollisionCallbacks,
    refreshSceneScriptData,
    sceneScriptPropertyDefinitions,
    actorScriptPropertyDefinitions
  } = useSceneWorkspaceScriptData({
    editor,
    onStatus,
    projectPath,
    scene
  })

  useUndoRedoShortcuts(
    () => editor.undo(),
    () => editor.redo(),
    {
      enabled: editor.canEdit && pickerState === null && scriptPickerState === null,
      containerRef: workspaceRef,
      ignoreEditableTargets: true
    }
  )

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
              className="project-workspace__editor-pane project-workspace__editor-pane--inspector"
              editor={editor}
              tilemapSize={tilemapSize}
              sceneLabel={sceneLabel}
              sceneScriptOptions={sceneScriptOptions}
              actorScriptOptions={actorScriptOptions}
              sceneScriptPropertyDefinitions={sceneScriptPropertyDefinitions}
              actorScriptPropertyDefinitions={actorScriptPropertyDefinitions}
              collisionCallbackCandidates={collisionCallbackCandidates}
              isCollisionCallbackPickerLoading={isCollisionCallbackPickerLoading}
              collisionCallbackPickerErrorMessage={collisionCallbackPickerErrorMessage}
              maxCollisionCallbacks={maxCollisionCallbacks}
              onRequestTilemapSelection={() => {
                openPicker({ mode: 'tilemap' })
              }}
              onRequestWindowSelection={() => {
                openPicker({ mode: 'window' })
              }}
              onRequestSceneScriptSelection={() => {
                openScriptPicker({ mode: 'scene-script' })
              }}
              onRequestActorScriptSelection={(nodeId) => {
                openScriptPicker({ mode: 'actor-script', nodeId })
              }}
              onRequestSpriteSelection={(nodeId) => {
                openPicker({ mode: 'sprite', nodeId })
              }}
              onRequestSceneAnimationPropertySelection={(propertyName) => {
                openPicker({ mode: 'scene-animation-property', propertyName })
              }}
              onRequestActorAnimationPropertySelection={(nodeId, propertyName) => {
                openPicker({ mode: 'actor-animation-property', nodeId, propertyName })
              }}
              onSetSceneScriptProperty={(propertyName, propertyValue) => {
                editor.setSceneScriptProperty(propertyName, propertyValue)
              }}
              onSetActorScriptProperty={(nodeId, propertyName, propertyValue) => {
                editor.setActorScriptProperty(nodeId, propertyName, propertyValue)
              }}
              onRefreshCollisionCallbackCandidates={() => {
                void refreshSceneScriptData()
              }}
              onSetCollisionCallbacks={(nodeId, callbacks) => {
                editor.setCollisionCallbacks(nodeId, callbacks)
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
                : pickerState.mode === 'scene-animation-property' ||
                    pickerState.mode === 'actor-animation-property'
                  ? 'No Animation'
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
                : pickerState.mode === 'scene-animation-property'
                  ? () => {
                      editor.setSceneScriptProperty(pickerState.propertyName, null)
                      closePicker()
                      focusWorkspace()
                    }
                  : pickerState.mode === 'actor-animation-property'
                    ? () => {
                        editor.setActorScriptProperty(
                          pickerState.nodeId,
                          pickerState.propertyName,
                          null
                        )
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

      {scriptPickerState && scriptPickerCopy && (
        <ProjectScriptPickerModal
          title={scriptPickerCopy.title}
          description={scriptPickerCopy.description}
          options={scriptPickerOptions}
          isLoading={isScriptPickerLoading}
          errorMessage={scriptPickerErrorMessage}
          emptyMessage={scriptPickerCopy.emptyMessage}
          noneLabel={scriptPickerCopy.noneLabel}
          isBusy={isScriptPickerBusy}
          onRefresh={() => {
            void refreshScriptPickerOptions(scriptPickerState)
          }}
          onClose={closeScriptPicker}
          onSelectNone={() => {
            void handleSelectScript(null)
          }}
          onSelect={(option) => {
            void handleSelectScript(option)
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
