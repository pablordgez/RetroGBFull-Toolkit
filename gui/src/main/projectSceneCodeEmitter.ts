import { ProjectLauncherError } from './projectLauncherPrimitives'
import type { ProjectScriptRecordResolved } from './projectCodeScripts'
import type { ProjectAssetRecordLike } from './projectBuildCodeTypes'
import {
  normalizeSceneCameraDeadzone,
  normalizeWindowVisibilityTileBands,
  WINDOW_VISIBILITY_SCREEN_HEIGHT,
  type SceneActorPhysicsMode,
  type SceneAssetCollisionNode,
  type SceneAssetDocument,
  type SceneAssetNode,
  type SpriteAssetDocument,
  type TilemapAssetDocument,
  type TilesetAssetDocument,
  type WindowAssetDocument
} from '../shared/projectAssets'
import { buildProjectTagEnumName, type ProjectTagEntry } from '../shared/projectTags'
import {
  areProjectPalettesEqual,
  buildDmgPaletteRegisterValue,
  formatHexByte
} from '../shared/projectPalettes'

export const MANAGED_DEFAULT_ACTOR_IDENTIFIER = 'GeneratedDefaultActor'

const PHYSICS_MODE_ENUM_BY_SCENE_VALUE: Record<SceneActorPhysicsMode, string> = {
  highPerf: 'HIGH_PERF',
  balanced: 'BALANCED',
  highFidelity: 'HIGH_FIDELITY'
}

const findFirstSpritePalette = (
  nodes: SceneAssetNode[],
  spriteAssetsByPath: Map<string, ProjectAssetRecordLike>
): string[] | null => {
  for (const node of nodes) {
    if (node.type === 'actor' && node.spritePath) {
      const sprite = spriteAssetsByPath.get(node.spritePath)

      if (sprite) {
        return (sprite.document as SpriteAssetDocument).palette
      }
    }

    const nestedPalette = findFirstSpritePalette(node.children, spriteAssetsByPath)

    if (nestedPalette) {
      return nestedPalette
    }
  }

  return null
}

const getSceneSpritePalettes = (
  document: SceneAssetDocument,
  spriteAssetsByPath: Map<string, ProjectAssetRecordLike>
): [string[] | null, string[] | null] => {
  const configuredPalettes = document.spritePalettes ?? [document.spritePalette ?? null, null]

  if (configuredPalettes[0]) {
    return [configuredPalettes[0], configuredPalettes[1] ?? configuredPalettes[0]]
  }

  if (configuredPalettes[1]) {
    return [null, configuredPalettes[1]]
  }

  const firstPalette = findFirstSpritePalette(document.nodes, spriteAssetsByPath)

  if (!firstPalette) {
    return [null, null]
  }

  const secondPalette = (() => {
    const findDistinctPalette = (nodes: SceneAssetNode[]): string[] | null => {
      for (const node of nodes) {
        if (node.type === 'actor' && node.spritePath) {
          const sprite = spriteAssetsByPath.get(node.spritePath)
          const palette = sprite ? (sprite.document as SpriteAssetDocument).palette : null

          if (palette && !areProjectPalettesEqual(palette, firstPalette)) {
            return palette
          }
        }

        const nestedPalette = findDistinctPalette(node.children)

        if (nestedPalette) {
          return nestedPalette
        }
      }

      return null
    }

    return findDistinctPalette(document.nodes)
  })()

  return [firstPalette, secondPalette ?? firstPalette]
}

const getMapTilesetPalette = (
  mapPath: string | null,
  mapAssetsByPath: Map<string, ProjectAssetRecordLike>,
  tilesetAssetsByPath: Map<string, ProjectAssetRecordLike>
): string[] | null => {
  if (!mapPath) {
    return null
  }

  const map = mapAssetsByPath.get(mapPath)
  const document = map?.document as TilemapAssetDocument | WindowAssetDocument | undefined
  const tileset = document?.tilesetPath ? tilesetAssetsByPath.get(document.tilesetPath) : null

  return tileset ? (tileset.document as TilesetAssetDocument).palette : null
}

