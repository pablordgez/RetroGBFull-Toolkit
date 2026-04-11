import { cp, mkdir, readdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { basename, dirname, join, relative, resolve } from 'path'
import { ProjectLauncherError, validateProjectDirectory } from './projectLauncher'
import { normalizeCodeIdentifier, normalizeCodeIdentifierStem } from '../shared/codeIdentifiers'
import type {
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
  document: ProjectAssetDocument
}

interface ProjectScriptRecordResolved {
  kind: ProjectScriptKind
  path: string
  name: string
  identifier: string
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

const walkRelativePaths = async (basePath: string, currentPath = ''): Promise<string[]> => {
  const absolutePath = currentPath ? join(basePath, currentPath) : basePath
  const entries = await readdir(absolutePath, { withFileTypes: true })
  const discoveredPaths: string[] = []

  for (const entry of entries) {
    const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      discoveredPaths.push(relativePath)
      discoveredPaths.push(...(await walkRelativePaths(basePath, relativePath)))
      continue
    }

    discoveredPaths.push(relativePath)
  }

  return discoveredPaths
}

const escapeHeaderGuardName = (scriptName: string): string => {
  return `${normalizeCodeIdentifier(scriptName).toUpperCase()}_H`
}

const buildManagedSourcePrefix = (scriptFileStem: string): string => {
  return `#pragma bank 255\n#include "${scriptFileStem}.h"\n#include "Generated/ScriptEnvironment.h"\n\n`
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
  scriptName: string
): { managedSourcePrefix: string; editableSourceContent: string; headerContent: string } => {
  const scriptFileStem = getProjectScriptDisplayName(scriptName)
  const scriptIdentifier = normalizeCodeIdentifier(scriptFileStem)

  switch (scriptKind) {
    case 'actor':
      return {
        managedSourcePrefix: buildManagedSourcePrefix(scriptFileStem),
        editableSourceContent: buildActorSourceTemplate(scriptIdentifier),
        headerContent: buildActorHeaderTemplate(scriptIdentifier)
      }
    case 'scene':
      return {
        managedSourcePrefix: buildManagedSourcePrefix(scriptFileStem),
        editableSourceContent: buildSceneSourceTemplate(scriptIdentifier),
        headerContent: buildSceneHeaderTemplate(scriptIdentifier)
      }
    case 'general':
      return {
        managedSourcePrefix: buildManagedSourcePrefix(scriptFileStem),
        editableSourceContent: buildGeneralSourceTemplate(),
        headerContent: buildGeneralHeaderTemplate(scriptIdentifier)
      }
  }
}

const splitEditableSourceContent = (sourceContent: string): string => {
  const sourceLines = sourceContent.split('\n')
  let index = 0

  if (sourceLines[index]?.trim() === '#pragma bank 255') {
    index += 1
  }

  if (/^\s*#include\s+"[^"]+\.h"\s*$/.test(sourceLines[index] ?? '')) {
    index += 1
  }

  if ((sourceLines[index] ?? '').trim() === '#include "Generated/ScriptEnvironment.h"') {
    index += 1
  }

  while (index < sourceLines.length && (sourceLines[index] ?? '').trim() === '') {
    index += 1
  }

  return sourceLines.slice(index).join('\n')
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
  const relativePaths = await walkRelativePaths(bundledCorePath)
  const copiedPaths: string[] = []
  const skippedPaths: string[] = []

  for (const relativePath of relativePaths) {
    const sourcePath = join(bundledCorePath, relativePath)
    const targetPath = join(normalizedProjectPath, relativePath)
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

  await mkdir(resolvePathWithinProject(normalizedProjectPath, 'src/Generated'), { recursive: true })
  await writeGeneratedScriptEnvironment(normalizedProjectPath)

  return {
    copiedPaths,
    skippedPaths
  }
}

export const writeGeneratedScriptEnvironment = async (projectPath: string): Promise<void> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const headerPath = resolvePathWithinProject(
    normalizedProjectPath,
    'src/Generated/ScriptEnvironment.h'
  )
  const headerContent = `#ifndef SCRIPT_ENVIRONMENT_H\n#define SCRIPT_ENVIRONMENT_H\n#include "MainDefinitions.h"\n#include "Actor/Actor.h"\n#include "Scene/Scene.h"\n#include "Collisions/CollisionManager.h"\n#include "Collisions/ColliderRegistry.h"\n#include "Assets/Animations/AnimationRegistry.h"\n#include "Assets/Map/MapRegistry.h"\n#include "Assets/Music/SongRegistry.h"\n#include "Saves/SaveData.h"\n#include "Generated/ProjectBindings.h"\n#include <gb/gb.h>\n#include <stdint.h>\n#include <stdio.h>\n#include <string.h>\n\n#endif // SCRIPT_ENVIRONMENT_H\n`

  await mkdir(dirname(headerPath), { recursive: true })
  await writeFile(headerPath, headerContent, 'utf-8')
}

export const createProjectScriptFiles = async (
  projectPath: string,
  scriptKind: ProjectScriptKind,
  scriptName: string,
  resourcePath?: string
): Promise<{ resourcePath: string; sourcePath: string; headerPath: string }> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const nextScriptName = normalizeCodeIdentifier(scriptName)
  const paths = getScriptFilePaths(scriptKind, nextScriptName, resourcePath)
  const templates = buildScriptTemplates(scriptKind, nextScriptName)
  const sourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, paths.sourcePath)
  const headerAbsolutePath = resolvePathWithinProject(normalizedProjectPath, paths.headerPath)

  await mkdir(dirname(sourceAbsolutePath), { recursive: true })
  await mkdir(dirname(headerAbsolutePath), { recursive: true })
  await writeGeneratedScriptEnvironment(normalizedProjectPath)
  await writeFile(
    sourceAbsolutePath,
    `${templates.managedSourcePrefix}${templates.editableSourceContent}`,
    'utf-8'
  )
  await writeFile(headerAbsolutePath, templates.headerContent, 'utf-8')

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
  const sourceContent = await readFile(sourceAbsolutePath, 'utf-8')
  const headerContent = await readFile(headerAbsolutePath, 'utf-8')
  const { managedSourcePrefix } = buildScriptTemplates(scriptKind, scriptName)
  const editableSourceContent = splitEditableSourceContent(sourceContent)

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
  const { managedSourcePrefix } = buildScriptTemplates(scriptKind, scriptName)
  const sourceContent = `${managedSourcePrefix}${editableSourceContent}`

  await writeGeneratedScriptEnvironment(normalizedProjectPath)
  await writeFile(sourceAbsolutePath, sourceContent, 'utf-8')
  await writeFile(headerAbsolutePath, headerContent, 'utf-8')

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
  const nextManagedSourcePrefix = buildManagedSourcePrefix(nextScriptName)
  const [movedSourceContent, movedHeaderContent] = await Promise.all([
    readFile(nextSourceAbsolutePath, 'utf-8'),
    readFile(nextHeaderAbsolutePath, 'utf-8')
  ])

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
    return
  }

  await rename(sourceAbsolutePath, destinationSourceAbsolutePath)
  await rename(headerAbsolutePath, destinationHeaderAbsolutePath)
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
const MANAGED_EMPTY_SCENE_IDENTIFIER = 'GeneratedEmptyScene'

