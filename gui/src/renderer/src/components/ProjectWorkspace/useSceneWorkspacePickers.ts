import { useCallback, useMemo, useState } from 'react'
import type {
  ActorAssetDocument,
  ProjectAssetKind,
  SpriteAssetDocument,
  TilemapAssetDocument
} from '../../../../shared/projectAssets'
import { areProjectPalettesEqual } from '../../../../shared/projectPalettes'
import { clearFollowCameraInSceneNodeSubtree } from '../SceneHierarchy/sceneHierarchyModel'
import type { SceneDocumentEditor } from '../SceneHierarchy/useSceneDocumentEditor'
import {
  listProjectAssetsByKind,
  type ProjectAssetOption
} from '../ProjectAssets/projectAssetBrowser'
import {
  listProjectScriptsByKind,
  type ProjectScriptOption
} from '../ProjectAssets/projectScriptBrowser'

export type SceneAssetPickerState =
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
  | {
      mode: 'scene-animation-property'
      propertyName: string
    }
  | {
      mode: 'actor-animation-property'
      nodeId: string
      propertyName: string
    }

export type SceneScriptPickerState =
  | {
      mode: 'scene-script'
    }
  | {
      mode: 'actor-script'
      nodeId: string
    }

interface PendingActorSaveChoice {
  nodeId: string
  actorName: string
  existingResourcePath: string
}

interface PickerCopy {
  title: string
  description: string
  emptyMessage: string
}

interface ScriptPickerCopy extends PickerCopy {
  noneLabel: string
}

interface UseSceneWorkspacePickersOptions {
  editor: SceneDocumentEditor
  focusWorkspace: () => void
  onResourcesChanged: () => void
  onStatus: (tone: 'info' | 'error', text: string) => void
  projectPath: string
  resourceManagerCurrentPath: string
}

interface UseSceneWorkspacePickersResult {
  pickerState: SceneAssetPickerState | null
  pickerOptions: ProjectAssetOption[]
  isPickerLoading: boolean
  pickerErrorMessage: string | null
  isPickerBusy: boolean
  openPicker: (nextPickerState: SceneAssetPickerState) => void
  closePicker: () => void
  refreshPickerOptions: (nextPickerState: SceneAssetPickerState) => Promise<void>
  handleSelectAsset: (option: ProjectAssetOption) => Promise<void>
  scriptPickerState: SceneScriptPickerState | null
  scriptPickerOptions: ProjectScriptOption[]
  isScriptPickerLoading: boolean
  scriptPickerErrorMessage: string | null
  isScriptPickerBusy: boolean
  openScriptPicker: (nextScriptPickerState: SceneScriptPickerState) => void
  closeScriptPicker: () => void
  refreshScriptPickerOptions: (nextScriptPickerState: SceneScriptPickerState) => Promise<void>
  handleSelectScript: (option: ProjectScriptOption | null) => Promise<void>
  pendingActorSaveChoice: PendingActorSaveChoice | null
  setPendingActorSaveChoice: (choice: PendingActorSaveChoice | null) => void
  isActorSaveBusy: boolean
  handleSaveActorResource: (nodeId: string, saveMode?: 'new' | 'overwrite') => Promise<void>
  handleRequestActorResourceSave: (nodeId: string) => void
  pickerCopy: PickerCopy | null
  scriptPickerCopy: ScriptPickerCopy | null
}

const stripActorResourcePaths = (node: ActorAssetDocument['root']): ActorAssetDocument['root'] => {
  return {
    ...node,
    resourcePath: undefined,
    children: node.children.map((childNode) =>
      childNode.type === 'actor' ? stripActorResourcePaths(childNode) : childNode
    )
  }
}

const getPickerAssetKinds = (pickerState: SceneAssetPickerState): ProjectAssetKind[] => {
  switch (pickerState.mode) {
    case 'tilemap':
      return ['tilemap']
    case 'window':
      return ['window']
    case 'actor':
      return ['actor']
    default:
      return ['sprite']
  }
}

const buildPickerCopy = (pickerState: SceneAssetPickerState | null): PickerCopy | null => {
  if (!pickerState) {
    return null
  }

  switch (pickerState.mode) {
    case 'tilemap':
      return {
        title: 'Load Tilemap',
        description: 'Choose which tracked tilemap should define this scene.',
        emptyMessage: 'No tilemaps were found in this project yet.'
      }
    case 'window':
      return {
        title: 'Load Window',
        description: 'Choose which tracked window should render on top of this scene.',
        emptyMessage: 'No windows were found in this project yet.'
      }
    case 'actor':
      return {
        title: 'Load Actor',
        description: 'Choose an actor resource to insert into the scene hierarchy.',
        emptyMessage: 'No actor resources were found in this project yet.'
      }
    case 'scene-animation-property':
    case 'actor-animation-property':
      return {
        title: 'Select Animation',
        description: `Choose which sprite should populate "${pickerState.propertyName}".`,
        emptyMessage: 'No sprites were found in this project yet.'
      }
    default:
      return {
        title: 'Select Sprite',
        description: 'Choose which sprite the selected actor should render in the scene.',
        emptyMessage: 'No sprites were found in this project yet.'
      }
  }
}

const buildScriptPickerCopy = (
  scriptPickerState: SceneScriptPickerState | null
): ScriptPickerCopy | null => {
  if (!scriptPickerState) {
    return null
  }

  if (scriptPickerState.mode === 'scene-script') {
    return {
      title: 'Select Scene Script',
      description: 'Choose which scene script should run for this scene.',
      emptyMessage: 'No scene scripts were found in this project yet.',
      noneLabel: 'No Scene Script'
    }
  }

  return {
    title: 'Select Actor Script',
    description: 'Choose which actor script should run for the selected actor.',
    emptyMessage: 'No actor scripts were found in this project yet.',
    noneLabel: 'No Actor Script'
  }
}

