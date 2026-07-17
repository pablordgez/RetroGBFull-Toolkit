import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react'
import {
  SCENE_ACTOR_PHYSICS_MODES,
  SCENE_CAMERA_DEADZONE_LIMITS,
  getProjectAssetDisplayName,
  isSceneActorPhysicsMode,
  normalizeSceneCameraDeadzone,
  normalizeSceneCameraDeadzoneValue,
  type SceneActorPhysicsMode,
  type SceneAssetActorNode,
  type SceneAssetCollisionCallback,
  type SceneAssetNode
} from '../../../../shared/projectAssets'
import type {
  ParsedScriptPropertyDefinition,
  ProjectScriptCallbackCandidate
} from '../../../../shared/projectCodeWorkspace'
import {
  getStoredScriptPropertyValue,
  validateScriptPropertyDraft,
  type ScriptPropertyMap,
  type ScriptPropertyValue
} from '../../../../shared/projectScriptProperties'
import type { ProjectScriptOption } from '../ProjectAssets/projectScriptBrowser'
import type { ProjectTagEntry } from '../../../../shared/projectTags'
import {
  DEFAULT_GB_PALETTE,
  type SceneSpritePalettes,
  normalizeProjectPalette
} from '../../../../shared/projectPalettes'
import { ProjectScriptCallbackPickerModal } from '../ProjectAssets/ProjectScriptCallbackPickerModal'
import {
  DEFAULT_COORDINATE_MODEL_PREFERENCES,
  type CoordinateModelPreferences
} from '../Preferences/coordinatePreferences'
import { SceneCollisionCallbackControls } from './SceneCollisionCallbackControls'
import {
  clampSceneActorPosition,
  clampSceneCollisionRect,
  findSceneNodeById,
  findSceneNodeRecord,
  formatSceneCoord,
  getSceneActorAnchorOffsetForSize,
  isSceneActorNode,
  isSceneCollisionNode,
  parseSceneCoord
} from './sceneHierarchyModel'
import type { SceneDocumentEditor } from './useSceneDocumentEditor'
import './SceneInspectorPane.css'

interface SceneInspectorPaneProps {
  className?: string
  editor: SceneDocumentEditor
  sceneLabel?: string | null
  tilemapSize: { width: number; height: number } | null
  spritePreviews?: Record<string, { width: number; height: number }>
  sceneScriptOptions?: ProjectScriptOption[]
  actorScriptOptions?: ProjectScriptOption[]
  sceneScriptPropertyDefinitions?: ParsedScriptPropertyDefinition[]
  actorScriptPropertyDefinitions?: ParsedScriptPropertyDefinition[]
  collisionCallbackCandidates?: ProjectScriptCallbackCandidate[]
  isCollisionCallbackPickerLoading?: boolean
  collisionCallbackPickerErrorMessage?: string | null
  maxCollisionCallbacks?: number
  maxTagSlots?: number
  projectTags?: ProjectTagEntry[]
  defaultSpritePalettes?: SceneSpritePalettes
  defaultBackgroundPalette?: string[] | null
  spritePaletteMismatchPaths?: string[]
  backgroundPaletteMismatchPaths?: string[]
  coordinatePreferences?: CoordinateModelPreferences
  onRequestTilemapSelection?: () => void
  onRequestWindowSelection?: () => void
  onRequestSceneScriptSelection?: () => void
  onRequestActorScriptSelection?: (nodeId: string) => void
  onRequestSpriteSelection: (nodeId: string) => void
  onRequestSceneAnimationPropertySelection?: (propertyName: string) => void
  onRequestActorAnimationPropertySelection?: (nodeId: string, propertyName: string) => void
  onSetSceneScriptProperty?: (propertyName: string, propertyValue: ScriptPropertyValue) => void
  onSetActorScriptProperty?: (
    nodeId: string,
    propertyName: string,
    propertyValue: ScriptPropertyValue
  ) => void
  onRefreshCollisionCallbackCandidates?: () => void
  onSetCollisionCallbacks?: (nodeId: string, callbacks: SceneAssetCollisionCallback[]) => void
  onSetCollisionExitCallbacks?: (nodeId: string, callbacks: SceneAssetCollisionCallback[]) => void
}

const buildClassName = (baseClassName: string, extraClassName?: string): string => {
  return extraClassName ? `${baseClassName} ${extraClassName}` : baseClassName
}

const EMPTY_SCRIPT_PROPERTY_DEFINITIONS: ParsedScriptPropertyDefinition[] = []

const getPathLabel = (resourcePath: string | null, fallback: string): string => {
  return resourcePath
    ? getProjectAssetDisplayName(resourcePath.split('/').pop() ?? fallback)
    : fallback
}

const getScriptPropertyInputId = (propertyName: string): string => {
  return `scene-inspector-script-property-${propertyName}`
}

const SCENE_ACTOR_PHYSICS_MODE_LABELS: Record<SceneActorPhysicsMode, string> = {
  highPerf: 'High Performance',
  balanced: 'Balanced',
  highFidelity: 'High Fidelity'
}

const EMPTY_SCENE_SPRITE_PALETTES: SceneSpritePalettes = [null, null]

const getDirectParentActor = (
  nodes: SceneAssetNode[],
  nodeId: string
): SceneAssetActorNode | null => {
  const nodeRecord = findSceneNodeRecord(nodes, nodeId)
  const parentNode = nodeRecord?.parentId ? findSceneNodeById(nodes, nodeRecord.parentId) : null

  return parentNode && isSceneActorNode(parentNode) ? parentNode : null
}