type SceneNodeEmitter = (
  node: SceneAssetNode,
  parentActor: ParentActorContext | null,
  lines: string[],
  counters: { actor: number }
) => string | null

interface ParentActorContext {
  variable: string
  visualXExpression: string
  visualYExpression: string
}

const getSpriteAnchorOffset = (
  spritePath: string | null,
  spriteAssetsByPath: Map<string, ProjectAssetRecordLike>
): { x: number; y: number } => {
  if (!spritePath) {
    return { x: 0, y: 0 }
  }

  const spriteResource = spriteAssetsByPath.get(spritePath)

  if (!spriteResource) {
    return { x: 0, y: 0 }
  }

  const spriteDocument = spriteResource.document as SpriteAssetDocument
  const offsetX =
    spriteDocument.width === 8 && spriteDocument.height === 8
      ? 8
      : Math.floor(spriteDocument.width / 2) + 8
  const offsetY =
    spriteDocument.width === 8 && spriteDocument.height === 8
      ? 16
      : Math.floor(spriteDocument.height / 2) + 16

  return {
    x: offsetX << 4,
    y: offsetY << 4
  }
}

const subtractExpression = (expression: string, value: number): string => {
  return value === 0 ? expression : `(${expression} - ${value})`
}

const addSceneCoordinate = (value: number, offset: number): number => {
  return Math.min(0xffff, Math.max(0, value + offset))
}

