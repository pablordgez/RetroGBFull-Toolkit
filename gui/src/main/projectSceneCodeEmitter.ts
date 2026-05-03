import { ProjectLauncherError } from './projectLauncher'
import type { ProjectScriptRecordResolved } from './projectCodeScripts'
import type { ProjectAssetRecordLike } from './projectBuildCodeTypes'
import type {
  SceneAssetCollisionNode,
  SceneAssetDocument,
  SceneAssetNode
} from '../shared/projectAssets'
import { buildProjectTagEnumName, type ProjectTagEntry } from '../shared/projectTags'

export const MANAGED_DEFAULT_ACTOR_IDENTIFIER = 'GeneratedDefaultActor'

type SceneNodeEmitter = (
  node: SceneAssetNode,
  parentActorVariable: string | null,
  lines: string[],
  counters: { actor: number }
) => string | null

// builds a function that generates code for an editor scene node and its children
export const createNodeEmitter = (
  spriteAssetsByPath: Map<string, ProjectAssetRecordLike>,
  actorScriptsByPath: Map<string, ProjectScriptRecordResolved>,
  projectTags: ProjectTagEntry[] = [],
  maxTagSlots = 5
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

  // function takes a node, the variable name of its parent actor if it has one, an array to push lines of code
  // into and a counter to generate unique actor variable names
  const emitNode = (
    node: SceneAssetNode,
    parentActorVariable: string | null,
    lines: string[],
    counters: { actor: number }
  ): string | null => {
    // if it's a folder, just emit its children
    if (node.type === 'folder') {
      for (const childNode of node.children) {
        emitNode(childNode, parentActorVariable, lines, counters)
      }

      return null
    }
    // if it's a collider
    if (node.type === 'collision') {
      const collisionNode = node as SceneAssetCollisionNode
      const actorVariable = `generated_actor_${counters.actor}`
      counters.actor += 1
      const worldX = parentActorVariable
        ? `${parentActorVariable}->x + ${collisionNode.x}`
        : `${collisionNode.x}`
      const worldY = parentActorVariable
        ? `${parentActorVariable}->y + ${collisionNode.y}`
        : `${collisionNode.y}`
      // if it doesn't have a parent, we create one to attach the collider to
      if (!parentActorVariable) {
        lines.push(`    Actor* ${actorVariable} = (Actor*) malloc(sizeof(Actor));`)
        lines.push(`    ${actorVariable}->type = _${MANAGED_DEFAULT_ACTOR_IDENTIFIER};`)
        lines.push(`    THIS_ACTOR = ${actorVariable};`)
        lines.push(`    actor_init_functions[${actorVariable}->type]();`)
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

      lines.push(`    THIS_ACTOR = ${parentActorVariable ?? actorVariable};`)
      lines.push(`    set_collider(${colliderVariable});`)

      for (const callback of collisionNode.callbacks) {
        lines.push(`    set_collision_callback(${colliderVariable}, ${callback.functionName});`)
      }

      return parentActorVariable ?? actorVariable
    }
    // otherwise, it's an actor node, so we create an actor for it, set its properties and emit its children
    const script = node.scriptPath ? actorScriptsByPath.get(node.scriptPath) : null
    const allocationType = script ? script.identifier : 'Actor'
    const actorType = script ? script.identifier : MANAGED_DEFAULT_ACTOR_IDENTIFIER
    const actorVariable = `generated_actor_${counters.actor}`
    counters.actor += 1
    lines.push(`    Actor* ${actorVariable} = (Actor*) malloc(sizeof(${allocationType}));`)
    lines.push(`    ${actorVariable}->type = _${actorType};`)
    lines.push(`    THIS_ACTOR = ${actorVariable};`)
    lines.push(`    actor_init_functions[${actorVariable}->type]();`)
    lines.push(`    set_actor_position(${node.x}, ${node.y});`)

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
    }

    if (node.followCamera) {
      lines.push(`    ${actorVariable}->followed = 1;`)
    }

    lines.push(`    add_actor(${actorVariable});`)

    for (const childNode of node.children) {
      const childActorVariable = emitNode(childNode, actorVariable, lines, counters)

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
  emitNode: SceneNodeEmitter
): string[] => {
  const document = scene.document as SceneAssetDocument
  const lines: string[] = []

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
  }

  const counters = { actor: 0 }

  for (const node of document.nodes) {
    emitNode(node, null, lines, counters)
  }

  return lines
}