const getActorDisplayCoordinate = (
  storedCoordinate: number,
  parentCoordinate: number | null,
  preferences: CoordinateModelPreferences
): number => {
  if (preferences.childCoordinateOrigin === 'relative' && parentCoordinate !== null) {
    return storedCoordinate - parentCoordinate
  }

  return storedCoordinate
}

const getActorStoredCoordinate = (
  displayedCoordinate: number,
  parentCoordinate: number | null,
  preferences: CoordinateModelPreferences
): number => {
  if (preferences.childCoordinateOrigin === 'relative' && parentCoordinate !== null) {
    return displayedCoordinate + parentCoordinate
  }

  return displayedCoordinate
}

const getCollisionDisplayCoordinate = (
  storedCoordinate: number,
  parentCoordinate: number | null,
  preferences: CoordinateModelPreferences
): number => {
  if (preferences.childCoordinateOrigin === 'absolute' && parentCoordinate !== null) {
    return storedCoordinate + parentCoordinate
  }

  return storedCoordinate
}

const getCollisionAbsoluteCoordinate = (
  displayedCoordinate: number,
  parentCoordinate: number | null,
  preferences: CoordinateModelPreferences
): number => {
  if (preferences.childCoordinateOrigin === 'relative' && parentCoordinate !== null) {
    return displayedCoordinate + parentCoordinate
  }

  return displayedCoordinate
}

const formatPaletteMismatchCopy = (paths: string[], singular: string, plural: string): string => {
  if (paths.length === 0) {
    return ''
  }

  const labels = paths
    .slice(0, 3)
    .map((path) => getPathLabel(path, path))
    .join(', ')
  const remainingCount = paths.length - 3
  const suffix = remainingCount > 0 ? `, +${remainingCount} more` : ''

  return `${paths.length === 1 ? singular : plural}: ${labels}${suffix}.`
}