// builds a function that generates code for an editor scene node and its children
export const createNodeEmitter = (
  spriteAssetsByPath: Map<string, ProjectAssetRecordLike>,
  actorScriptsByPath: Map<string, ProjectScriptRecordResolved>,
  projectTags: ProjectTagEntry[] = [],
  maxTagSlots = 5,
  collisionCallbackScriptsByPath: Map<string, ProjectScriptRecordResolved> = actorScriptsByPath
): SceneNodeEmitter => {
  // helpers to get the tag enum names from their ids
  const tagEnumNamesById = new Map(
    projectTags.map((tag) => [tag.id, buildProjectTagEnumName(tag.name)])
  )
  const getEmittableTags = (tagIds: string[] | undefined): string[] => {
    return (tagIds ?? [])
      .flatMap((tagId): string[] => {
        const enumName = tagEnumNamesById.get(tagId)
        return enumName ? [enumName] : []
      })
      .slice(0, maxTagSlots)
  }
  const buildCollisionCallbackExpression = (callback: {
    scriptPath: string
    functionName: string
  }): string => {
    const script = collisionCallbackScriptsByPath.get(callback.scriptPath)

    if (!script) {
      throw new ProjectLauncherError(
        `Collision callback "${callback.functionName}" references a missing script resource: ${callback.scriptPath}`
      )
    }

    return `TO_FAR_PTR(${callback.functionName}, BANK(${script.identifier}_bankref))`
  }

  // function takes a node, the variable name of its parent actor if it has one, an array to push lines of code
  // into and a counter to generate unique actor variable names
  const emitNode = (
    node: SceneAssetNode,
    parentActor: ParentActorContext | null,
    lines: string[],
    counters: { actor: number }
  ): string | null => {
    // if it's a folder, just emit its children
    if (node.type === 'folder') {
      for (const childNode of node.children) {
        emitNode(childNode, parentActor, lines, counters)
      }

      return null
    }
    // if it's a collider
    if (node.type === 'collision') {
      const collisionNode = node as SceneAssetCollisionNode
      const actorVariable = `generated_actor_${counters.actor}`
      counters.actor += 1
      const worldX = parentActor
        ? `${parentActor.visualXExpression} + ${collisionNode.x}`
        : `${collisionNode.x}`
      const worldY = parentActor
        ? `${parentActor.visualYExpression} + ${collisionNode.y}`
        : `${collisionNode.y}`
      // if it doesn't have a parent, we create one to attach the collider to
      if (!parentActor) {
        lines.push(`    Actor* ${actorVariable} = create_actor(_${MANAGED_DEFAULT_ACTOR_IDENTIFIER});`)
        lines.push(`    THIS_ACTOR = ${actorVariable};`)
        lines.push(`    set_actor_position(${collisionNode.x}, ${collisionNode.y});`)
        lines.push(`    add_actor(${actorVariable});`)
      }

      // then we create the collider and attach it to the parent actor (whether it's a real actor or the one we
      // just created)
      const colliderVariable = `${actorVariable}_collider`
      lines.push(`    Collider* ${colliderVariable} = (Collider*) malloc(sizeof(Collider));`)
      lines.push(`    memset(${colliderVariable}, 0, sizeof(Collider));`)
      lines.push(`    ${colliderVariable}->x = ${worldX};`)
      lines.push(`    ${colliderVariable}->y = ${worldY};`)
      lines.push(`    ${colliderVariable}->width = ${collisionNode.width};`)
      lines.push(`    ${colliderVariable}->height = ${collisionNode.height};`)
      lines.push(`    ${colliderVariable}->is_blocking = ${collisionNode.isBlocking ? 1 : 0};`)
      lines.push(`    ${colliderVariable}->type = BOX_COLLIDER;`)

      // set tags for the collider, if any
      getEmittableTags(collisionNode.tags).forEach((tagName, tagIndex) => {
        lines.push(`    ${colliderVariable}->tags[${tagIndex}] = ${tagName};`)
      })

      lines.push(`    THIS_ACTOR = ${parentActor?.variable ?? actorVariable};`)
      lines.push(`    set_collider(${colliderVariable});`)

      for (const callback of collisionNode.callbacks ?? []) {
        lines.push(
          `    set_collision_callback(${colliderVariable}, ${buildCollisionCallbackExpression(callback)});`
        )
      }
      for (const callback of collisionNode.exitCallbacks ?? []) {
        lines.push(
          `    set_collision_exit_callback(${colliderVariable}, ${buildCollisionCallbackExpression(callback)});`
        )
      }

      return parentActor?.variable ?? actorVariable
    }
    // otherwise, it's an actor node, so we create an actor for it, set its properties and emit its children
    const script = node.scriptPath ? actorScriptsByPath.get(node.scriptPath) : null
    const actorType = script ? script.identifier : MANAGED_DEFAULT_ACTOR_IDENTIFIER
    const actorVariable = `generated_actor_${counters.actor}`
    counters.actor += 1
    lines.push(`    Actor* ${actorVariable} = create_actor(_${actorType});`)
    lines.push(`    THIS_ACTOR = ${actorVariable};`)
    lines.push(
      `    ${actorVariable}->physics_mode = ${PHYSICS_MODE_ENUM_BY_SCENE_VALUE[node.physicsMode]};`
    )
    const anchorOffset = getSpriteAnchorOffset(node.spritePath, spriteAssetsByPath)
    const runtimeX = addSceneCoordinate(node.x, anchorOffset.x)
    const runtimeY = addSceneCoordinate(node.y, anchorOffset.y)
    lines.push(`    set_actor_position(${runtimeX}, ${runtimeY});`)

    // set tags for the actor, if any
    getEmittableTags(node.tags).forEach((tagName, tagIndex) => {
      lines.push(`    set_tag(${tagName}, ${tagIndex});`)
    })

    if (node.spritePath) {
      const spriteResource = spriteAssetsByPath.get(node.spritePath)

      if (!spriteResource) {
        throw new ProjectLauncherError(
          `Actor "${node.name}" references a missing sprite resource: ${node.spritePath}`
        )
      }

      lines.push(`    set_actor_animation(animations[${spriteResource.identifier}]);`)
      if (node.spritePaletteIndex === 1) {
        lines.push(`    set_animation_props(S_PALETTE, ${runtimeX >> 4}, ${runtimeY >> 4});`)
      }
    }

    if (node.followCamera) {
      const cameraDeadzone = normalizeSceneCameraDeadzone(node.cameraDeadzone)
      lines.push(`    deadzone_left = ${cameraDeadzone.left};`)
      lines.push(`    deadzone_right = ${cameraDeadzone.right};`)
      lines.push(`    deadzone_top = ${cameraDeadzone.top};`)
      lines.push(`    deadzone_bottom = ${cameraDeadzone.bottom};`)
      lines.push(`    ${actorVariable}->followed = 1;`)
    }

    lines.push(`    add_actor(${actorVariable});`)

    const actorContext: ParentActorContext = {
      variable: actorVariable,
      visualXExpression: subtractExpression(`${actorVariable}->x`, anchorOffset.x),
      visualYExpression: subtractExpression(`${actorVariable}->y`, anchorOffset.y)
    }

    for (const childNode of node.children) {
      const childActorVariable = emitNode(childNode, actorContext, lines, counters)

      if (childNode.type === 'actor' && childActorVariable) {
        lines.push(`    THIS_ACTOR = ${actorVariable};`)
        lines.push(`    attach_child(${childActorVariable});`)
      }
    }

    return actorVariable
  }

  return emitNode
}

