import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { basename, dirname } from 'path'
import {
  loadProjectStartingScenePath,
  loadProjectTagState,
  readProjectTrackedResourceBanks
} from './projectMetadata'
import { ProjectLauncherError } from './projectLauncher'
import { normalizeCodeIdentifierStem } from '../shared/codeIdentifiers'
import type { BuildProjectCodeResult } from '../shared/projectCodeWorkspace'
import {
  type SceneAssetDocument,
  type TilemapAssetDocument,
  type WindowAssetDocument,
  getProjectAssetDisplayName,
  getProjectAssetKindFromFileName,
  parseProjectAssetDocument
} from '../shared/projectAssets'
import { DEFAULT_PROJECT_RESOURCE_BANK } from '../shared/projectResourceModels'
import { ensureBundledGbdkAvailableForProject } from './projectEngineBundle'
import {
  CORE_PLACEHOLDER_SCENE_FILE_MARKER,
  IGNORED_PROJECT_RESOURCE_ROOT_DIRECTORIES,
  RESOURCE_GENERATION_MANIFEST_PATH,
  ensureProjectDirectory,
  resolvePathWithinProject,
  walkRelativePaths
} from './projectCodeShared'
import {
  type ProjectScriptRecordResolved,
  buildManagedDefaultActorFileContents,
  buildManagedSceneFileContents,
  buildManagedScriptedSceneFileContents,
  getProjectScriptHeaderPath,
  loadProjectScriptRecords,
  readMaxTagSlots,
  removeLegacyGeneratedFiles,
  rewriteManagedProjectScriptSource,
  rewriteStartingSceneInMain,
  syncManagedSceneFiles,
  writeProjectSaveDataFiles
} from './projectCodeScripts'
import type { ProjectAssetRecordLike } from './projectBuildCodeTypes'
import {
  buildActorRegistryHeader,
  buildAnimationRegistryFiles,
  buildMapRegistryFiles,
  buildMapResourceFiles,
  buildSceneRegistryHeader,
  buildSpriteResourceFiles,
  buildTilesetResourceFiles,
  canReuseSharedTilesetForMap
} from './projectCCodeEmitters'
import {
  MANAGED_DEFAULT_ACTOR_IDENTIFIER,
  buildSceneInitializationLines,
  createNodeEmitter
} from './projectSceneCodeEmitter'

interface BuiltSceneRecord {
  asset: ProjectAssetRecordLike
  identifier: string
  sourcePath: string
  headerPath: string
  bank: number
  sceneScript: ProjectScriptRecordResolved | null
}

interface ResourceGenerationManifest {
  version: 1
  resourceDirectories: string[]
}

const normalizeManifestResourcePaths = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.replace(/\\/g, '/'))
}

const readResourceGenerationManifest = async (
  projectPath: string
): Promise<ResourceGenerationManifest> => {
  const manifestAbsolutePath = resolvePathWithinProject(
    projectPath,
    RESOURCE_GENERATION_MANIFEST_PATH
  )

  try {
    const manifestContent = await readFile(manifestAbsolutePath, 'utf-8')
    const parsed = JSON.parse(manifestContent) as Partial<ResourceGenerationManifest>

    return {
      version: 1,
      resourceDirectories: normalizeManifestResourcePaths(parsed.resourceDirectories)
    }
  } catch {
    return {
      version: 1,
      resourceDirectories: []
    }
  }
}

