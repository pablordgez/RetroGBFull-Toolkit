import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, join, relative, resolve } from 'path'
import {
  loadProjectSaveDataState,
  loadProjectStartingScenePath,
  readProjectTrackedResourceBank,
  readProjectTrackedResourceBanks
} from './projectMetadata'
import { ProjectLauncherError, validateProjectDirectory } from './projectLauncher'
import { normalizeCodeIdentifier, normalizeCodeIdentifierStem } from '../shared/codeIdentifiers'
import type {
  BuildProjectCodeResult,
  CopyEngineCoreResult,
  GenerateProjectResourceFilesResult,
  ProjectScriptCallbackCandidate,
  ProjectScriptResourcePayload,
  ProjectScriptSavePayload
} from '../shared/projectCodeWorkspace'
import {
  type ProjectAssetDocument,
  type ProjectAssetKind,
  type SceneAssetCollisionNode,
  type SceneAssetDocument,
  type SceneAssetNode,
  type SpriteAssetDocument,
  type TilemapAssetDocument,
  type TilesetAssetDocument,
  type WindowAssetDocument,
  getProjectAssetDisplayName,
  getProjectAssetKindFromFileName,
  parseProjectAssetDocument
} from '../shared/projectAssets'
import { DEFAULT_PROJECT_RESOURCE_BANK } from '../shared/projectResourceModels'
import { validateProjectSaveDataEntries } from '../shared/projectSaveData'
import {
  type ProjectScriptKind,
  PROJECT_SCRIPT_DIRECTORY_BY_KIND,
  buildProjectScriptFileName,
  buildProjectScriptHeaderFileName,
  getProjectScriptDisplayName,
  getProjectScriptKindFromPath,
  isProjectScriptSourcePath
} from '../shared/projectScripts'

export interface ProjectScriptRecordLike {
  path: string
  name: string
  scriptKind: ProjectScriptKind
}

interface ProjectAssetRecordLike {
  kind: ProjectAssetKind
  path: string
  name: string
  identifier: string
  bank: number
  document: ProjectAssetDocument
}

interface ProjectScriptRecordResolved {
  kind: ProjectScriptKind
  path: string
  name: string
  identifier: string
  bank: number
}

interface BuiltSceneRecord {
  asset: ProjectAssetRecordLike
  identifier: string
  sourcePath: string
  headerPath: string
  bank: number
  isManagedFile: boolean
}

type SceneNodeEmitter = (
  node: SceneAssetNode,
  parentActorVariable: string | null,
  lines: string[],
  counters: { actor: number }
) => string | null

export const DEFAULT_TRACKED_CODE_FOLDERS = [
  'src',
  'src/CustomActors',
  'src/CustomScenes',
  'src/Scripts'
]

const RESERVED_CALLBACK_NAMES = new Set(['AINIT', 'AUPDATE', 'SINIT', 'SUPDATE'])
const IGNORED_PROJECT_RESOURCE_ROOT_DIRECTORIES = new Set(['deleted-resources'])
const INTERNAL_GENERATION_DIRECTORY = '.retrogbfull'
const RESOURCE_GENERATION_MANIFEST_PATH = `${INTERNAL_GENERATION_DIRECTORY}/resource-generation-manifest.json`
const SCRIPT_ENVIRONMENT_PATH = 'src/ScriptEnvironment.h'
const SAVE_DATA_HEADER_PATH = 'src/Saves/SaveData.h'
const SAVE_DATA_SOURCE_PATH = 'src/Saves/SaveData.c'
const MAIN_SOURCE_PATH = 'src/main.c'
const SAVE_DATA_VARIABLE_BEGIN = '    // BEGIN SAVE DATA VARIABLES'
const SAVE_DATA_VARIABLE_END = '    // END SAVE DATA VARIABLES'
const SAVE_DATA_INITIALIZATION_BEGIN = '    // BEGIN SAVE DATA VARIABLE INITIALIZATION'
const SAVE_DATA_INITIALIZATION_END = '    // END SAVE DATA VARIABLE INITIALIZATION'
const GENERATED_SCENE_BUILD_BEGIN = '    // BEGIN GENERATED SCENE INITIALIZATION'
const GENERATED_SCENE_BUILD_END = '    // END GENERATED SCENE INITIALIZATION'
const STARTING_SCENE_INCLUDE_BEGIN = '// BEGIN STARTING SCENE INCLUDE'
const STARTING_SCENE_INCLUDE_END = '// END STARTING SCENE INCLUDE'
const STARTING_SCENE_INSTANTIATION_BEGIN = '    // BEGIN STARTING SCENE INSTANTIATION'
const STARTING_SCENE_INSTANTIATION_END = '    // END STARTING SCENE INSTANTIATION'
const MANAGED_SCENE_FILE_MARKER = '// RETROGBFULL MANAGED SCENE FILE'
const MANAGED_DEFAULT_ACTOR_FILE_MARKER = '// RETROGBFULL MANAGED DEFAULT ACTOR FILE'
const CORE_PLACEHOLDER_SCENE_FILE_MARKER = '// RETROGBFULL CORE PLACEHOLDER SCENE'

interface ResourceGenerationManifest {
  version: 1
  resourceDirectories: string[]
}

const resolvePathWithinProject = (projectPath: string, resourcePath: string): string => {
  const absolutePath = resolve(projectPath, resourcePath)
  const relativePath = relative(projectPath, absolutePath)

  if (relativePath.startsWith('..')) {
    throw new ProjectLauncherError('The selected code file is outside the project directory.')
  }

  return absolutePath
}

const getBundledCorePath = (): string => {
  return resolve(__dirname, '../../../core')
}

let bundledGbdkPathOverride: string | null = null

const getBundledGbdkPath = (): string => {
  return bundledGbdkPathOverride ?? resolve(__dirname, '../../../gbdk')
}

const walkRelativePaths = async (
  basePath: string,
  currentPath = '',
  ignoredRootDirectories = new Set<string>()
): Promise<string[]> => {
  const absolutePath = currentPath ? join(basePath, currentPath) : basePath
  const entries = await readdir(absolutePath, { withFileTypes: true })
  const discoveredPaths: string[] = []

  for (const entry of entries) {
    if (!currentPath && entry.isDirectory() && ignoredRootDirectories.has(entry.name)) {
      continue
    }

    const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      discoveredPaths.push(relativePath)
      discoveredPaths.push(
        ...(await walkRelativePaths(basePath, relativePath, ignoredRootDirectories))
      )
      continue
    }

    discoveredPaths.push(relativePath)
  }

  return discoveredPaths
}

const cleanupBundledDirectoryInTarget = async (
  sourceBasePath: string,
  targetBasePath: string
): Promise<void> => {
  const relativePaths = await walkRelativePaths(sourceBasePath)

  for (const relativePath of relativePaths) {
    const sourcePath = join(sourceBasePath, relativePath)
    const targetPath = join(targetBasePath, relativePath)
    const sourceStats = await stat(sourcePath)

    if (sourceStats.isDirectory()) {
      continue
    }

    try {
      await rm(targetPath, { force: true })
    } catch {
      // Missing files are fine during a refresh.
    }
  }
}

const copyBundledDirectoryIntoTarget = async (
  sourceBasePath: string,
  targetBasePath: string
): Promise<{ copiedPaths: string[]; skippedPaths: string[] }> => {
  const relativePaths = await walkRelativePaths(sourceBasePath)
  const copiedPaths: string[] = []
  const skippedPaths: string[] = []

  for (const relativePath of relativePaths) {
    const sourcePath = join(sourceBasePath, relativePath)
    const targetPath = join(targetBasePath, relativePath)
    const sourceStats = await stat(sourcePath)

    if (sourceStats.isDirectory()) {
      await mkdir(targetPath, { recursive: true })
      continue
    }

    try {
      await stat(targetPath)
      skippedPaths.push(relativePath.replace(/\\/g, '/'))
      continue
    } catch {
      await mkdir(dirname(targetPath), { recursive: true })
      await cp(sourcePath, targetPath, { recursive: false, errorOnExist: true })
      copiedPaths.push(relativePath.replace(/\\/g, '/'))
    }
  }

  return {
    copiedPaths,
    skippedPaths
  }
}

const escapeHeaderGuardName = (scriptName: string): string => {
  return `${normalizeCodeIdentifier(scriptName).toUpperCase()}_H`
}

const buildManagedSourcePrefix = (scriptFileStem: string, bank: number): string => {
  return `#pragma bank ${bank}\n#include "${scriptFileStem}.h"\n#include "ScriptEnvironment.h"\n\n`
}

const buildActorHeaderTemplate = (scriptIdentifier: string): string => {
  const headerGuard = escapeHeaderGuardName(scriptIdentifier)

  return `#ifndef ${headerGuard}\n#define ${headerGuard}\n#include "Actor/Actor.h"\n\ntypedef struct {\n    Actor base;\n} ${scriptIdentifier};\n\n#endif // ${headerGuard}\n`
}