// builds the scene initialization:
// map, window and uses an emitter to generate code for the scene nodes
export const buildSceneInitializationLines = (
  scene: ProjectAssetRecordLike,
  tilemapAssetsByPath: Map<string, ProjectAssetRecordLike>,
  windowAssetsByPath: Map<string, ProjectAssetRecordLike>,
  emitNode: SceneNodeEmitter,
  spriteAssetsByPath: Map<string, ProjectAssetRecordLike> = new Map(),
  tilesetAssetsByPath: Map<string, ProjectAssetRecordLike> = new Map()
): string[] => {
  const document = scene.document as SceneAssetDocument
  const lines: string[] = []
  const backgroundPalette =
    document.backgroundPalette ??
    getMapTilesetPalette(document.tilemapPath, tilemapAssetsByPath, tilesetAssetsByPath) ??
    getMapTilesetPalette(document.windowPath, windowAssetsByPath, tilesetAssetsByPath)
  const spritePalettes = getSceneSpritePalettes(document, spriteAssetsByPath)

  if (backgroundPalette) {
    lines.push(`    BGP_REG = ${formatHexByte(buildDmgPaletteRegisterValue(backgroundPalette))};`)
  }

  if (spritePalettes[0]) {
    lines.push(`    OBP0_REG = ${formatHexByte(buildDmgPaletteRegisterValue(spritePalettes[0]))};`)
  }

  if (spritePalettes[1]) {
    lines.push(`    OBP1_REG = ${formatHexByte(buildDmgPaletteRegisterValue(spritePalettes[1]))};`)
  }

  if (document.tilemapPath) {
    const tilemap = tilemapAssetsByPath.get(document.tilemapPath)

    if (!tilemap) {
      throw new ProjectLauncherError(
        `Scene "${scene.name}" references a missing tilemap resource: ${document.tilemapPath}`
      )
    }

    lines.push(`    set_scene_map(maps[${tilemap.identifier}]);`)
  }

  if (document.windowPath) {
    const windowResource = windowAssetsByPath.get(document.windowPath)

    if (!windowResource) {
      throw new ProjectLauncherError(
        `Scene "${scene.name}" references a missing window resource: ${document.windowPath}`
      )
    }

    lines.push(`    set_scene_window(maps[${windowResource.identifier}]);`)

    const windowDocument = windowResource.document as WindowAssetDocument
    const visibilityBands = normalizeWindowVisibilityTileBands(windowDocument.windowVisibilityBands)
    const isFullWindow =
      visibilityBands.length === 1 &&
      visibilityBands[0].start === 0 &&
      visibilityBands[0].end === WINDOW_VISIBILITY_SCREEN_HEIGHT

    if (!isFullWindow) {
      lines.push('    window_visibility_clear_owner(WINDOW_VISIBILITY_OWNER_SCENE);')
      visibilityBands.forEach((band) => {
        lines.push(
          `    window_visibility_add_band(WINDOW_VISIBILITY_OWNER_SCENE, ${band.start}, ${band.end});`
        )
      })
      lines.push('    window_visibility_apply();')
    }
  }

  const counters = { actor: 0 }

  for (const node of document.nodes) {
    emitNode(node, null, lines, counters)
  }

  return lines
}