const writeResourceGenerationManifest = async (
  projectPath: string,
  resourceDirectories: string[]
): Promise<void> => {
  const manifestAbsolutePath = resolvePathWithinProject(
    projectPath,
    RESOURCE_GENERATION_MANIFEST_PATH
  )
  const manifest: ResourceGenerationManifest = {
    version: 1,
    resourceDirectories: [
      ...new Set(resourceDirectories.map((path) => path.replace(/\\/g, '/')))
    ].sort()
  }

  await mkdir(dirname(manifestAbsolutePath), { recursive: true })
  await writeFile(`${manifestAbsolutePath}`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
}

// delete resource files that no longer exist
const syncManagedResourceDirectories = async (
  projectPath: string,
  nextResourceDirectories: string[]
): Promise<void> => {
  const manifest = await readResourceGenerationManifest(projectPath)
  const nextDirectorySet = new Set(
    nextResourceDirectories.map((resourceDirectory) => resourceDirectory.replace(/\\/g, '/'))
  )
  const staleDirectories = manifest.resourceDirectories
    .filter((resourceDirectory) => !nextDirectorySet.has(resourceDirectory))
    .sort((left, right) => right.length - left.length)

  for (const resourceDirectory of staleDirectories) {
    await rm(resolvePathWithinProject(projectPath, resourceDirectory), {
      recursive: true,
      force: true
    })
  }

  await writeResourceGenerationManifest(projectPath, [...nextDirectorySet])
}

const collectProjectResourcePaths = async (projectPath: string): Promise<string[]> => {
  return walkRelativePaths(projectPath, '', IGNORED_PROJECT_RESOURCE_ROOT_DIRECTORIES)
}

// loads all asset documents and their metadata
const loadProjectAssetRecords = async (projectPath: string): Promise<ProjectAssetRecordLike[]> => {
  // loads all asset file paths and their banks
  const [relativePaths, trackedBanks] = await Promise.all([
    collectProjectResourcePaths(projectPath),
    readProjectTrackedResourceBanks(projectPath)
  ])
  const assetRecords: ProjectAssetRecordLike[] = []

  // for each path, load the document and build an asset record if the document has a kind and it matches
  // the kind inferred from the file name
  for (const resourcePath of relativePaths) {
    const assetKind = getProjectAssetKindFromFileName(resourcePath)

    if (!assetKind) {
      continue
    }

    const absolutePath = resolvePathWithinProject(projectPath, resourcePath)
    const rawContent = await readFile(absolutePath, 'utf-8')
    const document = parseProjectAssetDocument(JSON.parse(rawContent))

    if (document.kind !== assetKind) {
      continue
    }

    const displayName = getProjectAssetDisplayName(basename(resourcePath))
    assetRecords.push({
      kind: assetKind,
      path: resourcePath.replace(/\\/g, '/'),
      name: displayName,
      identifier: normalizeCodeIdentifierStem(displayName),
      bank: trackedBanks.get(resourcePath.replace(/\\/g, '/')) ?? DEFAULT_PROJECT_RESOURCE_BANK,
      document
    })
  }

  return assetRecords.sort((left, right) => left.path.localeCompare(right.path))
}

// if there is a placeholder scene and there are any actual scenes, remove it
const cleanupCorePlaceholderScene = async (
  projectPath: string,
  sceneIdentifiers: string[],
  startingSceneIdentifier: string | null
): Promise<string[]> => {
  const placeholderPaths = ['src/CustomScenes/SampleScene.h', 'src/CustomScenes/SampleScene.c']
  const shouldKeepPlaceholder =
    sceneIdentifiers.length === 0 ||
    sceneIdentifiers.includes('SampleScene') ||
    startingSceneIdentifier === 'SampleScene'

  if (shouldKeepPlaceholder) {
    return []
  }

  const removedPaths: string[] = []

  for (const resourcePath of placeholderPaths) {
    const absolutePath = resolvePathWithinProject(projectPath, resourcePath)

    try {
      const fileContent = await readFile(absolutePath, 'utf-8')

      if (!fileContent.includes(CORE_PLACEHOLDER_SCENE_FILE_MARKER)) {
        continue
      }

      await rm(absolutePath, { force: true })
      removedPaths.push(resourcePath)
    } catch {
      // Placeholder files may already be gone in existing projects.
    }
  }

  return removedPaths
}

// iterates over a list of assets, checks if they declare a script path
// if so, checks if the script exists and if so it builds a record that uses the script's data
// otherwise it builds a record with default values based on the asset identifier
const buildSceneRecords = (
  sceneAssets: ProjectAssetRecordLike[],
  sceneScriptsByPath: Map<string, ProjectScriptRecordResolved>
): BuiltSceneRecord[] => {
  return sceneAssets.map((scene) => {
    const document = scene.document as SceneAssetDocument
    const sceneScript = document.scriptPath ? sceneScriptsByPath.get(document.scriptPath) : null

    if (document.scriptPath && !sceneScript) {
      throw new ProjectLauncherError(
        `Scene "${scene.name}" references a missing scene script resource: ${document.scriptPath}`
      )
    }

    if (sceneScript) {
      return {
        asset: scene,
        identifier: scene.identifier,
        sourcePath: `src/CustomScenes/${scene.identifier}.c`,
        headerPath: `src/CustomScenes/${scene.identifier}.h`,
        bank: sceneScript.bank,
        sceneScript
      }
    }

    return {
      asset: scene,
      identifier: scene.identifier,
      sourcePath: `src/CustomScenes/${scene.identifier}.c`,
      headerPath: `src/CustomScenes/${scene.identifier}.h`,
      bank: DEFAULT_PROJECT_RESOURCE_BANK,
      sceneScript: null
    }
  })
}

// sorts entries and then writes them like:
// - label "entry_key": entry_path_1, entry_path_2
const formatConflictLines = (label: string, conflicts: Map<string, string[]>): string[] => {
  return [...conflicts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, paths]) => `- ${label} "${value}": ${paths.sort().join(', ')}`)
}