const buildSceneHeaderTemplate = (scriptIdentifier: string): string => {
  const headerGuard = escapeHeaderGuardName(scriptIdentifier)

  return `#ifndef ${headerGuard}\n#define ${headerGuard}\n#include "Scene/Scene.h"\n\ntypedef struct {\n    Scene base;\n} ${scriptIdentifier};\n\n#endif // ${headerGuard}\n`
}

const buildGeneralHeaderTemplate = (scriptIdentifier: string): string => {
  const headerGuard = escapeHeaderGuardName(scriptIdentifier)
  return `#ifndef ${headerGuard}\n#define ${headerGuard}\n\n#endif // ${headerGuard}\n`
}

const buildActorSourceTemplate = (scriptIdentifier: string): string => {
  return `void AINIT(void){\n    ${scriptIdentifier}* self = (${scriptIdentifier}*) THIS_ACTOR;\n    init_actor(&self->base);\n}\n\nvoid AUPDATE(void){\n\n}\n`
}

const buildSceneSourceTemplate = (scriptIdentifier: string): string => {
  return `void SINIT(void) BANKED{\n    ${scriptIdentifier}* scene = (${scriptIdentifier}*) THIS_SCENE;\n    init_scene(&scene->base);\n}\n\nvoid SUPDATE(void){\n    update_actors();\n    draw_actors();\n}\n`
}

const buildGeneralSourceTemplate = (): string => {
  return ''
}

const buildScriptTemplates = (
  scriptKind: ProjectScriptKind,
  scriptName: string,
  bank = DEFAULT_PROJECT_RESOURCE_BANK
): { managedSourcePrefix: string; editableSourceContent: string; headerContent: string } => {
  const scriptFileStem = getProjectScriptDisplayName(scriptName)
  const scriptIdentifier = normalizeCodeIdentifier(scriptFileStem)

  switch (scriptKind) {
    case 'actor':
      return {
        managedSourcePrefix: buildManagedSourcePrefix(scriptFileStem, bank),
        editableSourceContent: buildActorSourceTemplate(scriptIdentifier),
        headerContent: buildActorHeaderTemplate(scriptIdentifier)
      }
    case 'scene':
      return {
        managedSourcePrefix: buildManagedSourcePrefix(scriptFileStem, bank),
        editableSourceContent: buildSceneSourceTemplate(scriptIdentifier),
        headerContent: buildSceneHeaderTemplate(scriptIdentifier)
      }
    case 'general':
      return {
        managedSourcePrefix: buildManagedSourcePrefix(scriptFileStem, bank),
        editableSourceContent: buildGeneralSourceTemplate(),
        headerContent: buildGeneralHeaderTemplate(scriptIdentifier)
      }
  }
}

const splitEditableSourceContent = (sourceContent: string): string => {
  const sourceLines = sourceContent.split('\n')
  let index = 0

  if (/^#pragma\s+bank\s+\d+\s*$/.test(sourceLines[index]?.trim() ?? '')) {
    index += 1
  }

  if (/^\s*#include\s+"[^"]+\.h"\s*$/.test(sourceLines[index] ?? '')) {
    index += 1
  }

  if (
    ['#include "Generated/ScriptEnvironment.h"', '#include "ScriptEnvironment.h"'].includes(
      (sourceLines[index] ?? '').trim()
    )
  ) {
    index += 1
  }

  while (index < sourceLines.length && (sourceLines[index] ?? '').trim() === '') {
    index += 1
  }

  return sourceLines.slice(index).join('\n')
}

