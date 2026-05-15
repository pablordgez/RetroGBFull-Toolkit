import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ActorAssetDocument,
  SceneAssetDocument,
  TilemapAssetDocument
} from '../../../../shared/projectAssets'
import type { SceneSpritePalettes } from '../../../../shared/projectPalettes'
import type { ProjectTagEntry } from '../../../../shared/projectTags'
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

const EMPTY_SCENE_SPRITE_PALETTES: SceneSpritePalettes = [null, null]

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
  const [projectTags, setProjectTags] = useState<ProjectTagEntry[]>([])
  const [maxTagSlots, setMaxTagSlots] = useState(5)
  const {
    tilemapDocument,
    tilemapTilesetDocument,
    windowDocument,
    windowTilesetDocument,
    spritePreviews,
    defaultSpritePalettes,
    defaultBackgroundPalette,
    spritePaletteMismatchPaths,
    backgroundPaletteMismatchPaths,
    loadError
  } = useSceneAssetReferences(projectPath, editor)
  const activeSpritePalettes = editor.spritePalettes ?? EMPTY_SCENE_SPRITE_PALETTES
  const referencedSpritePalettes = defaultSpritePalettes ?? EMPTY_SCENE_SPRITE_PALETTES

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

  const applyProjectTags = useCallback((nextTags: ProjectTagEntry[]): void => {
    setProjectTags((currentTags) => {
      const tagsChanged =
        currentTags.length !== nextTags.length ||
        nextTags.some((tag, index) => {
          const currentTag = currentTags[index]
          return !currentTag || currentTag.id !== tag.id || currentTag.name !== tag.name
        })

      return tagsChanged ? nextTags : currentTags
    })
  }, [])

  useEffect(() => {
    let isCancelled = false

    const loadTags = async (): Promise<void> => {
      if (!projectPath) {
        setProjectTags([])
        setMaxTagSlots(5)
        return
      }

      try {
        const [tagState, tagSlots] = await Promise.all([
          window.api.loadProjectTags(projectPath),
          window.api.readMaxTagSlots(projectPath)
        ])

        if (isCancelled) {
          return
        }

        applyProjectTags(tagState.entries)
        setMaxTagSlots((currentTagSlots) => (currentTagSlots === tagSlots ? currentTagSlots : tagSlots))
      } catch (error) {
        console.error('[scene-editor] load tags failed', error)
      }
    }

    void loadTags()

    return () => {
      isCancelled = true
    }
  }, [applyProjectTags, projectPath])

  useEffect(() => {
    if (!projectPath) {
      return
    }

    return window.api.onProjectTagsSaved((payload) => {
      if (payload.projectPath !== projectPath) {
        return
      }

      void window.api.loadProjectTags(projectPath).then((tagState) => {
        applyProjectTags(tagState.entries)
      })
    })
  }, [applyProjectTags, projectPath])

  useEffect(() => {
    clampActorsToMap(tilemapSize)
  }, [clampActorsToMap, tilemapSize])

  useEffect(() => {
    if (!activeSpritePalettes[0] && referencedSpritePalettes[0]) {
      editor.setSpritePalette(0, referencedSpritePalettes[0])
    }

    if (!activeSpritePalettes[1] && referencedSpritePalettes[1]) {
      editor.setSpritePalette(1, referencedSpritePalettes[1])
    }
  }, [activeSpritePalettes, editor, referencedSpritePalettes])

  useEffect(() => {
    if (!editor.backgroundPalette && defaultBackgroundPalette) {
      editor.setBackgroundPalette(defaultBackgroundPalette)
    }
  }, [defaultBackgroundPalette, editor])

  const drawSceneTilemap = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (!tilemapDocument || !tilemapTilesetDocument) {
        return
      }

      drawTilemapToCanvas(
        canvas,
        tilemapDocument,
        tilemapTilesetDocument,
        editor.backgroundPalette ?? tilemapTilesetDocument.palette
      )
    },
    [editor.backgroundPalette, tilemapDocument, tilemapTilesetDocument]
  )

  const drawSceneWindow = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (!windowDocument || !windowTilesetDocument) {
        return
      }

      drawWindowToCanvas(
        canvas,
        windowDocument,
        windowTilesetDocument,
        editor.backgroundPalette ?? windowTilesetDocument.palette
      )
    },
    [editor.backgroundPalette, windowDocument, windowTilesetDocument]
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
              spritePreviews={spritePreviews}
              sceneLabel={sceneLabel}
              sceneScriptOptions={sceneScriptOptions}
              actorScriptOptions={actorScriptOptions}
              sceneScriptPropertyDefinitions={sceneScriptPropertyDefinitions}
              actorScriptPropertyDefinitions={actorScriptPropertyDefinitions}
              collisionCallbackCandidates={collisionCallbackCandidates}
              isCollisionCallbackPickerLoading={isCollisionCallbackPickerLoading}
              collisionCallbackPickerErrorMessage={collisionCallbackPickerErrorMessage}
              maxCollisionCallbacks={maxCollisionCallbacks}
              maxTagSlots={maxTagSlots}
              projectTags={projectTags}
              defaultSpritePalettes={referencedSpritePalettes}
              defaultBackgroundPalette={defaultBackgroundPalette}
              spritePaletteMismatchPaths={spritePaletteMismatchPaths}
              backgroundPaletteMismatchPaths={backgroundPaletteMismatchPaths}
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
              Overwrite &quot;{pendingActorSaveChoice.existingResourcePath}&quot; or save a new actor in /
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