// checks that there are no duplicate names or identifiers across a list of assets and scripts
const assertNoManagedResourceConflicts = (
  assets: ProjectAssetRecordLike[],
  scripts: ProjectScriptRecordResolved[]
): void => {
  // combines assets and scripts into one list,
  const allResources = [
    ...assets.map((asset) => ({
      name: asset.name,
      path: asset.path,
      identifier: asset.identifier
    })),
    ...scripts.map((script) => ({
      name: script.name,
      path: script.path,
      identifier: script.identifier
    }))
  ]
  const displayNameConflicts = new Map<string, string[]>()
  const identifierConflicts = new Map<string, string[]>()

  // for every resource, if there is already an entry for its name, adds its path to the end of the value array
  // otherwise adds a new entry with an array with its path
  for (const resource of allResources) {
    const normalizedDisplayName = resource.name.trim().toLowerCase()
    displayNameConflicts.set(normalizedDisplayName, [
      ...(displayNameConflicts.get(normalizedDisplayName) ?? []),
      resource.path
    ])
    identifierConflicts.set(resource.identifier, [
      ...(identifierConflicts.get(resource.identifier) ?? []),
      resource.path
    ])
  }

  // filters to keep only entries that have more than one path
  const duplicateDisplayNames = new Map(
    [...displayNameConflicts.entries()].filter(([, paths]) => paths.length > 1)
  )
  const duplicateIdentifiers = new Map(
    [...identifierConflicts.entries()].filter(([, paths]) => paths.length > 1)
  )

  // if there are no conflicts, return
  if (duplicateDisplayNames.size === 0 && duplicateIdentifiers.size === 0) {
    return
  }

  // otherwise, build an error with all conflicts
  const messageLines = ['Resource generation was canceled because some resource names conflict.']

  if (duplicateDisplayNames.size > 0) {
    messageLines.push('Duplicate display names:')
    messageLines.push(...formatConflictLines('name', duplicateDisplayNames))
  }

  if (duplicateIdentifiers.size > 0) {
    messageLines.push('Duplicate C identifiers:')
    messageLines.push(...formatConflictLines('identifier', duplicateIdentifiers))
  }

  throw new ProjectLauncherError(messageLines.join('\n'))
}

const writeManagedTextFile = async (
  projectPath: string,
  resourcePath: string,
  content: string
): Promise<string> => {
  const absolutePath = resolvePathWithinProject(projectPath, resourcePath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content, 'utf-8')
  return resourcePath
}