const extractManagedSourceBank = (sourceContent: string): number | null => {
  const firstLine = sourceContent.split('\n', 1)[0]?.trim() ?? ''
  const match = firstLine.match(/^#pragma\s+bank\s+(\d+)\s*$/)

  if (!match) {
    return null
  }

  const parsedBank = Number(match[1])
  return Number.isInteger(parsedBank) ? parsedBank : null
}

const getScriptFilePaths = (
  scriptKind: ProjectScriptKind,
  scriptName: string,
  resourcePath?: string
): { resourcePath: string; sourcePath: string; headerPath: string } => {
  const sourcePath =
    resourcePath ??
    `${PROJECT_SCRIPT_DIRECTORY_BY_KIND[scriptKind]}/${buildProjectScriptFileName(scriptName)}`

  return {
    resourcePath: sourcePath,
    sourcePath,
    headerPath: `${dirname(sourcePath).replace(/\\/g, '/')}/${buildProjectScriptHeaderFileName(scriptName)}`
  }
}

const replaceManagedBlock = (
  fileContent: string,
  beginMarker: string,
  endMarker: string,
  nextLines: string[]
): string => {
  const beginIndex = fileContent.indexOf(beginMarker)
  const endIndex = fileContent.indexOf(endMarker)

  if (beginIndex < 0 || endIndex < 0 || endIndex < beginIndex) {
    throw new ProjectLauncherError(
      `The managed save-data markers could not be found in ${beginMarker.includes('INITIALIZATION') ? SAVE_DATA_SOURCE_PATH : SAVE_DATA_HEADER_PATH}.`
    )
  }

  const beforeContent = fileContent.slice(0, beginIndex + beginMarker.length)
  const afterContent = fileContent.slice(endIndex)
  const insertedContent = nextLines.length > 0 ? `\n${nextLines.join('\n')}\n\n` : '\n\n'

  return `${beforeContent}${insertedContent}${afterContent}`
}

const writeProjectSaveDataFiles = async (
  projectPath: string
): Promise<{ writtenFiles: string[]; entryCount: number }> => {
  const saveDataState = await loadProjectSaveDataState(projectPath)
  const validationIssues = validateProjectSaveDataEntries(saveDataState.entries)

  if (validationIssues.length > 0) {
    throw new ProjectLauncherError(validationIssues[0].message)
  }

  const headerAbsolutePath = resolvePathWithinProject(projectPath, SAVE_DATA_HEADER_PATH)
  const sourceAbsolutePath = resolvePathWithinProject(projectPath, SAVE_DATA_SOURCE_PATH)
  const [headerContent, sourceContent] = await Promise.all([
    readFile(headerAbsolutePath, 'utf-8'),
    readFile(sourceAbsolutePath, 'utf-8')
  ])

  const variableLines = saveDataState.entries.map((entry) => {
    return `    ${entry.type.trim()} ${entry.name.trim()};`
  })
  const initializationLines = saveDataState.entries.map((entry) => {
    return `    save_data.${entry.name.trim()} = ${entry.defaultValue.trim()};`
  })

  const nextHeaderContent = replaceManagedBlock(
    headerContent,
    SAVE_DATA_VARIABLE_BEGIN,
    SAVE_DATA_VARIABLE_END,
    variableLines
  )
  const nextSourceContent = replaceManagedBlock(
    sourceContent,
    SAVE_DATA_INITIALIZATION_BEGIN,
    SAVE_DATA_INITIALIZATION_END,
    initializationLines
  )

  const writtenFiles = await Promise.all([
    writeManagedTextFile(projectPath, SAVE_DATA_HEADER_PATH, nextHeaderContent),
    writeManagedTextFile(projectPath, SAVE_DATA_SOURCE_PATH, nextSourceContent)
  ])

  return {
    writtenFiles,
    entryCount: saveDataState.entries.length
  }
}

const stripGeneratedSceneInitializationBlock = (sourceContent: string): string => {
  const blockPattern = new RegExp(
    `\\n?${GENERATED_SCENE_BUILD_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${GENERATED_SCENE_BUILD_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`,
    'g'
  )

  return sourceContent.replace(blockPattern, '\n')
}

const findMatchingBraceIndex = (sourceContent: string, openingBraceIndex: number): number => {
  let depth = 0

  for (let index = openingBraceIndex; index < sourceContent.length; index += 1) {
    const character = sourceContent[index]

    if (character === '{') {
      depth += 1
      continue
    }

    if (character === '}') {
      depth -= 1

      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

const injectGeneratedSceneInitializationBlock = (
  sourceContent: string,
  initializationLines: string[]
): string => {
  const strippedSourceContent = stripGeneratedSceneInitializationBlock(sourceContent)

  if (initializationLines.length === 0) {
    return strippedSourceContent
  }

  const sinitMatch = strippedSourceContent.match(
    /void\s+SINIT\s*\(\s*void\s*\)\s*(?:BANKED|NONBANKED)?\s*\{/
  )

  if (!sinitMatch || typeof sinitMatch.index !== 'number') {
    throw new ProjectLauncherError(
      'Scene scripts must define `void SINIT(void) BANKED` so build-time scene initialization can be injected.'
    )
  }

  const openingBraceIndex = strippedSourceContent.indexOf('{', sinitMatch.index)
  const closingBraceIndex = findMatchingBraceIndex(strippedSourceContent, openingBraceIndex)

  if (openingBraceIndex < 0 || closingBraceIndex < 0) {
    throw new ProjectLauncherError(
      'The scene SINIT function could not be parsed for generated initialization.'
    )
  }

  const functionBody = strippedSourceContent.slice(openingBraceIndex + 1, closingBraceIndex)
  const initSceneMatch = functionBody.match(/^[ \t]*.*init_scene\s*\([^)]*\)\s*;.*$/m)
  const blockLines = [
    GENERATED_SCENE_BUILD_BEGIN,
    ...initializationLines,
    GENERATED_SCENE_BUILD_END
  ]
  const blockText = `${blockLines.join('\n')}\n`

  if (initSceneMatch && typeof initSceneMatch.index === 'number') {
    const insertionOffset = initSceneMatch.index + initSceneMatch[0].length
    const insertionIndex = openingBraceIndex + 1 + insertionOffset

    return `${strippedSourceContent.slice(0, insertionIndex)}\n${blockText}${strippedSourceContent.slice(insertionIndex)}`
  }

  return `${strippedSourceContent.slice(0, openingBraceIndex + 1)}\n${blockText}${strippedSourceContent.slice(openingBraceIndex + 1)}`
}

const getProjectScriptHeaderPath = (resourcePath: string): string => {
  return `${dirname(resourcePath).replace(/\\/g, '/')}/${buildProjectScriptHeaderFileName(getProjectScriptDisplayName(basename(resourcePath)))}`
}

const buildManagedSceneFileContents = (
  sceneIdentifier: string,
  bank: number,
  initializationLines: string[]
): { headerContent: string; sourceContent: string } => {
  const sourceContent = injectGeneratedSceneInitializationBlock(
    `${buildManagedSourcePrefix(sceneIdentifier, bank)}${MANAGED_SCENE_FILE_MARKER}\n\n${buildSceneSourceTemplate(sceneIdentifier)}`,
    initializationLines
  )

  return {
    headerContent: `${MANAGED_SCENE_FILE_MARKER}\n${buildSceneHeaderTemplate(sceneIdentifier)}`,
    sourceContent
  }
}

const buildManagedDefaultActorFileContents = (
  actorIdentifier: string,
  bank: number
): { headerContent: string; sourceContent: string } => {
  return {
    headerContent: `${MANAGED_DEFAULT_ACTOR_FILE_MARKER}\n${buildActorHeaderTemplate(actorIdentifier)}`,
    sourceContent: `${buildManagedSourcePrefix(actorIdentifier, bank)}${MANAGED_DEFAULT_ACTOR_FILE_MARKER}\n\n${buildActorSourceTemplate(actorIdentifier)}`
  }
}

const removeLegacyGeneratedFiles = async (projectPath: string): Promise<void> => {
  const generatedDirectoryPath = resolvePathWithinProject(projectPath, 'src/Generated')

  await Promise.all([
    rm(resolvePathWithinProject(projectPath, 'src/Generated/ProjectBindings.h'), { force: true }),
    rm(resolvePathWithinProject(projectPath, 'src/Generated/ProjectBindings.c'), { force: true }),
    rm(resolvePathWithinProject(projectPath, 'src/Generated/ScriptEnvironment.h'), { force: true })
  ])

  try {
    const remainingEntries = await readdir(generatedDirectoryPath)

    if (remainingEntries.length === 0) {
      await rm(generatedDirectoryPath, { recursive: true, force: true })
    }
  } catch {
    // The legacy directory does not exist in all projects.
  }
}

const syncManagedSceneFiles = async (projectPath: string, keepPaths: string[]): Promise<void> => {
  const customScenesPath = resolvePathWithinProject(projectPath, 'src/CustomScenes')
  const keepPathSet = new Set(keepPaths.map((path) => path.replace(/\\/g, '/')))

  try {
    const relativePaths = await walkRelativePaths(customScenesPath)

    for (const relativePath of relativePaths) {
      if (!relativePath.endsWith('.c') && !relativePath.endsWith('.h')) {
        continue
      }

      const projectRelativePath = `src/CustomScenes/${relativePath.replace(/\\/g, '/')}`

      if (keepPathSet.has(projectRelativePath)) {
        continue
      }

      const absolutePath = resolvePathWithinProject(projectPath, projectRelativePath)
      const fileContent = await readFile(absolutePath, 'utf-8')

      if (!fileContent.includes(MANAGED_SCENE_FILE_MARKER)) {
        continue
      }

      await rm(absolutePath, { force: true })
    }
  } catch {
    // Custom scenes may not exist in invalid or half-built projects yet.
  }
}

const rewriteStartingSceneInMain = async (
  projectPath: string,
  sceneIdentifier: string
): Promise<string> => {
  const mainAbsolutePath = resolvePathWithinProject(projectPath, MAIN_SOURCE_PATH)
  const mainContent = await readFile(mainAbsolutePath, 'utf-8')
  let nextMainContent = mainContent

  if (
    mainContent.includes(STARTING_SCENE_INCLUDE_BEGIN) &&
    mainContent.includes(STARTING_SCENE_INCLUDE_END)
  ) {
    nextMainContent = replaceManagedBlock(
      nextMainContent,
      STARTING_SCENE_INCLUDE_BEGIN,
      STARTING_SCENE_INCLUDE_END,
      [`#include "CustomScenes/${sceneIdentifier}.h"`]
    )
  } else {
    nextMainContent = nextMainContent.replace(
      /#include\s+"CustomScenes\/[^"]+\.h"/,
      `#include "CustomScenes/${sceneIdentifier}.h"`
    )
  }

  if (
    nextMainContent.includes(STARTING_SCENE_INSTANTIATION_BEGIN) &&
    nextMainContent.includes(STARTING_SCENE_INSTANTIATION_END)
  ) {
    nextMainContent = replaceManagedBlock(
      nextMainContent,
      STARTING_SCENE_INSTANTIATION_BEGIN,
      STARTING_SCENE_INSTANTIATION_END,
      [
        `    ${sceneIdentifier} ss;`,
        `    ss.base.type = _${sceneIdentifier};`,
        '',
        '    set_scene((Scene*) &ss);'
      ]
    )
  } else {
    nextMainContent = nextMainContent.replace(
      /[ \t]*[A-Za-z_][A-Za-z0-9_]*\s+ss;\r?\n[ \t]*ss\.base\.type\s*=\s*_[A-Za-z_][A-Za-z0-9_]*;\r?\n(?:\r?\n)?[ \t]*set_scene\(\(Scene\*\)\s*&ss\);\r?\n/,
      `    ${sceneIdentifier} ss;\n    ss.base.type = _${sceneIdentifier};\n\n    set_scene((Scene*) &ss);\n`
    )
  }

  if (nextMainContent === mainContent) {
    const alreadyIncludesStartingScene = mainContent.includes(
      `#include "CustomScenes/${sceneIdentifier}.h"`
    )
    const alreadyInstantiatesStartingScene = mainContent.includes(
      `ss.base.type = _${sceneIdentifier};`
    )

    if (!alreadyIncludesStartingScene || !alreadyInstantiatesStartingScene) {
      throw new ProjectLauncherError(
        'The project main.c file could not be updated with the selected starting scene.'
      )
    }

    return MAIN_SOURCE_PATH
  }

  await writeFile(mainAbsolutePath, nextMainContent, 'utf-8')

  return MAIN_SOURCE_PATH
}

const rewriteManagedProjectScriptSource = async (
  projectPath: string,
  script: ProjectScriptRecordResolved
): Promise<string> => {
  const sourceAbsolutePath = resolvePathWithinProject(projectPath, script.path)
  const existingSourceContent = await readFile(sourceAbsolutePath, 'utf-8')
  const editableSourceContent = splitEditableSourceContent(existingSourceContent)
  const managedSourcePrefix = buildManagedSourcePrefix(script.name, script.bank)

  await writeFile(sourceAbsolutePath, `${managedSourcePrefix}${editableSourceContent}`, 'utf-8')

  return script.path.replace(/\\/g, '/')
}

const rewriteScriptedSceneInitialization = async (
  projectPath: string,
  sceneScript: ProjectScriptRecordResolved,
  initializationLines: string[]
): Promise<string> => {
  const sourceAbsolutePath = resolvePathWithinProject(projectPath, sceneScript.path)
  const sourceContent = await readFile(sourceAbsolutePath, 'utf-8')
  const nextSourceContent = injectGeneratedSceneInitializationBlock(sourceContent, initializationLines)

  await writeFile(sourceAbsolutePath, nextSourceContent, 'utf-8')

  return sceneScript.path.replace(/\\/g, '/')
}

const ensureProjectDirectory = async (projectPath: string): Promise<string> => {
  const validation = await validateProjectDirectory(projectPath)

  if (!validation.isValid) {
    throw new ProjectLauncherError(
      validation.message ?? 'The selected project could not be loaded.'
    )
  }

  return validation.path
}

export const copyBundledEngineCore = async (projectPath: string): Promise<CopyEngineCoreResult> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const bundledCorePath = getBundledCorePath()

  await cleanupBundledDirectoryInTarget(bundledCorePath, normalizedProjectPath)

  const { copiedPaths, skippedPaths } = await copyBundledDirectoryIntoTarget(
    bundledCorePath,
    normalizedProjectPath
  )

  await writeGeneratedScriptEnvironment(normalizedProjectPath)

  return {
    copiedPaths,
    skippedPaths
  }
}

export const setBundledGbdkPathForTests = (path: string | null): void => {
  bundledGbdkPathOverride = path
}

const ensureBundledGbdkAvailableForProject = async (
  projectPath: string
): Promise<{ copiedPaths: string[]; skippedPaths: string[] }> => {
  const bundledGbdkPath = getBundledGbdkPath()
  const projectParentPath = dirname(projectPath)
  const targetGbdkPath = join(projectParentPath, 'gbdk')

  try {
    const bundledGbdkStats = await stat(bundledGbdkPath)

    if (!bundledGbdkStats.isDirectory()) {
      throw new ProjectLauncherError('The bundled GBDK directory could not be found.')
    }
  } catch {
    throw new ProjectLauncherError('The bundled GBDK directory could not be found.')
  }

  return copyBundledDirectoryIntoTarget(bundledGbdkPath, targetGbdkPath)
}

const buildScriptEnvironmentHeaderContent = (
  scriptHeaderIncludes: string[]
): string => {
  return `#ifndef SCRIPT_ENVIRONMENT_H\n#define SCRIPT_ENVIRONMENT_H\n#include "MainDefinitions.h"\n#include "Actor/Actor.h"\n#include "Scene/Scene.h"\n#include "Collisions/CollisionManager.h"\n#include "Collisions/ColliderRegistry.h"\n#include "Assets/Animations/AnimationRegistry.h"\n#include "Assets/Map/MapRegistry.h"\n#include "Assets/Music/SongRegistry.h"\n#include "Saves/SaveData.h"\n${scriptHeaderIncludes.length > 0 ? `${scriptHeaderIncludes.join('\n')}\n` : ''}#include <gb/gb.h>\n#include <stdint.h>\n#include <stdio.h>\n#include <string.h>\n\n#endif // SCRIPT_ENVIRONMENT_H\n`
}

export const writeGeneratedScriptEnvironment = async (projectPath: string): Promise<void> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const headerPath = resolvePathWithinProject(normalizedProjectPath, SCRIPT_ENVIRONMENT_PATH)
  const scriptRecords = await loadProjectScriptRecords(normalizedProjectPath)
  const scriptHeaderIncludes = [...new Set(
    scriptRecords.map((script) => {
      const headerPath = getProjectScriptHeaderPath(script.path).replace(/\\/g, '/')
      return `#include "${headerPath.replace(/^src\//, '')}"`
    })
  )].sort((left, right) => left.localeCompare(right))
  const headerContent = buildScriptEnvironmentHeaderContent(scriptHeaderIncludes)

  await mkdir(dirname(headerPath), { recursive: true })
  await writeFile(headerPath, headerContent, 'utf-8')
}

export const createProjectScriptFiles = async (
  projectPath: string,
  scriptKind: ProjectScriptKind,
  scriptName: string,
  resourcePath?: string,
  bank = DEFAULT_PROJECT_RESOURCE_BANK
): Promise<{ resourcePath: string; sourcePath: string; headerPath: string }> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const nextScriptName = normalizeCodeIdentifier(scriptName)
  const paths = getScriptFilePaths(scriptKind, nextScriptName, resourcePath)
  const templates = buildScriptTemplates(scriptKind, nextScriptName, bank)
  const sourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, paths.sourcePath)
  const headerAbsolutePath = resolvePathWithinProject(normalizedProjectPath, paths.headerPath)

  await mkdir(dirname(sourceAbsolutePath), { recursive: true })
  await mkdir(dirname(headerAbsolutePath), { recursive: true })
  await writeFile(
    sourceAbsolutePath,
    `${templates.managedSourcePrefix}${templates.editableSourceContent}`,
    'utf-8'
  )
  await writeFile(headerAbsolutePath, templates.headerContent, 'utf-8')
  await writeGeneratedScriptEnvironment(normalizedProjectPath)

  return paths
}