const getDefaultSpritePaletteIndex = (
  spriteDocument: SpriteAssetDocument,
  editor: SceneDocumentEditor
): 0 | 1 => {
  if (areProjectPalettesEqual(spriteDocument.palette, editor.spritePalettes[1])) {
    return 1
  }

  if (
    editor.spritePalettes[0] &&
    !editor.spritePalettes[1] &&
    !areProjectPalettesEqual(spriteDocument.palette, editor.spritePalettes[0])
  ) {
    return 1
  }

  return 0
}

export const useSceneWorkspacePickers = ({
  editor,
  focusWorkspace,
  onResourcesChanged,
  onStatus,
  projectPath,
  resourceManagerCurrentPath
}: UseSceneWorkspacePickersOptions): UseSceneWorkspacePickersResult => {
  const [pickerState, setPickerState] = useState<SceneAssetPickerState | null>(null)
  const [pickerOptions, setPickerOptions] = useState<ProjectAssetOption[]>([])
  const [isPickerLoading, setIsPickerLoading] = useState(false)
  const [pickerErrorMessage, setPickerErrorMessage] = useState<string | null>(null)
  const [isPickerBusy, setIsPickerBusy] = useState(false)
  const [scriptPickerState, setScriptPickerState] = useState<SceneScriptPickerState | null>(null)
  const [scriptPickerOptions, setScriptPickerOptions] = useState<ProjectScriptOption[]>([])
  const [isScriptPickerLoading, setIsScriptPickerLoading] = useState(false)
  const [scriptPickerErrorMessage, setScriptPickerErrorMessage] = useState<string | null>(null)
  const [isScriptPickerBusy, setIsScriptPickerBusy] = useState(false)
  const [pendingActorSaveChoice, setPendingActorSaveChoice] =
    useState<PendingActorSaveChoice | null>(null)
  const [isActorSaveBusy, setIsActorSaveBusy] = useState(false)

  const refreshPickerOptions = useCallback(
    async (nextPickerState: SceneAssetPickerState) => {
      setIsPickerLoading(true)
      setPickerErrorMessage(null)

      try {
        const nextOptions = await listProjectAssetsByKind(
          projectPath,
          getPickerAssetKinds(nextPickerState)
        )
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
      setScriptPickerState(null)
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

  const refreshScriptPickerOptions = useCallback(
    async (nextScriptPickerState: SceneScriptPickerState) => {
      setIsScriptPickerLoading(true)
      setScriptPickerErrorMessage(null)

      try {
        const nextOptions = await listProjectScriptsByKind(projectPath, [
          nextScriptPickerState.mode === 'scene-script' ? 'scene' : 'actor'
        ])
        setScriptPickerOptions(nextOptions)
      } catch (error) {
        console.error('[scene-editor] load script picker options failed', error)
        setScriptPickerErrorMessage(
          error instanceof Error
            ? error.message
            : 'Something went wrong while loading project scripts.'
        )
      } finally {
        setIsScriptPickerLoading(false)
      }
    },
    [projectPath]
  )

  const openScriptPicker = useCallback(
    (nextScriptPickerState: SceneScriptPickerState) => {
      setPickerState(null)
      setScriptPickerState(nextScriptPickerState)
      void refreshScriptPickerOptions(nextScriptPickerState)
    },
    [refreshScriptPickerOptions]
  )

  const closeScriptPicker = useCallback(() => {
    setScriptPickerState(null)
    setScriptPickerOptions([])
    setScriptPickerErrorMessage(null)
    setIsScriptPickerBusy(false)
  }, [])

  const handleSelectScript = useCallback(
    async (option: ProjectScriptOption | null) => {
      if (!scriptPickerState) {
        return
      }

      setIsScriptPickerBusy(true)

      try {
        if (scriptPickerState.mode === 'scene-script') {
          editor.setSceneScriptPath(option?.path ?? null)
        } else {
          editor.updateActor(scriptPickerState.nodeId, { scriptPath: option?.path ?? null })
        }

        closeScriptPicker()
        focusWorkspace()
      } catch (error) {
        console.error('[scene-editor] apply script picker selection failed', error)
        setScriptPickerErrorMessage(
          error instanceof Error
            ? error.message
            : 'Something went wrong while selecting the script.'
        )
      } finally {
        setIsScriptPickerBusy(false)
      }
    },
    [closeScriptPicker, editor, focusWorkspace, scriptPickerState]
  )

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
          const spritePayload = await window.api.loadProjectAssetFile(projectPath, option.path)

          if (spritePayload.assetKind !== 'sprite') {
            throw new Error('The selected asset is not a sprite.')
          }

          editor.updateActor(pickerState.nodeId, {
            spritePath: option.path,
            spritePaletteIndex: getDefaultSpritePaletteIndex(
              spritePayload.document as SpriteAssetDocument,
              editor
            )
          })
          closePicker()
          focusWorkspace()
          return
        }

        if (pickerState.mode === 'scene-animation-property') {
          editor.setSceneScriptProperty(pickerState.propertyName, option.path)
          closePicker()
          focusWorkspace()
          return
        }

        if (pickerState.mode === 'actor-animation-property') {
          editor.setActorScriptProperty(pickerState.nodeId, pickerState.propertyName, option.path)
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

  const pickerCopy = useMemo(() => buildPickerCopy(pickerState), [pickerState])
  const scriptPickerCopy = useMemo(
    () => buildScriptPickerCopy(scriptPickerState),
    [scriptPickerState]
  )

  return {
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
  }
}