const isCanonicalProjectScriptPath = (resourcePath: string): boolean => {
  return (
    isProjectScriptSourcePath(resourcePath) && getProjectScriptKindFromPath(resourcePath) !== null
  )
}

const collectProjectResourcePaths = async (projectPath: string): Promise<string[]> => {
  return walkRelativePaths(projectPath)
}

const loadProjectAssetRecords = async (projectPath: string): Promise<ProjectAssetRecordLike[]> => {
  const relativePaths = await collectProjectResourcePaths(projectPath)
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
      document
    })
  }

  return assetRecords.sort((left, right) => left.path.localeCompare(right.path))
}

const loadProjectScriptRecords = async (
  projectPath: string
): Promise<ProjectScriptRecordResolved[]> => {
  const relativePaths = await collectProjectResourcePaths(projectPath)
  const scriptRecords: ProjectScriptRecordResolved[] = []

  for (const resourcePath of relativePaths) {
    if (!isCanonicalProjectScriptPath(resourcePath)) {
      continue
    }

    const scriptKind = getProjectScriptKindFromPath(resourcePath)

    if (!scriptKind) {
      continue
    }

    const displayName = getProjectScriptDisplayName(basename(resourcePath))
    scriptRecords.push({
      kind: scriptKind,
      path: resourcePath.replace(/\\/g, '/'),
      name: displayName,
      identifier: normalizeCodeIdentifier(displayName)
    })
  }

  return scriptRecords.sort((left, right) => left.path.localeCompare(right.path))
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
    '#pragma bank 255',
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
    '#pragma bank 255',
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
    '#pragma bank 255',
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

const buildAnimationRegistryHeader = (sprites: ProjectAssetRecordLike[]): string => {
  const includeLines = sprites.map(
    (sprite) => `#include "${sprite.identifier}/${sprite.identifier}.h"`
  )
  const macroLines =
    sprites.length > 0
      ? sprites.map((sprite) => {
          const document = sprite.document as SpriteAssetDocument
          const metaspriteExpression =
            document.width > 8 || document.height > 8
              ? `${sprite.identifier}_metasprite_data`
              : '(void*) 0'
          return `    _ANIMATION(${sprite.identifier}, ${document.width}, ${document.height}, ${document.frames.length}, ${buildAnimationDuration(document.fps)}, ${metaspriteExpression}) \\`
        })
      : ['    _ANIMATION(empty_sprite, 8, 8, 1, 60, (void*) 0) \\']

  return [
    '#ifndef ANIMATION_REGISTRY_H',
    '#define ANIMATION_REGISTRY_H',
    '#include "Assets/SpaceManager.h"',
    '#include "Animation.h"',
    '',
    ...includeLines,
    ...(includeLines.length > 0 ? [''] : []),
    '// name, width, height, frames, frame duration',
    '#define ANIMATIONS \\',
    ...macroLines,
    '',
    '#define _ANIMATION(name, width, height, frames, duration, metasprite) name,',
    '    typedef enum {',
    '        ANIMATIONS',
    '        NUMBER_OF_ANIMATIONS',
    '    } AnimationType;',
    '#undef _ANIMATION',
    '',
    'extern const Animation* animations[];',
    'extern const AssetEntry animation_data[];',
    '',
    '#endif /* ANIMATION_REGISTRY_H */',
    ''
  ].join('\n')
}

const buildMapRegistryHeader = (
  tilemaps: ProjectAssetRecordLike[],
  windows: ProjectAssetRecordLike[]
): string => {
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
  const macroLines =
    maps.length > 0
      ? maps.map((map) => {
          const document = map.document as TilemapAssetDocument | WindowAssetDocument
          return `    _MAP(${map.identifier}, ${document.width}, ${document.height}, ${map.windowTopEnd}, ${map.windowBottomStart}) \\`
        })
      : ['    _MAP(empty_map, 1, 1, 0, 0) \\']

  return [
    '#ifndef MAP_DECLARATIONS_H',
    '#define MAP_DECLARATIONS_H',
    '',
    '#include "Map.h"',
    '#include "Assets/SpaceManager.h"',
    ...includeLines,
    '',
    '// name, width, height, window_top_end, window_bottom_start',
    '#define MAPS \\',
    ...macroLines,
    '    ',
    '#define _MAP(name, width, height, window_top_end, window_bottom_start) name,',
    '    typedef enum {',
    '        MAPS',
    '        NUMBER_OF_MAPS',
    '    } MapType;',
    '#undef _MAP',
    '',
    'extern Map* maps[];',
    'extern const AssetEntry map_data[];',
    '',
    '#endif /* MAP_DECLARATIONS_H */',
    ''
  ].join('\n')
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
    '    TAG_PLAYER,',
    '} Tags;',
    '',
    '#endif // ACTOR_REGISTRY_H',
    ''
  ].join('\n')
}