export const loadProjectScriptResource = async (
  projectPath: string,
  resourcePath: string,
  scriptKind: ProjectScriptKind
): Promise<ProjectScriptResourcePayload> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const scriptName = getProjectScriptDisplayName(basename(resourcePath))
  const paths = getScriptFilePaths(scriptKind, scriptName, resourcePath)
  const sourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, paths.sourcePath)
  const headerAbsolutePath = resolvePathWithinProject(normalizedProjectPath, paths.headerPath)
  const bank = await readProjectTrackedResourceBank(normalizedProjectPath, paths.resourcePath)
  const sourceContent = await readFile(sourceAbsolutePath, 'utf-8')
  const headerContent = await readFile(headerAbsolutePath, 'utf-8')
  const { managedSourcePrefix } = buildScriptTemplates(scriptKind, scriptName, bank)
  const editableSourceContent = stripGeneratedSceneInitializationBlock(
    splitEditableSourceContent(sourceContent)
  )

  return {
    resourcePath: paths.resourcePath,
    scriptKind,
    displayName: scriptName,
    sourcePath: paths.sourcePath,
    headerPath: paths.headerPath,
    sourceContent,
    editableSourceContent,
    managedSourcePrefix,
    headerContent
  }
}

export const saveProjectScriptResource = async (
  projectPath: string,
  resourcePath: string,
  scriptKind: ProjectScriptKind,
  editableSourceContent: string,
  headerContent: string
): Promise<ProjectScriptSavePayload> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const scriptName = getProjectScriptDisplayName(basename(resourcePath))
  const paths = getScriptFilePaths(scriptKind, scriptName, resourcePath)
  const sourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, paths.sourcePath)
  const headerAbsolutePath = resolvePathWithinProject(normalizedProjectPath, paths.headerPath)
  const bank = await readProjectTrackedResourceBank(normalizedProjectPath, paths.resourcePath)
  const { managedSourcePrefix } = buildScriptTemplates(scriptKind, scriptName, bank)
  const sourceContent = `${managedSourcePrefix}${editableSourceContent}`

  await writeFile(sourceAbsolutePath, sourceContent, 'utf-8')
  await writeFile(headerAbsolutePath, headerContent, 'utf-8')
  await writeGeneratedScriptEnvironment(normalizedProjectPath)

  return {
    resourcePath: paths.resourcePath,
    scriptKind,
    sourceContent,
    headerContent
  }
}

export const renameProjectScriptFiles = async (
  projectPath: string,
  resourcePath: string,
  nextResourcePath: string
): Promise<void> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const sourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, resourcePath)
  const headerAbsolutePath = resolvePathWithinProject(
    normalizedProjectPath,
    `${dirname(resourcePath).replace(/\\/g, '/')}/${buildProjectScriptHeaderFileName(getProjectScriptDisplayName(basename(resourcePath)))}`
  )
  const nextSourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, nextResourcePath)
  const nextHeaderAbsolutePath = resolvePathWithinProject(
    normalizedProjectPath,
    `${dirname(nextResourcePath).replace(/\\/g, '/')}/${buildProjectScriptHeaderFileName(getProjectScriptDisplayName(basename(nextResourcePath)))}`
  )

  await mkdir(dirname(nextSourceAbsolutePath), { recursive: true })
  await rename(sourceAbsolutePath, nextSourceAbsolutePath)
  await rename(headerAbsolutePath, nextHeaderAbsolutePath)

  const previousScriptName = getProjectScriptDisplayName(basename(resourcePath))
  const nextScriptName = getProjectScriptDisplayName(basename(nextResourcePath))
  const previousIdentifier = normalizeCodeIdentifier(previousScriptName)
  const nextIdentifier = normalizeCodeIdentifier(nextScriptName)
  const [movedSourceContent, movedHeaderContent] = await Promise.all([
    readFile(nextSourceAbsolutePath, 'utf-8'),
    readFile(nextHeaderAbsolutePath, 'utf-8')
  ])
  const nextManagedSourcePrefix = buildManagedSourcePrefix(
    nextScriptName,
    extractManagedSourceBank(movedSourceContent) ?? DEFAULT_PROJECT_RESOURCE_BANK
  )

  const updatedSourceContent = splitEditableSourceContent(
    movedSourceContent
      .replaceAll(`${previousIdentifier.toUpperCase()}_H`, `${nextIdentifier.toUpperCase()}_H`)
      .replace(new RegExp(`\\b${previousIdentifier}\\b`, 'g'), nextIdentifier)
  )
  const updatedHeaderContent = movedHeaderContent
    .replaceAll(`${previousIdentifier.toUpperCase()}_H`, `${nextIdentifier.toUpperCase()}_H`)
    .replace(new RegExp(`\\b${previousIdentifier}\\b`, 'g'), nextIdentifier)

  await writeFile(
    nextSourceAbsolutePath,
    `${nextManagedSourcePrefix}${updatedSourceContent}`,
    'utf-8'
  )
  await writeFile(nextHeaderAbsolutePath, updatedHeaderContent, 'utf-8')
  await writeGeneratedScriptEnvironment(normalizedProjectPath)
}