export const buildProjectCode = async (projectPath: string): Promise<BuildProjectCodeResult> => {
  // normalize project path and ensure GBDK is available
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  await ensureBundledGbdkAvailableForProject(normalizedProjectPath)

  // load all project resources, scripts and tags
  const [assets, scripts, projectTagState, maxTagSlots] = await Promise.all([
    loadProjectAssetRecords(normalizedProjectPath),
    loadProjectScriptRecords(normalizedProjectPath),
    loadProjectTagState(normalizedProjectPath),
    readMaxTagSlots(normalizedProjectPath)
  ])

  // stop if names/identifiers would collide in generated code
  assertNoManagedResourceConflicts(assets, scripts)

  // split by kind and build maps for each one
  const spriteAssets = assets.filter((asset) => asset.kind === 'sprite')
  const tilesetAssets = assets.filter((asset) => asset.kind === 'tileset')
  const tilemapAssets = assets.filter((asset) => asset.kind === 'tilemap')
  const windowAssets = assets.filter((asset) => asset.kind === 'window')
  const sceneAssets = assets.filter((asset) => asset.kind === 'scene')
  const actorScripts = scripts.filter((script) => script.kind === 'actor')
  const sceneScripts = scripts.filter((script) => script.kind === 'scene')
  const tilesetAssetsByPath = new Map(tilesetAssets.map((asset) => [asset.path, asset]))
  const spriteAssetsByPath = new Map(spriteAssets.map((asset) => [asset.path, asset]))
  const tilemapAssetsByPath = new Map(tilemapAssets.map((asset) => [asset.path, asset]))
  const windowAssetsByPath = new Map(windowAssets.map((asset) => [asset.path, asset]))
  const sceneScriptsByPath = new Map(sceneScripts.map((script) => [script.path, script]))
  const sceneRecords = buildSceneRecords(sceneAssets, sceneScriptsByPath)
  const configuredStartingScenePath = await loadProjectStartingScenePath(normalizedProjectPath)
  const startingScene =
    (configuredStartingScenePath
      ? (sceneRecords.find((scene) => scene.asset.path === configuredStartingScenePath) ?? null)
      : null) ??
    sceneRecords[0] ??
    null
  // create a scene node emitter and shared accumulators for generated output
  const emitSceneNode = createNodeEmitter(
    spriteAssetsByPath,
    new Map(actorScripts.map((script) => [script.path, script])),
    projectTagState.entries,
    maxTagSlots
  )
  const writtenFiles: string[] = []
  const managedResourceDirectories = new Set<string>()
  const managedScenePaths: string[] = []
  const saveDataFiles = await writeProjectSaveDataFiles(normalizedProjectPath)
  writtenFiles.push(...saveDataFiles.writtenFiles)

  // rewrite managed regions in user scripts
  for (const script of scripts) {
    writtenFiles.push(await rewriteManagedProjectScriptSource(normalizedProjectPath, script))
  }

  // always generate the fallback actor used by actors without scripts or collisions without a parent actor
  const managedDefaultActorFiles = buildManagedDefaultActorFileContents(
    MANAGED_DEFAULT_ACTOR_IDENTIFIER,
    DEFAULT_PROJECT_RESOURCE_BANK
  )
  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      `src/CustomActors/${MANAGED_DEFAULT_ACTOR_IDENTIFIER}.h`,
      managedDefaultActorFiles.headerContent
    )
  )
  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      `src/CustomActors/${MANAGED_DEFAULT_ACTOR_IDENTIFIER}.c`,
      managedDefaultActorFiles.sourceContent
    )
  )

  // build initialization lines for each scene and write CustomScenes files
  for (const sceneRecord of sceneRecords) {
    const initializationLines = buildSceneInitializationLines(
      sceneRecord.asset,
      tilemapAssetsByPath,
      windowAssetsByPath,
      emitSceneNode
    )
    const managedSceneFiles = sceneRecord.sceneScript
      ? buildManagedScriptedSceneFileContents(
          sceneRecord.identifier,
          sceneRecord.bank,
          sceneRecord.sceneScript.identifier,
          getProjectScriptHeaderPath(sceneRecord.sceneScript.path),
          initializationLines
        )
      : buildManagedSceneFileContents(sceneRecord.identifier, sceneRecord.bank, initializationLines)
    writtenFiles.push(
      await writeManagedTextFile(
        normalizedProjectPath,
        sceneRecord.headerPath,
        managedSceneFiles.headerContent
      )
    )
    writtenFiles.push(
      await writeManagedTextFile(
        normalizedProjectPath,
        sceneRecord.sourcePath,
        managedSceneFiles.sourceContent
      )
    )
    managedScenePaths.push(sceneRecord.headerPath, sceneRecord.sourcePath)
  }

  // remove core sample scene files when they are not needed
  writtenFiles.push(
    ...(await cleanupCorePlaceholderScene(
      normalizedProjectPath,
      sceneRecords.map((scene) => scene.identifier),
      startingScene?.identifier ?? null
    ))
  )

  // update main.c with the selected starting scene
  writtenFiles.push(
    await rewriteStartingSceneInMain(
      normalizedProjectPath,
      startingScene?.identifier ?? 'SampleScene'
    )
  )

  // generate sprite resource headers/sources
  for (const sprite of spriteAssets) {
    const files = buildSpriteResourceFiles(sprite)
    managedResourceDirectories.add(dirname(files.headerPath).replace(/\\/g, '/'))
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.headerPath, files.headerContent)
    )
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.sourcePath, files.sourceContent)
    )
  }

  // generate tileset resource headers/sources
  for (const tileset of tilesetAssets) {
    const files = buildTilesetResourceFiles(tileset)
    managedResourceDirectories.add(dirname(files.headerPath).replace(/\\/g, '/'))
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.headerPath, files.headerContent)
    )
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.sourcePath, files.sourceContent)
    )
  }

  // generate tilemap resources (with validation and shared-tileset reuse when possible)
  for (const tilemap of tilemapAssets) {
    const document = tilemap.document as TilemapAssetDocument

    if (!document.tilesetPath) {
      throw new ProjectLauncherError(`Tilemap "${tilemap.name}" does not have a tileset assigned.`)
    }

    const tileset = tilesetAssetsByPath.get(document.tilesetPath)

    if (!tileset) {
      throw new ProjectLauncherError(
        `Tilemap "${tilemap.name}" references a missing tileset resource: ${document.tilesetPath}`
      )
    }

    const files = buildMapResourceFiles(
      tilemap,
      tileset,
      0,
      0,
      canReuseSharedTilesetForMap(tilemap, tileset)
    )
    managedResourceDirectories.add(dirname(files.headerPath).replace(/\\/g, '/'))
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.headerPath, files.headerContent)
    )
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.sourcePath, files.sourceContent)
    )
  }

  // generate window resources using their split configuration
  for (const windowResource of windowAssets) {
    const document = windowResource.document as WindowAssetDocument

    if (!document.tilesetPath) {
      throw new ProjectLauncherError(
        `Window "${windowResource.name}" does not have a tileset assigned.`
      )
    }

    const tileset = tilesetAssetsByPath.get(document.tilesetPath)

    if (!tileset) {
      throw new ProjectLauncherError(
        `Window "${windowResource.name}" references a missing tileset resource: ${document.tilesetPath}`
      )
    }

    const files = buildMapResourceFiles(
      windowResource,
      tileset,
      document.windowTopEnd,
      document.windowBottomStart,
      canReuseSharedTilesetForMap(windowResource, tileset)
    )
    managedResourceDirectories.add(dirname(files.headerPath).replace(/\\/g, '/'))
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.headerPath, files.headerContent)
    )
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.sourcePath, files.sourceContent)
    )
  }

  // regenerate registries used by runtime lookups
  const animationRegistryFiles = buildAnimationRegistryFiles(spriteAssets)
  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      'src/Assets/Animations/AnimationRegistry.h',
      animationRegistryFiles.headerContent
    )
  )
  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      'src/Assets/Animations/AnimationRegistry.c',
      animationRegistryFiles.sourceContent
    )
  )
  const mapRegistryFiles = buildMapRegistryFiles(tilemapAssets, windowAssets, tilesetAssetsByPath)
  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      'src/Assets/Map/MapRegistry.h',
      mapRegistryFiles.headerContent
    )
  )
  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      'src/Assets/Map/MapRegistry.c',
      mapRegistryFiles.sourceContent
    )
  )
  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      'src/Actor/ActorRegistry.h',
      buildActorRegistryHeader(actorScripts, projectTagState.entries)
    )
  )
  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      'src/Scene/SceneRegistry.h',
      buildSceneRegistryHeader(sceneRecords.map((scene) => scene.identifier))
    )
  )

  // remove stale generated files/directories that are no longer referenced
  await removeLegacyGeneratedFiles(normalizedProjectPath)
  await syncManagedSceneFiles(normalizedProjectPath, managedScenePaths)
  await syncManagedResourceDirectories(normalizedProjectPath, [...managedResourceDirectories])

  // return build output details for UI/status reporting
  return {
    writtenFiles: writtenFiles.sort(),
    saveDataEntryCount: saveDataFiles.entryCount,
    spriteCount: spriteAssets.length,
    tilesetCount: tilesetAssets.length,
    tilemapCount: tilemapAssets.length,
    windowCount: windowAssets.length,
    sceneCount: sceneAssets.length,
    actorScriptCount: actorScripts.length,
    sceneScriptCount: sceneScripts.length
  }
}