const buildSceneRegistryHeader = (sceneAliases: string[]): string => {
  const scenes = sceneAliases.length > 0 ? sceneAliases : [MANAGED_EMPTY_SCENE_IDENTIFIER]

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

const buildSceneAliasHeader = (
  sceneAssets: ProjectAssetRecordLike[],
  sceneScriptsByPath: Map<string, ProjectScriptRecordResolved>
): string => {
  const includes = new Set<string>()
  const aliasLines: string[] = []

  for (const scene of sceneAssets) {
    const document = scene.document as SceneAssetDocument
    const script = document.scriptPath ? sceneScriptsByPath.get(document.scriptPath) : null

    if (script) {
      includes.add(`#include "CustomScenes/${script.identifier}.h"`)
      aliasLines.push(`typedef ${script.identifier} ${scene.identifier};`)
      continue
    }

    aliasLines.push(`typedef struct {\n    Scene base;\n} ${scene.identifier};`)
  }

  if (sceneAssets.length === 0) {
    aliasLines.push(`typedef struct {\n    Scene base;\n} ${MANAGED_EMPTY_SCENE_IDENTIFIER};`)
  }

  return [
    '#ifndef PROJECT_BINDINGS_H',
    '#define PROJECT_BINDINGS_H',
    '#include "Scene/Scene.h"',
    '#include "Actor/Actor.h"',
    ...[...includes],
    ...(includes.size > 0 ? [''] : []),
    ...aliasLines.flatMap((line) => [line, '']),
    '#endif // PROJECT_BINDINGS_H',
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
      lines.push(
        `    Collider* ${colliderVariable} = Generated_CreateCollider(${worldX}, ${worldY}, ${collisionNode.width}, ${collisionNode.height}, ${collisionNode.isBlocking ? 1 : 0});`
      )
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

const buildProjectBindingsSource = (
  sceneAssets: ProjectAssetRecordLike[],
  spriteAssetsByPath: Map<string, ProjectAssetRecordLike>,
  tilemapAssetsByPath: Map<string, ProjectAssetRecordLike>,
  windowAssetsByPath: Map<string, ProjectAssetRecordLike>,
  actorScripts: ProjectScriptRecordResolved[],
  sceneScripts: ProjectScriptRecordResolved[]
): string => {
  const actorScriptsByPath = new Map(actorScripts.map((script) => [script.path, script]))
  const sceneScriptsByPath = new Map(sceneScripts.map((script) => [script.path, script]))
  const includeLines = [
    '#pragma bank 255',
    '#include "Generated/ProjectBindings.h"',
    '#include "Actor/ActorRegistry.h"',
    '#include "Assets/Animations/AnimationRegistry.h"',
    '#include "Assets/Map/MapRegistry.h"',
    '#include "Collisions/Collider.h"',
    '#include "Collisions/CollisionManager.h"',
    '#include <stdlib.h>',
    '#include <string.h>'
  ]
  const callbackDeclarations = new Set<string>()
  const sceneScriptDeclarations = new Set<string>()

  for (const script of actorScripts) {
    includeLines.push(`#include "CustomActors/${script.identifier}.h"`)
  }

  for (const script of sceneScripts) {
    includeLines.push(`#include "CustomScenes/${script.identifier}.h"`)
  }

  const sourceLines = [...includeLines, '']
  sourceLines.push('void Actor_Init_GeneratedDefaultActor(void){')
  sourceLines.push('    init_actor(THIS_ACTOR);')
  sourceLines.push('}')
  sourceLines.push('')
  sourceLines.push('void Actor_Update_GeneratedDefaultActor(void){')
  sourceLines.push('}')
  sourceLines.push('')
  sourceLines.push(
    'static Collider* Generated_CreateCollider(uint16_t x, uint16_t y, uint16_t width, uint16_t height, uint8_t is_blocking) BANKED{'
  )
  sourceLines.push('    Collider* collider = (Collider*) malloc(sizeof(Collider));')
  sourceLines.push('    memset(collider, 0, sizeof(Collider));')
  sourceLines.push('    collider->x = x;')
  sourceLines.push('    collider->y = y;')
  sourceLines.push('    collider->width = width;')
  sourceLines.push('    collider->height = height;')
  sourceLines.push('    collider->is_blocking = is_blocking;')
  sourceLines.push('    collider->type = BOX_COLLIDER;')
  sourceLines.push('    return collider;')
  sourceLines.push('}')
  sourceLines.push('')

  if (sceneAssets.length === 0) {
    sourceLines.push(`void scene_init_state_${MANAGED_EMPTY_SCENE_IDENTIFIER}(void) BANKED{`)
    sourceLines.push('    init_scene(THIS_SCENE);')
    sourceLines.push('}')
    sourceLines.push('')
    sourceLines.push(`void scene_update_${MANAGED_EMPTY_SCENE_IDENTIFIER}(void){`)
    sourceLines.push('    update_actors();')
    sourceLines.push('    draw_actors();')
    sourceLines.push('}')
    sourceLines.push('')
    return sourceLines.join('\n')
  }

  for (const scene of sceneAssets) {
    const document = scene.document as SceneAssetDocument
    const sceneScript = document.scriptPath ? sceneScriptsByPath.get(document.scriptPath) : null

    if (sceneScript) {
      sceneScriptDeclarations.add(`void scene_init_state_${sceneScript.identifier}(void) BANKED;`)
      sceneScriptDeclarations.add(`void scene_update_${sceneScript.identifier}(void);`)
    }

    const collectCallbacks = (currentNode: SceneAssetNode): void => {
      if (currentNode.type === 'collision') {
        for (const callback of currentNode.callbacks) {
          callbackDeclarations.add(`void ${callback.functionName}(void);`)
        }
      }

      for (const childNode of currentNode.children) {
        collectCallbacks(childNode)
      }
    }

    for (const node of document.nodes) {
      collectCallbacks(node)
    }
  }

  if (sceneScriptDeclarations.size > 0 || callbackDeclarations.size > 0) {
    sourceLines.push(...[...sceneScriptDeclarations].sort())
    sourceLines.push(...[...callbackDeclarations].sort())
    sourceLines.push('')
  }

  const emitNode = createNodeEmitter(spriteAssetsByPath, actorScriptsByPath)

  for (const scene of sceneAssets) {
    const document = scene.document as SceneAssetDocument
    const sceneScript = document.scriptPath ? sceneScriptsByPath.get(document.scriptPath) : null
    sourceLines.push(`void scene_init_state_${scene.identifier}(void) BANKED{`)
    sourceLines.push('    init_scene(THIS_SCENE);')

    if (sceneScript) {
      sourceLines.push(`    scene_init_state_${sceneScript.identifier}();`)
    }

    if (document.tilemapPath) {
      const tilemap = tilemapAssetsByPath.get(document.tilemapPath)

      if (!tilemap) {
        throw new ProjectLauncherError(
          `Scene "${scene.name}" references a missing tilemap resource: ${document.tilemapPath}`
        )
      }

      sourceLines.push(`    set_scene_map(maps[${tilemap.identifier}]);`)
    }

    if (document.windowPath) {
      const windowResource = windowAssetsByPath.get(document.windowPath)

      if (!windowResource) {
        throw new ProjectLauncherError(
          `Scene "${scene.name}" references a missing window resource: ${document.windowPath}`
        )
      }

      sourceLines.push(`    set_scene_window(maps[${windowResource.identifier}]);`)
    }

    const counters = { actor: 0 }

    for (const node of document.nodes) {
      emitNode(node, null, sourceLines, counters)
    }

    sourceLines.push('}')
    sourceLines.push('')
    sourceLines.push(`void scene_update_${scene.identifier}(void){`)

    if (sceneScript) {
      sourceLines.push(`    scene_update_${sceneScript.identifier}();`)
    } else {
      sourceLines.push('    update_actors();')
      sourceLines.push('    draw_actors();')
    }

    sourceLines.push('}')
    sourceLines.push('')
  }

  return sourceLines.join('\n')
}

export const generateProjectResourceFiles = async (
  projectPath: string
): Promise<GenerateProjectResourceFilesResult> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
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
  const writtenFiles: string[] = []

  for (const sprite of spriteAssets) {
    const files = buildSpriteResourceFiles(sprite)
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.headerPath, files.headerContent)
    )
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.sourcePath, files.sourceContent)
    )
  }

  for (const tileset of tilesetAssets) {
    const files = buildTilesetResourceFiles(tileset)
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
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.headerPath, files.headerContent)
    )
    writtenFiles.push(
      await writeManagedTextFile(normalizedProjectPath, files.sourcePath, files.sourceContent)
    )
  }

  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      'src/Assets/Animations/AnimationRegistry.h',
      buildAnimationRegistryHeader(spriteAssets)
    )
  )
  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      'src/Assets/Map/MapRegistry.h',
      buildMapRegistryHeader(tilemapAssets, windowAssets)
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
      buildSceneRegistryHeader(sceneAssets.map((scene) => scene.identifier))
    )
  )
  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      'src/Generated/ProjectBindings.h',
      buildSceneAliasHeader(sceneAssets, sceneScriptsByPath)
    )
  )
  writtenFiles.push(
    await writeManagedTextFile(
      normalizedProjectPath,
      'src/Generated/ProjectBindings.c',
      buildProjectBindingsSource(
        sceneAssets,
        spriteAssetsByPath,
        tilemapAssetsByPath,
        windowAssetsByPath,
        actorScripts,
        sceneScripts
      )
    )
  )

  return {
    writtenFiles: writtenFiles.sort(),
    spriteCount: spriteAssets.length,
    tilesetCount: tilesetAssets.length,
    tilemapCount: tilemapAssets.length,
    windowCount: windowAssets.length,
    sceneCount: sceneAssets.length,
    actorScriptCount: actorScripts.length,
    sceneScriptCount: sceneScripts.length
  }
}

export const normalizeResourceIdentifierStem = (resourceName: string): string => {
  return normalizeCodeIdentifierStem(resourceName)
}