export const moveProjectScriptFilesToDeletedContainer = async (
  projectPath: string,
  resourcePath: string,
  deletedContentPath: string
): Promise<void> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const containerAbsolutePath = resolvePathWithinProject(normalizedProjectPath, deletedContentPath)
  const sourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, resourcePath)
  const headerAbsolutePath = resolvePathWithinProject(
    normalizedProjectPath,
    `${dirname(resourcePath).replace(/\\/g, '/')}/${buildProjectScriptHeaderFileName(getProjectScriptDisplayName(basename(resourcePath)))}`
  )

  await mkdir(containerAbsolutePath, { recursive: true })
  await rename(sourceAbsolutePath, join(containerAbsolutePath, basename(resourcePath)))
  await rename(
    headerAbsolutePath,
    join(
      containerAbsolutePath,
      buildProjectScriptHeaderFileName(getProjectScriptDisplayName(basename(resourcePath)))
    )
  )
  await writeGeneratedScriptEnvironment(normalizedProjectPath)
}

export const restoreProjectScriptFilesFromDeletedContainer = async (
  projectPath: string,
  resourcePath: string,
  deletedContentPath: string
): Promise<void> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const containerAbsolutePath = resolvePathWithinProject(normalizedProjectPath, deletedContentPath)
  const sourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, resourcePath)
  const headerAbsolutePath = resolvePathWithinProject(
    normalizedProjectPath,
    `${dirname(resourcePath).replace(/\\/g, '/')}/${buildProjectScriptHeaderFileName(getProjectScriptDisplayName(basename(resourcePath)))}`
  )

  await mkdir(dirname(sourceAbsolutePath), { recursive: true })
  await rename(join(containerAbsolutePath, basename(resourcePath)), sourceAbsolutePath)
  await rename(
    join(
      containerAbsolutePath,
      buildProjectScriptHeaderFileName(getProjectScriptDisplayName(basename(resourcePath)))
    ),
    headerAbsolutePath
  )
  await writeGeneratedScriptEnvironment(normalizedProjectPath)
}

export const transferProjectScriptFiles = async (
  projectPath: string,
  resourcePath: string,
  destinationResourcePath: string,
  mode: 'copy' | 'move'
): Promise<void> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const sourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, resourcePath)
  const headerAbsolutePath = resolvePathWithinProject(
    normalizedProjectPath,
    `${dirname(resourcePath).replace(/\\/g, '/')}/${buildProjectScriptHeaderFileName(getProjectScriptDisplayName(basename(resourcePath)))}`
  )
  const destinationSourceAbsolutePath = resolvePathWithinProject(
    normalizedProjectPath,
    destinationResourcePath
  )
  const destinationHeaderAbsolutePath = resolvePathWithinProject(
    normalizedProjectPath,
    `${dirname(destinationResourcePath).replace(/\\/g, '/')}/${buildProjectScriptHeaderFileName(getProjectScriptDisplayName(basename(destinationResourcePath)))}`
  )

  await mkdir(dirname(destinationSourceAbsolutePath), { recursive: true })

  if (mode === 'copy') {
    await cp(sourceAbsolutePath, destinationSourceAbsolutePath, { errorOnExist: true })
    await cp(headerAbsolutePath, destinationHeaderAbsolutePath, { errorOnExist: true })
    await writeGeneratedScriptEnvironment(normalizedProjectPath)
    return
  }

  await rename(sourceAbsolutePath, destinationSourceAbsolutePath)
  await rename(headerAbsolutePath, destinationHeaderAbsolutePath)
  await writeGeneratedScriptEnvironment(normalizedProjectPath)
}

export const scriptFilesExist = async (
  projectPath: string,
  resourcePath: string
): Promise<boolean> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const sourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, resourcePath)
  const headerAbsolutePath = resolvePathWithinProject(
    normalizedProjectPath,
    `${dirname(resourcePath).replace(/\\/g, '/')}/${buildProjectScriptHeaderFileName(getProjectScriptDisplayName(basename(resourcePath)))}`
  )

  try {
    const [sourceStats, headerStats] = await Promise.all([
      stat(sourceAbsolutePath),
      stat(headerAbsolutePath)
    ])
    return sourceStats.isFile() && headerStats.isFile()
  } catch {
    return false
  }
}

const CALLBACK_FUNCTION_PATTERN =
  /(^|\n)\s*(?!static\b)void\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*void\s*\)\s*(?:BANKED|NONBANKED)?\s*\{/g

export const listProjectScriptCallbackCandidates = async (
  projectPath: string,
  scripts: ProjectScriptRecordLike[]
): Promise<ProjectScriptCallbackCandidate[]> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const candidates: ProjectScriptCallbackCandidate[] = []

  for (const script of scripts) {
    const sourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, script.path)
    const sourceContent = await readFile(sourceAbsolutePath, 'utf-8')
    const seenFunctionNames = new Set<string>()

    for (const match of sourceContent.matchAll(CALLBACK_FUNCTION_PATTERN)) {
      const functionName = match[2]

      if (
        !functionName ||
        RESERVED_CALLBACK_NAMES.has(functionName) ||
        seenFunctionNames.has(functionName)
      ) {
        continue
      }

      seenFunctionNames.add(functionName)
      candidates.push({
        scriptPath: script.path,
        scriptKind: script.scriptKind,
        scriptName: script.name,
        functionName
      })
    }
  }

  return candidates.sort((left, right) => {
    if (left.scriptPath !== right.scriptPath) {
      return left.scriptPath.localeCompare(right.scriptPath)
    }

    return left.functionName.localeCompare(right.functionName)
  })
}

export const readMaxCollisionCallbacks = async (projectPath: string): Promise<number> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const headerPath = resolvePathWithinProject(
    normalizedProjectPath,
    'src/Collisions/ColliderRegistry.h'
  )
  const headerContent = await readFile(headerPath, 'utf-8')
  const match = headerContent.match(/#define\s+MAX_COLLISION_CALLBACKS\s+(\d+)/)
  return match ? Number(match[1]) : 4
}

const MANAGED_DEFAULT_ACTOR_IDENTIFIER = 'GeneratedDefaultActor'

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
  const manifestAbsolutePath = resolvePathWithinProject(projectPath, RESOURCE_GENERATION_MANIFEST_PATH)

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
  const manifestAbsolutePath = resolvePathWithinProject(projectPath, RESOURCE_GENERATION_MANIFEST_PATH)
  const manifest: ResourceGenerationManifest = {
    version: 1,
    resourceDirectories: [...new Set(resourceDirectories.map((path) => path.replace(/\\/g, '/')))].sort()
  }

  await mkdir(dirname(manifestAbsolutePath), { recursive: true })
  await writeFile(`${manifestAbsolutePath}`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
}

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

const isCanonicalProjectScriptPath = (resourcePath: string): boolean => {
  return (
    isProjectScriptSourcePath(resourcePath) && getProjectScriptKindFromPath(resourcePath) !== null
  )
}

const collectProjectResourcePaths = async (projectPath: string): Promise<string[]> => {
  return walkRelativePaths(projectPath, '', IGNORED_PROJECT_RESOURCE_ROOT_DIRECTORIES)
}

const loadProjectAssetRecords = async (projectPath: string): Promise<ProjectAssetRecordLike[]> => {
  const [relativePaths, trackedBanks] = await Promise.all([
    collectProjectResourcePaths(projectPath),
    readProjectTrackedResourceBanks(projectPath)
  ])
  const assetRecords: ProjectAssetRecordLike[] = []

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

const loadProjectScriptRecords = async (
  projectPath: string
): Promise<ProjectScriptRecordResolved[]> => {
  const [relativePaths, trackedBanks] = await Promise.all([
    collectProjectResourcePaths(projectPath),
    readProjectTrackedResourceBanks(projectPath)
  ])
  const scriptRecords: ProjectScriptRecordResolved[] = []

  for (const resourcePath of relativePaths) {
    if (!isCanonicalProjectScriptPath(resourcePath)) {
      continue
    }

    const scriptKind = getProjectScriptKindFromPath(resourcePath)

    if (!scriptKind) {
      continue
    }

    const absolutePath = resolvePathWithinProject(projectPath, resourcePath)
    const sourceContent = await readFile(absolutePath, 'utf-8')

    if (
      sourceContent.includes(MANAGED_SCENE_FILE_MARKER) ||
      sourceContent.includes(MANAGED_DEFAULT_ACTOR_FILE_MARKER) ||
      sourceContent.includes(CORE_PLACEHOLDER_SCENE_FILE_MARKER)
    ) {
      continue
    }

    const displayName = getProjectScriptDisplayName(basename(resourcePath))
    scriptRecords.push({
      kind: scriptKind,
      path: resourcePath.replace(/\\/g, '/'),
      name: displayName,
      identifier: normalizeCodeIdentifier(displayName),
      bank: trackedBanks.get(resourcePath.replace(/\\/g, '/')) ?? DEFAULT_PROJECT_RESOURCE_BANK
    })
  }

  return scriptRecords.sort((left, right) => left.path.localeCompare(right.path))
}

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
        identifier: sceneScript.identifier,
        sourcePath: sceneScript.path,
        headerPath: getProjectScriptHeaderPath(sceneScript.path),
        bank: sceneScript.bank,
        isManagedFile: false
      }
    }

    return {
      asset: scene,
      identifier: scene.identifier,
      sourcePath: `src/CustomScenes/${scene.identifier}.c`,
      headerPath: `src/CustomScenes/${scene.identifier}.h`,
      bank: DEFAULT_PROJECT_RESOURCE_BANK,
      isManagedFile: true
    }
  })
}