export const SceneInspectorPane = ({
  className,
  editor,
  sceneLabel,
  tilemapSize,
  spritePreviews,
  sceneScriptOptions = [],
  actorScriptOptions = [],
  sceneScriptPropertyDefinitions = [],
  actorScriptPropertyDefinitions = [],
  collisionCallbackCandidates = [],
  isCollisionCallbackPickerLoading = false,
  collisionCallbackPickerErrorMessage = null,
  maxCollisionCallbacks = 0,
  maxTagSlots = 5,
  projectTags = [],
  defaultSpritePalettes = [null, null],
  defaultBackgroundPalette = null,
  spritePaletteMismatchPaths = [],
  backgroundPaletteMismatchPaths = [],
  coordinatePreferences = DEFAULT_COORDINATE_MODEL_PREFERENCES,
  onRequestTilemapSelection = () => undefined,
  onRequestWindowSelection = () => undefined,
  onRequestSceneScriptSelection = () => undefined,
  onRequestActorScriptSelection = () => undefined,
  onRequestSpriteSelection,
  onRequestSceneAnimationPropertySelection = () => undefined,
  onRequestActorAnimationPropertySelection = () => undefined,
  onSetSceneScriptProperty = () => undefined,
  onSetActorScriptProperty = () => undefined,
  onRefreshCollisionCallbackCandidates = () => undefined,
  onSetCollisionCallbacks = () => undefined,
  onSetCollisionExitCallbacks = () => undefined
}: SceneInspectorPaneProps): ReactElement => {
  const selectedNode = editor.selectedNode
  const selectedActor = editor.selectedActor
  const selectedCollision = editor.selectedCollision
  const selectedActorParentActor = selectedActor
    ? getDirectParentActor(editor.nodes, selectedActor.id)
    : null
  const collisionParentActor = selectedCollision
    ? getDirectParentActor(editor.nodes, selectedCollision.id)
    : null
  const [xDraft, setXDraft] = useState('0')
  const [yDraft, setYDraft] = useState('0')
  const [widthDraft, setWidthDraft] = useState('8')
  const [heightDraft, setHeightDraft] = useState('8')
  const [scriptPropertyDrafts, setScriptPropertyDrafts] = useState<Record<string, string>>({})
  const [scriptPropertyErrors, setScriptPropertyErrors] = useState<Record<string, string>>({})
  const [collisionCallbackPicker, setCollisionCallbackPicker] = useState<{
    nodeId: string
    mode: 'collision' | 'exit'
  } | null>(null)
  const collisionCallbackPickerMode =
    selectedCollision && collisionCallbackPicker?.nodeId === selectedCollision.id
      ? collisionCallbackPicker.mode
      : null
  const coordinateUnit = coordinatePreferences.coordinateUnit
  const childCoordinateOrigin = coordinatePreferences.childCoordinateOrigin
  const formatCoordinate = useCallback(
    (value: number): string => formatSceneCoord(value, coordinateUnit),
    [coordinateUnit]
  )
  const parseCoordinate = useCallback(
    (value: string): number | null => parseSceneCoord(value, coordinateUnit),
    [coordinateUnit]
  )
  const actorParentX = selectedActorParentActor?.x ?? null
  const actorParentY = selectedActorParentActor?.y ?? null
  const collisionParentX = collisionParentActor?.x ?? null
  const collisionParentY = collisionParentActor?.y ?? null

  useEffect(() => {
    if (selectedActor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setXDraft(
        formatCoordinate(
          getActorDisplayCoordinate(selectedActor.x, actorParentX, coordinatePreferences)
        )
      )
      setYDraft(
        formatCoordinate(
          getActorDisplayCoordinate(selectedActor.y, actorParentY, coordinatePreferences)
        )
      )
      return
    }

    if (selectedCollision) {
      setXDraft(
        formatCoordinate(
          getCollisionDisplayCoordinate(
            selectedCollision.x,
            collisionParentX,
            coordinatePreferences
          )
        )
      )
      setYDraft(
        formatCoordinate(
          getCollisionDisplayCoordinate(
            selectedCollision.y,
            collisionParentY,
            coordinatePreferences
          )
        )
      )
      setWidthDraft(formatCoordinate(selectedCollision.width))
      setHeightDraft(formatCoordinate(selectedCollision.height))
      return
    }

    setXDraft(formatCoordinate(0))
    setYDraft(formatCoordinate(0))
    setWidthDraft(formatCoordinate(128))
    setHeightDraft(formatCoordinate(128))
  }, [
    actorParentX,
    actorParentY,
    collisionParentX,
    collisionParentY,
    coordinatePreferences,
    formatCoordinate,
    selectedActor,
    selectedCollision
  ])

  const activeScriptPropertyDefinitions = useMemo(() => {
    if (!selectedNode) {
      return sceneScriptPropertyDefinitions
    }

    if (selectedActor) {
      return actorScriptPropertyDefinitions
    }

    return EMPTY_SCRIPT_PROPERTY_DEFINITIONS
  }, [actorScriptPropertyDefinitions, sceneScriptPropertyDefinitions, selectedActor, selectedNode])
  const activeScriptProperties: ScriptPropertyMap | undefined = useMemo(() => {
    if (!selectedNode) {
      return editor.sceneScriptProperties
    }

    return selectedActor?.scriptProperties
  }, [editor.sceneScriptProperties, selectedActor, selectedNode])

  useEffect(() => {
    const nextDrafts = Object.fromEntries(
      activeScriptPropertyDefinitions
        .filter((definition) => definition.kind === 'integer')
        .map((definition) => {
          const currentValue = getStoredScriptPropertyValue(definition, activeScriptProperties)
          return [definition.name, typeof currentValue === 'number' ? String(currentValue) : '']
        })
    )

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScriptPropertyDrafts(nextDrafts)
    setScriptPropertyErrors({})
  }, [activeScriptPropertyDefinitions, activeScriptProperties, selectedActor?.id, selectedNode?.id])

  const commitActorAxis = (axis: 'x' | 'y'): void => {
    if (!selectedActor) {
      return
    }

    const nextCoord = parseCoordinate(axis === 'x' ? xDraft : yDraft)

    if (nextCoord === null) {
      setXDraft(
        formatCoordinate(
          getActorDisplayCoordinate(selectedActor.x, actorParentX, coordinatePreferences)
        )
      )
      setYDraft(
        formatCoordinate(
          getActorDisplayCoordinate(selectedActor.y, actorParentY, coordinatePreferences)
        )
      )
      return
    }

    const currentDisplayX = getActorDisplayCoordinate(
      selectedActor.x,
      actorParentX,
      coordinatePreferences
    )
    const currentDisplayY = getActorDisplayCoordinate(
      selectedActor.y,
      actorParentY,
      coordinatePreferences
    )
    const nextPosition = clampSceneActorPosition(
      getActorStoredCoordinate(
        axis === 'x' ? nextCoord : currentDisplayX,
        actorParentX,
        coordinatePreferences
      ),
      getActorStoredCoordinate(
        axis === 'y' ? nextCoord : currentDisplayY,
        actorParentY,
        coordinatePreferences
      ),
      tilemapSize,
      getSceneActorAnchorOffsetForSize(
        selectedActor.spritePath && spritePreviews ? spritePreviews[selectedActor.spritePath] : null
      )
    )

    editor.updateActor(selectedActor.id, nextPosition)
  }

  const commitCollisionRect = (field: 'x' | 'y' | 'width' | 'height'): void => {
    if (!selectedCollision) {
      return
    }

    const currentDisplayX = getCollisionDisplayCoordinate(
      selectedCollision.x,
      collisionParentX,
      coordinatePreferences
    )
    const currentDisplayY = getCollisionDisplayCoordinate(
      selectedCollision.y,
      collisionParentY,
      coordinatePreferences
    )
    const nextX = parseCoordinate(field === 'x' ? xDraft : formatCoordinate(currentDisplayX))
    const nextY = parseCoordinate(field === 'y' ? yDraft : formatCoordinate(currentDisplayY))
    const nextWidth = parseCoordinate(
      field === 'width' ? widthDraft : formatCoordinate(selectedCollision.width)
    )
    const nextHeight = parseCoordinate(
      field === 'height' ? heightDraft : formatCoordinate(selectedCollision.height)
    )

    if (nextX === null || nextY === null || nextWidth === null || nextHeight === null) {
      setXDraft(formatCoordinate(currentDisplayX))
      setYDraft(formatCoordinate(currentDisplayY))
      setWidthDraft(formatCoordinate(selectedCollision.width))
      setHeightDraft(formatCoordinate(selectedCollision.height))
      return
    }

    const nextRect = clampSceneCollisionRect(
      getCollisionAbsoluteCoordinate(nextX, collisionParentX, coordinatePreferences),
      getCollisionAbsoluteCoordinate(nextY, collisionParentY, coordinatePreferences),
      nextWidth,
      nextHeight,
      tilemapSize
    )
    editor.updateCollision(selectedCollision.id, nextRect)
  }

  const handleActorAxisKeyDown = (
    axis: 'x' | 'y',
    event: KeyboardEvent<HTMLInputElement>
  ): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitActorAxis(axis)
    }

    if (event.key === 'Escape' && selectedActor) {
      event.preventDefault()
      setXDraft(
        formatCoordinate(
          getActorDisplayCoordinate(selectedActor.x, actorParentX, coordinatePreferences)
        )
      )
      setYDraft(
        formatCoordinate(
          getActorDisplayCoordinate(selectedActor.y, actorParentY, coordinatePreferences)
        )
      )
    }
  }

  const handleCollisionFieldKeyDown = (
    field: 'x' | 'y' | 'width' | 'height',
    event: KeyboardEvent<HTMLInputElement>
  ): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitCollisionRect(field)
    }

    if (event.key === 'Escape' && selectedCollision) {
      event.preventDefault()
      setXDraft(
        formatCoordinate(
          getCollisionDisplayCoordinate(
            selectedCollision.x,
            collisionParentX,
            coordinatePreferences
          )
        )
      )
      setYDraft(
        formatCoordinate(
          getCollisionDisplayCoordinate(
            selectedCollision.y,
            collisionParentY,
            coordinatePreferences
          )
        )
      )
      setWidthDraft(formatCoordinate(selectedCollision.width))
      setHeightDraft(formatCoordinate(selectedCollision.height))
    }
  }

  const selectedSpriteLabel = getPathLabel(selectedActor?.spritePath ?? null, 'No sprite selected')
  const selectedTilemapLabel = getPathLabel(editor.tilemapPath, 'No tilemap selected')
  const selectedWindowLabel = getPathLabel(editor.windowPath, 'No window selected')
  const selectedSceneScriptLabel = getPathLabel(editor.scriptPath, 'No scene script selected')
  const selectedActorScriptLabel = getPathLabel(
    selectedActor?.scriptPath ?? null,
    'No actor script selected'
  )
  const sceneSpritePalettes = editor.spritePalettes ?? EMPTY_SCENE_SPRITE_PALETTES
  const referencedSpritePalettes = defaultSpritePalettes ?? EMPTY_SCENE_SPRITE_PALETTES
  const selectedTaggableNode = selectedActor ?? selectedCollision
  const selectedTagIds = selectedTaggableNode?.tags ?? []

  const toggleTag = (tagId: string, isSelected: boolean): void => {
    if (!selectedTaggableNode) {
      return
    }

    const nextTags = isSelected
      ? [...selectedTagIds, tagId].slice(0, maxTagSlots)
      : selectedTagIds.filter((currentTagId) => currentTagId !== tagId)

    editor.setNodeTags(selectedTaggableNode.id, nextTags)
  }

  const updateSelectedActorCameraDeadzone = (
    edge: 'left' | 'right' | 'top' | 'bottom',
    value: number
  ): void => {
    if (!selectedActor) {
      return
    }

    editor.updateActor(selectedActor.id, {
      cameraDeadzone: {
        ...normalizeSceneCameraDeadzone(selectedActor.cameraDeadzone),
        [edge]: normalizeSceneCameraDeadzoneValue(value, SCENE_CAMERA_DEADZONE_LIMITS[edge])
      }
    })
  }

  const renderTagControls = (): ReactElement | null => {
    if (!selectedTaggableNode) {
      return null
    }

    return (
      <>
        <div className="scene-inspector-pane__field">
          <span>Tags</span>
          <strong>
            {selectedTagIds.length} / {maxTagSlots}
          </strong>
        </div>

        {projectTags.length === 0 && (
          <div className="scene-inspector-pane__hint">No project tags defined.</div>
        )}

        {projectTags.length > 0 && (
          <div className="scene-inspector-pane__tag-list">
            {projectTags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag.id)
              const isDisabled = !isSelected && selectedTagIds.length >= maxTagSlots

              return (
                <label key={tag.id} className="scene-inspector-pane__tag-option">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={(event) => toggleTag(tag.id, event.target.checked)}
                  />
                  <span>{tag.name}</span>
                </label>
              )
            })}
          </div>
        )}
      </>
    )
  }

  const renderScenePalette = (
    title: string,
    palette: string[] | null,
    mismatchCopy: string,
    defaultPalette: string[] | null,
    onChangePalette: (palette: string[]) => void,
    onUseDefaultPalette: (palette: string[]) => void,
    emptyLabel = 'Unset'
  ): ReactElement => {
    const editablePalette = normalizeProjectPalette(palette ?? defaultPalette ?? DEFAULT_GB_PALETTE)
    const reorderPalette = (sourceIndex: number, targetIndex: number): void => {
      if (sourceIndex === targetIndex) {
        return
      }

      const nextPalette = [...editablePalette]
      const [movedColor] = nextPalette.splice(sourceIndex, 1)
      nextPalette.splice(targetIndex, 0, movedColor)
      onChangePalette(nextPalette)
    }

    return (
      <div className="scene-inspector-pane__palette">
        <div className="scene-inspector-pane__field">
          <span>{title}</span>
          <strong>{palette ? 'Scene palette' : emptyLabel}</strong>
        </div>

        <div className="scene-inspector-pane__palette-row" aria-label={title}>
          {editablePalette.map((color, index) => (
            <div
              key={`${title}-${color}-${index}`}
              draggable
              className="scene-inspector-pane__palette-swatch"
              style={{ backgroundColor: color }}
              title={`Index ${index}: ${color}. Drag to reorder.`}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', String(index))
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => {
                event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                const sourceIndex = Number.parseInt(event.dataTransfer.getData('text/plain'), 10)

                if (Number.isInteger(sourceIndex)) {
                  reorderPalette(sourceIndex, index)
                }
              }}
            >
              <span className="scene-inspector-pane__palette-swatch-index">{index}</span>
            </div>
          ))}
        </div>

        {mismatchCopy && (
          <p className="scene-inspector-pane__warning" role="status">
            {mismatchCopy}
          </p>
        )}

        {defaultPalette && (
          <button
            type="button"
            onClick={() => {
              onUseDefaultPalette(defaultPalette)
            }}
          >
            Use Referenced Palette
          </button>
        )}
      </div>
    )
  }

  const commitScriptProperty = (definition: ParsedScriptPropertyDefinition): void => {
    if (definition.kind !== 'integer') {
      return
    }

    const draftValue = scriptPropertyDrafts[definition.name] ?? ''
    const validation = validateScriptPropertyDraft(definition, draftValue)

    if (validation.error) {
      setScriptPropertyErrors((currentErrors) => ({
        ...currentErrors,
        [definition.name]: validation.error
      }))
      return
    }

    setScriptPropertyErrors((currentErrors) => {
      const nextErrors = { ...currentErrors }
      delete nextErrors[definition.name]
      return nextErrors
    })

    if (!selectedNode) {
      onSetSceneScriptProperty(definition.name, validation.value)
      return
    }

    if (selectedActor) {
      onSetActorScriptProperty(selectedActor.id, definition.name, validation.value)
    }
  }

  const resetScriptPropertyDraft = (definition: ParsedScriptPropertyDefinition): void => {
    const currentValue = getStoredScriptPropertyValue(definition, activeScriptProperties)
    setScriptPropertyDrafts((currentDrafts) => ({
      ...currentDrafts,
      [definition.name]: typeof currentValue === 'number' ? String(currentValue) : ''
    }))
    setScriptPropertyErrors((currentErrors) => {
      const nextErrors = { ...currentErrors }
      delete nextErrors[definition.name]
      return nextErrors
    })
  }

  const renderScriptPropertyControl = (
    definition: ParsedScriptPropertyDefinition
  ): ReactElement => {
    if (definition.kind === 'boolean') {
      const currentValue = getStoredScriptPropertyValue(definition, activeScriptProperties) === true

      return (
        <div key={definition.name} className="scene-inspector-pane__property-row">
          <label
            className="scene-inspector-pane__property-label"
            htmlFor={getScriptPropertyInputId(definition.name)}
          >
            {definition.name}
          </label>
          <input
            id={getScriptPropertyInputId(definition.name)}
            type="checkbox"
            checked={currentValue}
            onChange={(event) => {
              if (!selectedNode) {
                onSetSceneScriptProperty(definition.name, event.target.checked)
                return
              }

              if (selectedActor) {
                onSetActorScriptProperty(selectedActor.id, definition.name, event.target.checked)
              }
            }}
          />
        </div>
      )
    }

    if (definition.kind === 'enum') {
      const currentValue = getStoredScriptPropertyValue(definition, activeScriptProperties)

      return (
        <div key={definition.name} className="scene-inspector-pane__property-row">
          <label
            className="scene-inspector-pane__property-label"
            htmlFor={getScriptPropertyInputId(definition.name)}
          >
            {definition.name}
            <small> ({definition.typeName})</small>
          </label>
          <select
            id={getScriptPropertyInputId(definition.name)}
            className="scene-inspector-pane__property-input"
            value={typeof currentValue === 'string' ? currentValue : ''}
            onChange={(event) => {
              const nextValue = event.target.value
              const validation = validateScriptPropertyDraft(
                definition,
                nextValue.length > 0 ? nextValue : null
              )

              if (validation.error) {
                setScriptPropertyErrors((currentErrors) => ({
                  ...currentErrors,
                  [definition.name]: validation.error
                }))
                return
              }

              setScriptPropertyErrors((currentErrors) => {
                const nextErrors = { ...currentErrors }
                delete nextErrors[definition.name]
                return nextErrors
              })

              if (!selectedNode) {
                onSetSceneScriptProperty(definition.name, validation.value)
                return
              }

              if (selectedActor) {
                onSetActorScriptProperty(selectedActor.id, definition.name, validation.value)
              }
            }}
          >
            <option value="">Use Default</option>
            {(definition.enumValues ?? []).map((enumValue) => (
              <option key={enumValue} value={enumValue}>
                {enumValue}
              </option>
            ))}
          </select>
        </div>
      )
    }

    if (definition.kind === 'animation') {
      const currentValue = getStoredScriptPropertyValue(definition, activeScriptProperties)
      const currentPath = typeof currentValue === 'string' ? currentValue : null

      return (
        <div key={definition.name} className="scene-inspector-pane__property-row">
          <span className="scene-inspector-pane__property-label">{definition.name}</span>
          <div className="scene-inspector-pane__property-actions">
            <strong className="scene-inspector-pane__property-value">
              {getPathLabel(currentPath, 'No animation selected')}
            </strong>
            <button
              type="button"
              onClick={() => {
                if (!selectedNode) {
                  onRequestSceneAnimationPropertySelection(definition.name)
                  return
                }

                if (selectedActor) {
                  onRequestActorAnimationPropertySelection(selectedActor.id, definition.name)
                }
              }}
            >
              {currentPath ? 'Change Animation' : 'Select Animation'}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div key={definition.name} className="scene-inspector-pane__property-stack">
        <div className="scene-inspector-pane__property-row">
          <label
            className="scene-inspector-pane__property-label"
            htmlFor={getScriptPropertyInputId(definition.name)}
          >
            {definition.name}
            <small> ({definition.typeName})</small>
          </label>
          <input
            id={getScriptPropertyInputId(definition.name)}
            className="scene-inspector-pane__property-input"
            type="text"
            value={scriptPropertyDrafts[definition.name] ?? ''}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const nextValue = event.target.value
              setScriptPropertyDrafts((currentDrafts) => ({
                ...currentDrafts,
                [definition.name]: nextValue
              }))

              const validation = validateScriptPropertyDraft(definition, nextValue)
              setScriptPropertyErrors((currentErrors) => {
                const nextErrors = { ...currentErrors }

                if (validation.error) {
                  nextErrors[definition.name] = validation.error
                } else {
                  delete nextErrors[definition.name]
                }

                return nextErrors
              })
            }}
            onBlur={() => {
              commitScriptProperty(definition)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitScriptProperty(definition)
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                resetScriptPropertyDraft(definition)
              }
            }}
          />
        </div>
        {scriptPropertyErrors[definition.name] && (
          <span className="scene-inspector-pane__hint">
            {scriptPropertyErrors[definition.name]}
          </span>
        )}
      </div>
    )
  }
  const availableCollisionCandidates = useMemo(() => {
    if (!selectedCollision) {
      return []
    }

    const assignedCallbacks =
      collisionCallbackPickerMode === 'exit'
        ? selectedCollision.exitCallbacks
        : selectedCollision.callbacks
    const assignedKeys = new Set(
      (assignedCallbacks ?? []).map(
        (callback) => `${callback.scriptPath}::${callback.functionName}`
      )
    )

    return collisionCallbackCandidates.filter((candidate) => {
      return !assignedKeys.has(`${candidate.scriptPath}::${candidate.functionName}`)
    })
  }, [collisionCallbackCandidates, collisionCallbackPickerMode, selectedCollision])

  const getSelectionTypeLabel = (node: SceneAssetNode | null): string => {
    if (!node) {
      return 'Scene'
    }

    if (isSceneActorNode(node)) {
      return 'Actor'
    }

    if (isSceneCollisionNode(node)) {
      return 'Collision'
    }

    return 'Folder'
  }

  const handleSelectCollisionCallback = (candidate: ProjectScriptCallbackCandidate): void => {
    if (!selectedCollision) {
      return
    }

    const nextCallback = {
      scriptPath: candidate.scriptPath,
      functionName: candidate.functionName
    }

    if (collisionCallbackPickerMode === 'exit') {
      onSetCollisionExitCallbacks(selectedCollision.id, [
        ...(selectedCollision.exitCallbacks ?? []),
        nextCallback
      ])
    } else {
      onSetCollisionCallbacks(selectedCollision.id, [
        ...(selectedCollision.callbacks ?? []),
        nextCallback
      ])
    }
    setCollisionCallbackPicker(null)
  }

  const showLegacyEmptyState =
    !selectedNode &&
    !sceneLabel &&
    sceneScriptOptions.length === 0 &&
    actorScriptOptions.length === 0 &&
    collisionCallbackCandidates.length === 0

  return (
    <div
      className={buildClassName('scene-inspector-pane', className)}
      data-testid="project-workspace-scene-inspector"
    >
      {!editor.canEdit && (
        <div className="scene-inspector-pane__empty">Open a scene to inspect it.</div>
      )}

      {editor.canEdit && showLegacyEmptyState && (
        <div className="scene-inspector-pane__empty">Select an actor or collision.</div>
      )}

      {editor.canEdit && !showLegacyEmptyState && (
        <>
          <div className="scene-inspector-pane__field">
            <span>Name</span>
            <strong>{selectedNode?.name ?? sceneLabel ?? 'Scene'}</strong>
          </div>

          <div className="scene-inspector-pane__field">
            <span>Type</span>
            <strong>{getSelectionTypeLabel(selectedNode)}</strong>
          </div>

          {!selectedNode && (
            <>
              <div className="scene-inspector-pane__field">
                <span>Tilemap</span>
                <strong>{selectedTilemapLabel}</strong>
              </div>

              <button type="button" onClick={onRequestTilemapSelection}>
                {editor.tilemapPath ? 'Change Tilemap' : 'Select Tilemap'}
              </button>

              <div className="scene-inspector-pane__field">
                <span>Window</span>
                <strong>{selectedWindowLabel}</strong>
              </div>

              <button type="button" onClick={onRequestWindowSelection}>
                {editor.windowPath ? 'Change Window' : 'Select Window'}
              </button>

              {renderScenePalette(
                'Sprite Palette 0',
                sceneSpritePalettes[0],
                formatPaletteMismatchCopy(
                  spritePaletteMismatchPaths,
                  'Sprite palette matches neither scene palette',
                  'Sprite palettes match neither scene palette'
                ),
                referencedSpritePalettes[0],
                (palette) => editor.setSpritePalette(0, palette),
                (palette) => editor.setSpritePalette(0, palette)
              )}

              {renderScenePalette(
                'Sprite Palette 1',
                sceneSpritePalettes[1],
                '',
                referencedSpritePalettes[1] ??
                  sceneSpritePalettes[0] ??
                  referencedSpritePalettes[0],
                (palette) => editor.setSpritePalette(1, palette),
                (palette) => editor.setSpritePalette(1, palette)
              )}

              {renderScenePalette(
                'Background/Window Palette',
                editor.backgroundPalette,
                formatPaletteMismatchCopy(
                  backgroundPaletteMismatchPaths,
                  'Background/window palette differs',
                  'Background/window palettes differ'
                ),
                defaultBackgroundPalette,
                editor.setBackgroundPalette,
                editor.setBackgroundPalette
              )}

              <div className="scene-inspector-pane__field">
                <span>Scene Script</span>
                <strong>{selectedSceneScriptLabel}</strong>
              </div>

              <button type="button" onClick={onRequestSceneScriptSelection}>
                {editor.scriptPath ? 'Change Scene Script' : 'Select Scene Script'}
              </button>

              <div className="scene-inspector-pane__field">
                <span>Scene Bounds</span>
                <strong>
                  {tilemapSize
                    ? `${tilemapSize.width * 8} x ${tilemapSize.height * 8}px`
                    : 'Unbounded'}
                </strong>
              </div>

              <label className="scene-inspector-pane__toggle">
                <input
                  type="checkbox"
                  checked={editor.collisionCallbacksAt30Hz}
                  onChange={(event) => {
                    editor.setCollisionCallbacksAt30Hz(event.target.checked)
                  }}
                />
                <span>Collision callbacks at 30 Hz</span>
              </label>
              <p className="scene-inspector-pane__hint">
                Runs opposite actors using 30 Hz drawing to stagger their workload.
              </p>

              {activeScriptPropertyDefinitions.length > 0 && (
                <>
                  <div className="scene-inspector-pane__section-title">Script Properties</div>
                  {activeScriptPropertyDefinitions.map(renderScriptPropertyControl)}
                </>
              )}
            </>
          )}

          {!selectedActor && !selectedCollision && selectedNode && (
            <div className="scene-inspector-pane__field">
              <span>Children</span>
              <strong>{selectedNode.children.length}</strong>
            </div>
          )}

          {selectedActor && (
            <>
              <div className="scene-inspector-pane__field">
                <span>Sprite</span>
                <strong>{selectedSpriteLabel}</strong>
              </div>

              <button
                type="button"
                onClick={() => {
                  onRequestSpriteSelection(selectedActor.id)
                }}
              >
                {selectedActor.spritePath ? 'Change Sprite' : 'Select Sprite'}
              </button>

              {selectedActor.spritePath && (
                <div className="scene-inspector-pane__field">
                  <label htmlFor="scene-inspector-actor-sprite-palette">Sprite Palette</label>
                  <select
                    id="scene-inspector-actor-sprite-palette"
                    value={selectedActor.spritePaletteIndex ?? 0}
                    onChange={(event) => {
                      editor.setActorSpritePaletteIndex(
                        selectedActor.id,
                        Number(event.target.value) === 1 ? 1 : 0
                      )
                    }}
                  >
                    <option value={0}>Palette 0</option>
                    <option value={1}>Palette 1</option>
                  </select>
                </div>
              )}

              <div className="scene-inspector-pane__field">
                <span>Actor Script</span>
                <strong>{selectedActorScriptLabel}</strong>
              </div>

              <button
                type="button"
                onClick={() => {
                  onRequestActorScriptSelection(selectedActor.id)
                }}
              >
                {selectedActor.scriptPath ? 'Change Actor Script' : 'Select Actor Script'}
              </button>

              <label className="scene-inspector-pane__toggle">
                <input
                  type="checkbox"
                  checked={selectedActor.followCamera}
                  onChange={(event) => {
                    editor.setFollowedActor(event.target.checked ? selectedActor.id : null)
                  }}
                />
                <span>Follow camera</span>
              </label>

              {selectedActor.followCamera && (
                <>
                  <div className="scene-inspector-pane__section-title">Camera Deadzone</div>
                  <div className="scene-inspector-pane__coords scene-inspector-pane__coords--camera">
                    {(
                      [
                        ['left', 'Left'],
                        ['right', 'Right'],
                        ['top', 'Top'],
                        ['bottom', 'Bottom']
                      ] as const
                    ).map(([edge, label]) => {
                      const deadzone = normalizeSceneCameraDeadzone(selectedActor.cameraDeadzone)

                      return (
                        <label key={edge}>
                          {label}
                          <input
                            type="number"
                            min={0}
                            max={SCENE_CAMERA_DEADZONE_LIMITS[edge]}
                            step={1}
                            value={deadzone[edge]}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => {
                              updateSelectedActorCameraDeadzone(edge, event.target.valueAsNumber)
                            }}
                          />
                        </label>
                      )
                    })}
                  </div>
                </>
              )}

              <div className="scene-inspector-pane__field">
                <label htmlFor="scene-inspector-actor-physics-mode">Physics Mode</label>
                <select
                  id="scene-inspector-actor-physics-mode"
                  value={selectedActor.physicsMode}
                  onChange={(event) => {
                    const nextPhysicsMode = event.target.value

                    if (isSceneActorPhysicsMode(nextPhysicsMode)) {
                      editor.updateActor(selectedActor.id, { physicsMode: nextPhysicsMode })
                    }
                  }}
                >
                  {SCENE_ACTOR_PHYSICS_MODES.map((physicsMode) => (
                    <option key={physicsMode} value={physicsMode}>
                      {SCENE_ACTOR_PHYSICS_MODE_LABELS[physicsMode]}
                    </option>
                  ))}
                </select>
              </div>

              <label className="scene-inspector-pane__toggle">
                <input
                  type="checkbox"
                  checked={selectedActor.drawAt30Hz ?? false}
                  onChange={(event) => {
                    editor.updateActor(selectedActor.id, { drawAt30Hz: event.target.checked })
                  }}
                />
                <span>Draw at 30 Hz</span>
              </label>

              <div className="scene-inspector-pane__field">
                <span>Scene Bounds</span>
                <strong>
                  {tilemapSize
                    ? `${tilemapSize.width * 8} x ${tilemapSize.height * 8}px`
                    : 'Unbounded'}
                </strong>
              </div>

              <div className="scene-inspector-pane__coords">
                <label>
                  X
                  <input
                    type="text"
                    value={xDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setXDraft(event.target.value)
                    }}
                    onBlur={() => {
                      commitActorAxis('x')
                    }}
                    onKeyDown={(event) => {
                      handleActorAxisKeyDown('x', event)
                    }}
                  />
                </label>

                <label>
                  Y
                  <input
                    type="text"
                    value={yDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setYDraft(event.target.value)
                    }}
                    onBlur={() => {
                      commitActorAxis('y')
                    }}
                    onKeyDown={(event) => {
                      handleActorAxisKeyDown('y', event)
                    }}
                  />
                </label>
              </div>

              <p className="scene-inspector-pane__hint">
                {coordinateUnit === 'gui' ? '1/16th-pixel precision.' : 'Core integer units.'}
              </p>

              {renderTagControls()}

              {activeScriptPropertyDefinitions.length > 0 && (
                <>
                  <div className="scene-inspector-pane__section-title">Script Properties</div>
                  {activeScriptPropertyDefinitions.map(renderScriptPropertyControl)}
                </>
              )}
            </>
          )}

          {selectedCollision && (
            <>
              <label className="scene-inspector-pane__toggle">
                <input
                  type="checkbox"
                  checked={selectedCollision.isBlocking}
                  onChange={(event) => {
                    editor.updateCollision(selectedCollision.id, {
                      isBlocking: event.target.checked
                    })
                  }}
                />
                <span>Blocking</span>
              </label>

              <div className="scene-inspector-pane__coords scene-inspector-pane__coords--collision">
                <label>
                  X
                  <input
                    type="text"
                    value={xDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setXDraft(event.target.value)
                    }}
                    onBlur={() => {
                      commitCollisionRect('x')
                    }}
                    onKeyDown={(event) => {
                      handleCollisionFieldKeyDown('x', event)
                    }}
                  />
                </label>

                <label>
                  Y
                  <input
                    type="text"
                    value={yDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setYDraft(event.target.value)
                    }}
                    onBlur={() => {
                      commitCollisionRect('y')
                    }}
                    onKeyDown={(event) => {
                      handleCollisionFieldKeyDown('y', event)
                    }}
                  />
                </label>

                <label>
                  Width
                  <input
                    type="text"
                    value={widthDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setWidthDraft(event.target.value)
                    }}
                    onBlur={() => {
                      commitCollisionRect('width')
                    }}
                    onKeyDown={(event) => {
                      handleCollisionFieldKeyDown('width', event)
                    }}
                  />
                </label>

                <label>
                  Height
                  <input
                    type="text"
                    value={heightDraft}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setHeightDraft(event.target.value)
                    }}
                    onBlur={() => {
                      commitCollisionRect('height')
                    }}
                    onKeyDown={(event) => {
                      handleCollisionFieldKeyDown('height', event)
                    }}
                  />
                </label>
              </div>

              <SceneCollisionCallbackControls
                collision={selectedCollision}
                maxCollisionCallbacks={maxCollisionCallbacks}
                onSetCollisionCallbacks={onSetCollisionCallbacks}
                onSetCollisionExitCallbacks={onSetCollisionExitCallbacks}
                onOpenPicker={(mode) => {
                  setCollisionCallbackPicker({ nodeId: selectedCollision.id, mode })
                }}
              />

              {renderTagControls()}

              <p className="scene-inspector-pane__hint">
                {childCoordinateOrigin === 'absolute'
                  ? 'Absolute under actors and at the root.'
                  : 'Local under actors; scene coordinates at the root.'}
              </p>

              {collisionCallbackPickerMode && (
                <ProjectScriptCallbackPickerModal
                  title={
                    collisionCallbackPickerMode === 'exit'
                      ? 'Add Collision Exit Callback'
                      : 'Add Collision Callback'
                  }
                  description="Pick a compatible callback."
                  candidates={availableCollisionCandidates}
                  isLoading={isCollisionCallbackPickerLoading}
                  errorMessage={collisionCallbackPickerErrorMessage}
                  emptyMessage="No compatible callbacks found."
                  onRefresh={onRefreshCollisionCallbackCandidates}
                  onClose={() => {
                    setCollisionCallbackPicker(null)
                  }}
                  onSelect={handleSelectCollisionCallback}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