const formatConflictLines = (label: string, conflicts: Map<string, string[]>): string[] => {
  return [...conflicts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, paths]) => `- ${label} "${value}": ${paths.sort().join(', ')}`)
}

const assertNoManagedResourceConflicts = (
  assets: ProjectAssetRecordLike[],
  scripts: ProjectScriptRecordResolved[]
): void => {
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

  const duplicateDisplayNames = new Map(
    [...displayNameConflicts.entries()].filter(([, paths]) => paths.length > 1)
  )
  const duplicateIdentifiers = new Map(
    [...identifierConflicts.entries()].filter(([, paths]) => paths.length > 1)
  )

  if (duplicateDisplayNames.size === 0 && duplicateIdentifiers.size === 0) {
    return
  }

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

const formatHexByte = (value: number): string => {
  return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`
}

const formatByteArray = (values: number[], valuesPerLine = 16): string => {
  if (values.length === 0) {
    return ''
  }

  const lines: string[] = []

  for (let index = 0; index < values.length; index += valuesPerLine) {
    lines.push(
      values
        .slice(index, index + valuesPerLine)
        .map(formatHexByte)
        .join(',')
    )
  }

  return `${lines.join(',\n')}\n`
}

const buildTileBytes = (pixels: number[]): number[] => {
  const bytes: number[] = []

  for (let row = 0; row < 8; row += 1) {
    let lowByte = 0
    let highByte = 0

    for (let column = 0; column < 8; column += 1) {
      const color = pixels[row * 8 + column] ?? 0
      const bitShift = 7 - column
      lowByte |= (color & 1) << bitShift
      highByte |= ((color >> 1) & 1) << bitShift
    }

    bytes.push(lowByte, highByte)
  }

  return bytes
}

const buildSpriteFrameBytes = (document: SpriteAssetDocument): number[] => {
  const bytes: number[] = []
  const tilesAcross = Math.max(1, Math.floor(document.width / 8))
  const tilesDown = Math.max(1, Math.floor(document.height / 8))

  for (const frame of document.frames) {
    for (let tileY = 0; tileY < tilesDown; tileY += 1) {
      for (let tileX = 0; tileX < tilesAcross; tileX += 1) {
        const pixels: number[] = []

        for (let row = 0; row < 8; row += 1) {
          for (let column = 0; column < 8; column += 1) {
            const pixelIndex = (tileY * 8 + row) * document.width + (tileX * 8 + column)
            pixels.push(frame[pixelIndex] ?? 0)
          }
        }

        bytes.push(...buildTileBytes(pixels))
      }
    }
  }

  return bytes
}

const buildTilesetBytes = (document: TilesetAssetDocument): number[] => {
  return document.tiles.flatMap((tile) => buildTileBytes(tile))
}

const buildMetaspriteLines = (identifier: string, width: number, height: number): string[] => {
  const tilesAcross = Math.max(1, Math.floor(width / 8))
  const tilesDown = Math.max(1, Math.floor(height / 8))

  if (tilesAcross === 1 && tilesDown === 1) {
    return []
  }

  const lines: string[] = [`const metasprite_t ${identifier}_metasprite_data[] = {`]
  let previousX = 0
  let previousY = 0
  let tileIndex = 0

  for (let tileY = 0; tileY < tilesDown; tileY += 1) {
    for (let tileX = 0; tileX < tilesAcross; tileX += 1) {
      const absoluteX = tileX * 8 - Math.floor(width / 2)
      const absoluteY = tileY * 8 - Math.floor(height / 2)
      const deltaX = tileIndex === 0 ? absoluteX : absoluteX - previousX
      const deltaY = tileIndex === 0 ? absoluteY : absoluteY - previousY

      lines.push(`{ .dy=${deltaY}, .dx=${deltaX}, .dtile=${tileIndex}, .props=0 },`)
      previousX = absoluteX
      previousY = absoluteY
      tileIndex += 1
    }
  }

  lines.push('METASPR_TERM')
  lines.push('};')
  return lines
}

const buildAnimationDuration = (fps: number): number => {
  return Math.max(1, Math.round(60 / Math.max(1, fps)))
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

const buildSpriteResourceFiles = (
  sprite: ProjectAssetRecordLike
): { headerPath: string; sourcePath: string; headerContent: string; sourceContent: string } => {
  const document = sprite.document as SpriteAssetDocument
  const hasMetasprite = document.width > 8 || document.height > 8
  const resourceDirectory = `res/${sprite.identifier}`
  const headerPath = `${resourceDirectory}/${sprite.identifier}.h`
  const sourcePath = `${resourceDirectory}/${sprite.identifier}.c`
  const headerLines = [
    `#ifndef ${sprite.identifier.toUpperCase()}_H`,
    `#define ${sprite.identifier.toUpperCase()}_H`,
    '#include <stdint.h>',
    '#include <gb/gb.h>',
    ...(hasMetasprite ? ['#include <gb/metasprites.h>'] : []),
    '',
    `extern const uint8_t ${sprite.identifier}_sprite_data[];`,
    ...(hasMetasprite ? [`extern const metasprite_t ${sprite.identifier}_metasprite_data[];`] : []),
    '',
    `#endif /* ${sprite.identifier.toUpperCase()}_H */`,
    ''
  ]
  const metaspriteLines = buildMetaspriteLines(sprite.identifier, document.width, document.height)
  const sourceLines = [
    `#pragma bank ${sprite.bank}`,
    `#include "${sprite.identifier}.h"`,
    '',
    `BANKREF(${sprite.identifier}_bankref)`,
    '',
    `const uint8_t ${sprite.identifier}_sprite_data[] = {`,
    formatByteArray(buildSpriteFrameBytes(document)),
    '};',
    ...(metaspriteLines.length > 0 ? ['', ...metaspriteLines] : []),
    ''
  ]

  return {
    headerPath,
    sourcePath,
    headerContent: headerLines.join('\n'),
    sourceContent: sourceLines.join('\n')
  }
}

const buildTilesetResourceFiles = (
  tileset: ProjectAssetRecordLike
): { headerPath: string; sourcePath: string; headerContent: string; sourceContent: string } => {
  const document = tileset.document as TilesetAssetDocument
  const resourceDirectory = `res/${tileset.identifier}`
  const headerPath = `${resourceDirectory}/${tileset.identifier}.h`
  const sourcePath = `${resourceDirectory}/${tileset.identifier}.c`
  const headerLines = [
    `#ifndef ${tileset.identifier.toUpperCase()}_H`,
    `#define ${tileset.identifier.toUpperCase()}_H`,
    '#include <gb/gb.h>',
    '',
    `extern const uint8_t ${tileset.identifier}_tileset[];`,
    `#define ${tileset.identifier}_num_tiles ${document.tiles.length}`,
    '',
    `#endif /* ${tileset.identifier.toUpperCase()}_H */`,
    ''
  ]
  const sourceLines = [
    `#pragma bank ${tileset.bank}`,
    `#include "${tileset.identifier}.h"`,
    '',
    `BANKREF(${tileset.identifier}_bankref)`,
    '',
    `const uint8_t ${tileset.identifier}_tileset[] = {`,
    formatByteArray(buildTilesetBytes(document)),
    '};',
    ''
  ]

  return {
    headerPath,
    sourcePath,
    headerContent: headerLines.join('\n'),
    sourceContent: sourceLines.join('\n')
  }
}

const buildMapResourceFiles = (
  resource: ProjectAssetRecordLike,
  tileset: ProjectAssetRecordLike,
  windowTopEnd: number,
  windowBottomStart: number
): { headerPath: string; sourcePath: string; headerContent: string; sourceContent: string } => {
  const document = resource.document as TilemapAssetDocument | WindowAssetDocument
  const tilesetDocument = tileset.document as TilesetAssetDocument
  const resourceDirectory = `res/${resource.identifier}`
  const headerPath = `${resourceDirectory}/${resource.identifier}.h`
  const sourcePath = `${resourceDirectory}/${resource.identifier}.c`
  const headerLines = [
    `#ifndef ${resource.identifier.toUpperCase()}_H`,
    `#define ${resource.identifier.toUpperCase()}_H`,
    '#include <gb/gb.h>',
    '',
    `extern const uint8_t ${resource.identifier}_map_data[];`,
    `extern const uint8_t ${resource.identifier}_tileset[];`,
    `#define ${resource.identifier}_num_tiles ${tilesetDocument.tiles.length}`,
    '',
    `#endif /* ${resource.identifier.toUpperCase()}_H */`,
    ''
  ]
  const sourceLines = [
    `#pragma bank ${resource.bank}`,
    `#include "${resource.identifier}.h"`,
    '',
    `BANKREF(${resource.identifier}_bankref)`,
    '',
    `const uint8_t ${resource.identifier}_map_data[] = {`,
    formatByteArray(document.grid),
    '};',
    '',
    `const uint8_t ${resource.identifier}_tileset[] = {`,
    formatByteArray(buildTilesetBytes(tilesetDocument)),
    '};',
    '',
    `/* window split: top=${windowTopEnd}, bottom=${windowBottomStart} */`,
    ''
  ]

  return {
    headerPath,
    sourcePath,
    headerContent: headerLines.join('\n'),
    sourceContent: sourceLines.join('\n')
  }
}

const buildAnimationRegistryFiles = (
  sprites: ProjectAssetRecordLike[]
): { headerContent: string; sourceContent: string } => {
  const includeLines = sprites.map(
    (sprite) => `#include "${sprite.identifier}/${sprite.identifier}.h"`
  )
  const enumLines =
    sprites.length > 0
      ? sprites.map((sprite) => `        ${sprite.identifier},`)
      : ['        NUMBER_OF_ANIMATIONS = 1']
  const headerContent = [
    '#ifndef ANIMATION_REGISTRY_H',
    '#define ANIMATION_REGISTRY_H',
    '#include "Assets/SpaceManager.h"',
    '#include "Animation.h"',
    '',
    ...includeLines,
    ...(includeLines.length > 0 ? [''] : []),
    'typedef enum {',
    ...enumLines,
    ...(sprites.length > 0 ? ['        NUMBER_OF_ANIMATIONS'] : []),
    '    } AnimationType;',
    '',
    'extern const Animation* animations[NUMBER_OF_ANIMATIONS];',
    'extern const AssetEntry animation_data[NUMBER_OF_ANIMATIONS];',
    '',
    '#endif /* ANIMATION_REGISTRY_H */',
    ''
  ].join('\n')

  if (sprites.length === 0) {
    return {
      headerContent,
      sourceContent: [
        '#include "AnimationRegistry.h"',
        '',
        'const Animation* animations[NUMBER_OF_ANIMATIONS] = {',
        '    (void*) 0',
        '};',
        '',
        'const AssetEntry animation_data[NUMBER_OF_ANIMATIONS] = {',
        '    {0, (void*) 0}',
        '};',
        ''
      ].join('\n')
    }
  }

  const animationDefinitionLines = sprites.flatMap((sprite) => {
    const document = sprite.document as SpriteAssetDocument
    const metaspriteExpression =
      document.width > 8 || document.height > 8
        ? `${sprite.identifier}_metasprite_data`
        : '(void*) 0'

    return [
      `const Animation _${sprite.identifier} = {`,
      `    .animation_id = ${sprite.identifier},`,
      `    .width = ${document.width},`,
      `    .height = ${document.height},`,
      `    .number_of_frames = ${document.frames.length},`,
      `    .frame_duration = ${buildAnimationDuration(document.fps)},`,
      `    .metasprite = ${metaspriteExpression}`,
      '};',
      ''
    ]
  })
  const bankRefLines = sprites.map((sprite) => `BANKREF_EXTERN(${sprite.identifier}_bankref)`)

  return {
    headerContent,
    sourceContent: [
      '#include "AnimationRegistry.h"',
      '',
      ...animationDefinitionLines,
      ...bankRefLines,
      '',
      'const Animation* animations[NUMBER_OF_ANIMATIONS] = {',
      ...sprites.map((sprite) => `    [${sprite.identifier}] = &_${sprite.identifier},`),
      '};',
      '',
      'const AssetEntry animation_data[NUMBER_OF_ANIMATIONS] = {',
      ...sprites.map(
        (sprite) =>
          `    [${sprite.identifier}] = {BANK(${sprite.identifier}_bankref), ${sprite.identifier}_sprite_data},`
      ),
      '};',
      ''
    ].join('\n')
  }
}

const buildMapRegistryFiles = (
  tilemaps: ProjectAssetRecordLike[],
  windows: ProjectAssetRecordLike[]
): { headerContent: string; sourceContent: string } => {
  const maps = [
    ...tilemaps.map((resource) => ({
      ...resource,
      windowTopEnd: 0,
      windowBottomStart: 0
    })),
    ...windows.map((resource) => {
      const document = resource.document as WindowAssetDocument
      return {
        ...resource,
        windowTopEnd: document.windowTopEnd,
        windowBottomStart: document.windowBottomStart
      }
    })
  ]
  const includeLines = maps.map((map) => `#include "${map.identifier}/${map.identifier}.h"`)
  const enumLines =
    maps.length > 0
      ? maps.map((map) => `        ${map.identifier},`)
      : ['        NUMBER_OF_MAPS = 1']
  const headerContent = [
    '#ifndef MAP_DECLARATIONS_H',
    '#define MAP_DECLARATIONS_H',
    '',
    '#include "Map.h"',
    '#include "Assets/SpaceManager.h"',
    ...includeLines,
    ...(includeLines.length > 0 ? [''] : []),
    'typedef enum {',
    ...enumLines,
    ...(maps.length > 0 ? ['        NUMBER_OF_MAPS'] : []),
    '    } MapType;',
    '',
    'extern Map* maps[NUMBER_OF_MAPS];',
    'extern const AssetEntry map_data[NUMBER_OF_MAPS];',
    '',
    '#endif /* MAP_DECLARATIONS_H */',
    ''
  ].join('\n')

  if (maps.length === 0) {
    return {
      headerContent,
      sourceContent: [
        '#include "MapRegistry.h"',
        '',
        'Map* maps[NUMBER_OF_MAPS] = {',
        '    (void*) 0',
        '};',
        '',
        'const AssetEntry map_data[NUMBER_OF_MAPS] = {',
        '    {0, (void*) 0}',
        '};',
        ''
      ].join('\n')
    }
  }

  const mapDefinitionLines = maps.flatMap((map) => {
    const document = map.document as TilemapAssetDocument | WindowAssetDocument
    return [
      `Map _${map.identifier} = {`,
      `    .id = ${map.identifier},`,
      `    .width = ${document.width},`,
      `    .height = ${document.height},`,
      `    .tileset = ${map.identifier}_tileset,`,
      `    .num_tiles = ${map.identifier}_num_tiles,`,
      '    .first_tile = 0,',
      `    .window_top_end = ${map.windowTopEnd},`,
      `    .window_bottom_start = ${map.windowBottomStart}`,
      '};',
      ''
    ]
  })
  const bankRefLines = maps.map((map) => `BANKREF_EXTERN(${map.identifier}_bankref)`)

  return {
    headerContent,
    sourceContent: [
      '#include "MapRegistry.h"',
      '',
      ...mapDefinitionLines,
      ...bankRefLines,
      '',
      'Map* maps[NUMBER_OF_MAPS] = {',
      ...maps.map((map) => `    [${map.identifier}] = &_${map.identifier},`),
      '};',
      '',
      'const AssetEntry map_data[NUMBER_OF_MAPS] = {',
      ...maps.map(
        (map) => `    [${map.identifier}] = {BANK(${map.identifier}_bankref), ${map.identifier}_map_data},`
      ),
      '};',
      ''
    ].join('\n')
  }
}

const buildActorRegistryHeader = (actorScripts: ProjectScriptRecordResolved[]): string => {
  const actors = [
    { identifier: MANAGED_DEFAULT_ACTOR_IDENTIFIER },
    ...actorScripts.map((script) => ({ identifier: script.identifier }))
  ]

  return [
    '#ifndef ACTOR_REGISTRY_H',
    '#define ACTOR_REGISTRY_H',
    '#include "MainDefinitions.h"',
    '#define ACTORS \\',
    ...actors.map((actor) => `    _ACTOR(${actor.identifier}) \\`),
    '',
    '#define _ACTOR(name) _##name,',
    'typedef enum {',
    '    ACTORS',
    '    NUM_ACTORS',
    '} ActorType;',
    '#undef _ACTOR',
    '',
    'extern RVoid_PVoid actor_update_functions[NUM_ACTORS];',
    'extern RVoid_PVoid actor_init_functions[NUM_ACTORS];',
    '',
    'void init_actor_functions(void);',
    '',
    '#define _ACTOR(name) \\',
    '    void Actor_Update_##name(void); \\',
    '    void Actor_Init_##name(void);',
    'ACTORS',
    '#undef _ACTOR',
    '',
    'typedef enum {',
    '    TAG_NONE,',
    '} Tags;',
    '',
    '#endif // ACTOR_REGISTRY_H',
    ''
  ].join('\n')
}

const buildSceneRegistryHeader = (sceneIdentifiers: string[]): string => {
  const scenes = Array.from(new Set(sceneIdentifiers.length > 0 ? sceneIdentifiers : ['SampleScene']))

  return [
    '#ifndef SCENE_REGISTRY_H',
    '#define SCENE_REGISTRY_H',
    '#include "../MainDefinitions.h"',
    '',
    '#define SCENES \\',
    ...scenes.map((sceneIdentifier) => `    _SCENE(${sceneIdentifier}) \\`),
    '',
    '#define _SCENE(name) _##name,',
    'typedef enum { ',
    '    SCENES ',
    '    NUM_SCENES ',
    '} SceneType; ',
    '#undef _SCENE',
    '',
    'extern RVoid_PVoid_BANKED scene_init_state_functions[NUM_SCENES];',
    'extern RVoid_PVoid scene_update_functions[NUM_SCENES]; ',
    '',
    'void init_scene_functions(void);',
    '',
    '#define _SCENE(name) \\',
    '    void scene_init_state_##name(void) BANKED; \\',
    '    void scene_update_##name(void); ',
    '    SCENES ',
    '#undef _SCENE',
    '',
    '#endif /* SCENE_REGISTRY_H */',
    ''
  ].join('\n')
}

const createNodeEmitter = (
  spriteAssetsByPath: Map<string, ProjectAssetRecordLike>,
  actorScriptsByPath: Map<string, ProjectScriptRecordResolved>
): SceneNodeEmitter => {
  const emitNode = (
    node: SceneAssetNode,
    parentActorVariable: string | null,
    lines: string[],
    counters: { actor: number }
  ): string | null => {
    if (node.type === 'folder') {
      for (const childNode of node.children) {
        emitNode(childNode, parentActorVariable, lines, counters)
      }

      return null
    }

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

      if (!parentActorVariable) {
        lines.push(`    Actor* ${actorVariable} = (Actor*) malloc(sizeof(Actor));`)
        lines.push(`    ${actorVariable}->type = _${MANAGED_DEFAULT_ACTOR_IDENTIFIER};`)
        lines.push(`    THIS_ACTOR = ${actorVariable};`)
        lines.push(`    actor_init_functions[${actorVariable}->type]();`)
        lines.push(`    set_actor_position(${collisionNode.x}, ${collisionNode.y});`)
        lines.push(`    add_actor(${actorVariable});`)
      }

      const colliderVariable = `${actorVariable}_collider`
      lines.push(`    Collider* ${colliderVariable} = (Collider*) malloc(sizeof(Collider));`)
      lines.push(`    memset(${colliderVariable}, 0, sizeof(Collider));`)
      lines.push(`    ${colliderVariable}->x = ${worldX};`)
      lines.push(`    ${colliderVariable}->y = ${worldY};`)
      lines.push(`    ${colliderVariable}->width = ${collisionNode.width};`)
      lines.push(`    ${colliderVariable}->height = ${collisionNode.height};`)
      lines.push(`    ${colliderVariable}->is_blocking = ${collisionNode.isBlocking ? 1 : 0};`)
      lines.push(`    ${colliderVariable}->type = BOX_COLLIDER;`)
      lines.push(`    THIS_ACTOR = ${parentActorVariable ?? actorVariable};`)
      lines.push(`    set_collider(${colliderVariable});`)

      for (const callback of collisionNode.callbacks) {
        lines.push(`    set_collision_callback(${colliderVariable}, ${callback.functionName});`)
      }

      return parentActorVariable ?? actorVariable
    }

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

const buildSceneInitializationLines = (
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

export const buildProjectCode = async (
  projectPath: string
): Promise<BuildProjectCodeResult> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  await ensureBundledGbdkAvailableForProject(normalizedProjectPath)
  await writeGeneratedScriptEnvironment(normalizedProjectPath)

  const [assets, scripts] = await Promise.all([
    loadProjectAssetRecords(normalizedProjectPath),
    loadProjectScriptRecords(normalizedProjectPath)
  ])

  assertNoManagedResourceConflicts(assets, scripts)

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
      ? sceneRecords.find((scene) => scene.asset.path === configuredStartingScenePath) ?? null
      : null) ?? sceneRecords[0] ?? null
  const emitSceneNode = createNodeEmitter(
    spriteAssetsByPath,
    new Map(actorScripts.map((script) => [script.path, script]))
  )
  const sceneAssetsByScriptPath = new Map<string, ProjectAssetRecordLike[]>()
  const writtenFiles: string[] = []
  const managedResourceDirectories = new Set<string>()
  const managedScenePaths: string[] = []
  const saveDataFiles = await writeProjectSaveDataFiles(normalizedProjectPath)
  writtenFiles.push(...saveDataFiles.writtenFiles)

  for (const scene of sceneAssets) {
    const document = scene.document as SceneAssetDocument

    if (!document.scriptPath) {
      continue
    }

    const matchingScenes = sceneAssetsByScriptPath.get(document.scriptPath) ?? []
    matchingScenes.push(scene)
    sceneAssetsByScriptPath.set(document.scriptPath, matchingScenes)
  }

  for (const [sceneScriptPath, matchingScenes] of sceneAssetsByScriptPath) {
    if (matchingScenes.length > 1) {
      const sceneScript = sceneScriptsByPath.get(sceneScriptPath)
      throw new ProjectLauncherError(
        `Scene script "${sceneScript?.name ?? sceneScriptPath}" is assigned to multiple scenes. Each generated scene needs its own scene script so build initialization can be injected into SINIT.`
      )
    }
  }

  for (const script of scripts) {
    writtenFiles.push(await rewriteManagedProjectScriptSource(normalizedProjectPath, script))
  }

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

  for (const sceneRecord of sceneRecords) {
    const initializationLines = buildSceneInitializationLines(
      sceneRecord.asset,
      tilemapAssetsByPath,
      windowAssetsByPath,
      emitSceneNode
    )

    if (sceneRecord.isManagedFile) {
      const managedSceneFiles = buildManagedSceneFileContents(
        sceneRecord.identifier,
        sceneRecord.bank,
        initializationLines
      )
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
      continue
    }

    const sceneScriptPath = (sceneRecord.asset.document as SceneAssetDocument).scriptPath

    if (!sceneScriptPath) {
      throw new ProjectLauncherError(
        `Scene "${sceneRecord.asset.name}" is missing its scene script assignment.`
      )
    }

    const sceneScript = sceneScriptsByPath.get(sceneScriptPath)

    if (!sceneScript) {
      throw new ProjectLauncherError(
        `Scene "${sceneRecord.asset.name}" references a missing scene script resource: ${sceneScriptPath}`
      )
    }

    writtenFiles.push(
      await rewriteScriptedSceneInitialization(normalizedProjectPath, sceneScript, initializationLines)
    )
  }

  writtenFiles.push(
    ...(await cleanupCorePlaceholderScene(
      normalizedProjectPath,
      sceneRecords.map((scene) => scene.identifier),
      startingScene?.identifier ?? null
    ))
  )

  writtenFiles.push(
    await rewriteStartingSceneInMain(
      normalizedProjectPath,
      startingScene?.identifier ?? 'SampleScene'
    )
  )

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

    const files = buildMapResourceFiles(tilemap, tileset, 0, 0)
    managedResourceDirectories.add(dirname(files.headerPath).replace(/\\/g, '/'))
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.headerPath, files.headerContent)
    )
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.sourcePath, files.sourceContent)
    )
  }

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
      document.windowBottomStart
    )
    managedResourceDirectories.add(dirname(files.headerPath).replace(/\\/g, '/'))
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.headerPath, files.headerContent)
    )
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.sourcePath, files.sourceContent)
    )
  }

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
  const mapRegistryFiles = buildMapRegistryFiles(tilemapAssets, windowAssets)
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
      buildActorRegistryHeader(actorScripts)
    )
  )
  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      'src/Scene/SceneRegistry.h',
      buildSceneRegistryHeader(sceneRecords.map((scene) => scene.identifier))
    )
  )
  await removeLegacyGeneratedFiles(normalizedProjectPath)
  await syncManagedSceneFiles(normalizedProjectPath, managedScenePaths)
  await syncManagedResourceDirectories(normalizedProjectPath, [...managedResourceDirectories])

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

export const generateProjectResourceFiles = async (
  projectPath: string
): Promise<GenerateProjectResourceFilesResult> => {
  return buildProjectCode(projectPath)
}

export const normalizeResourceIdentifierStem = (resourceName: string): string => {
  return normalizeCodeIdentifierStem(resourceName)
}
