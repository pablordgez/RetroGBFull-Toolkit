import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname } from 'path'
import {
  loadProjectSaveDataState,
  readProjectTrackedResourceBank,
  readProjectTrackedResourceBanks
} from './projectMetadata'
import { ProjectLauncherError } from './projectLauncher'
import { normalizeCodeIdentifier } from '../shared/codeIdentifiers'
import type {
  ProjectScriptBankingOptions,
  ProjectScriptCallbackCandidate,
  ProjectScriptResourcePayload,
  ProjectScriptSavePayload
} from '../shared/projectCodeWorkspace'
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
import {
  CORE_PLACEHOLDER_SCENE_FILE_MARKER,
  GENERATED_SCENE_BUILD_BEGIN,
  GENERATED_SCENE_BUILD_END,
  IGNORED_PROJECT_RESOURCE_ROOT_DIRECTORIES,
  MAIN_SOURCE_PATH,
  MANAGED_DEFAULT_ACTOR_FILE_MARKER,
  MANAGED_SCENE_FILE_MARKER,
  SAVE_DATA_HEADER_PATH,
  SAVE_DATA_INITIALIZATION_BEGIN,
  SAVE_DATA_INITIALIZATION_END,
  SAVE_DATA_SOURCE_PATH,
  SAVE_DATA_VARIABLE_BEGIN,
  SAVE_DATA_VARIABLE_END,
  SCRIPT_ENVIRONMENT_PATH,
  STARTING_SCENE_INCLUDE_BEGIN,
  STARTING_SCENE_INCLUDE_END,
  STARTING_SCENE_INSTANTIATION_BEGIN,
  STARTING_SCENE_INSTANTIATION_END,
  ensureProjectDirectory,
  resolvePathWithinProject,
  walkRelativePaths
} from './projectCodeShared'
import { withProjectCoreFileOperation } from './projectCoreFileOperations'

export interface ProjectScriptRecordLike {
  path: string
  name: string
  scriptKind: ProjectScriptKind
}

export interface ProjectScriptRecordResolved {
  kind: ProjectScriptKind
  path: string
  name: string
  identifier: string
  bank: number
}

const RESERVED_CALLBACK_NAMES = new Set(['AINIT', 'AUPDATE', 'SINIT', 'SUPDATE'])

const isMissingFileError = (error: unknown): boolean => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
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

const escapeHeaderGuardName = (scriptName: string): string => {
  return `${normalizeCodeIdentifier(scriptName).toUpperCase()}_H`
}

const buildManagedSourcePrefix = (scriptFileStem: string, bank: number): string => {
  const scriptIdentifier = normalizeCodeIdentifier(scriptFileStem)
  return `#pragma bank ${bank}\n#include "${scriptFileStem}.h"\n#include "ScriptEnvironment.h"\n\nBANKREF(${scriptIdentifier}_bankref)\n\n`
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
  return `#ifndef ${headerGuard}\n#define ${headerGuard}\n#include "MainDefinitions.h"\n\n#endif // ${headerGuard}\n`
}

const buildActorSourceTemplate = (scriptIdentifier: string): string => {
  return `void AINIT(void) BANKED{\n    ${scriptIdentifier}* self = (${scriptIdentifier}*) THIS_ACTOR;\n    init_actor(&self->base);\n}\n\nvoid AUPDATE(void) BANKED{\n\n}\n`
}

const buildSceneSourceTemplate = (scriptIdentifier: string): string => {
  return `void SINIT(void) BANKED{\n    ${scriptIdentifier}* scene = (${scriptIdentifier}*) THIS_SCENE;\n    init_scene(&scene->base);\n}\n\nvoid SUPDATE(void) BANKED{\n    update_actors();\n    draw_actors();\n}\n`
}

const buildGeneralSourceTemplate = (): string => {
  return ''
}

const shouldAutoBankScriptFunctions = (options?: ProjectScriptBankingOptions): boolean => {
  return options?.autoBankScriptFunctions !== false
}

// builds the script template based on the type of script
// each template has a managed prefix with the bank and includes, an editable region and a header template
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

// skips a bank line, an include line, an include line for ScriptEnvironment.h and any blank lines after that,
// returns the rest
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

  if (
    /^BANKREF\s*\(\s*[A-Za-z_][A-Za-z0-9_]*_bankref\s*\)\s*$/.test(sourceLines[index]?.trim() ?? '')
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
    headerPath: getProjectScriptHeaderPath(sourcePath)
  }
}

// looks for beginMarker and endMarker, keeps everything outside of that and replaces the inside with nextLines
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

// generates save data entries by replacing header and source blocks in the respective files
export const writeProjectSaveDataFiles = async (
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

export const getProjectScriptHeaderPath = (resourcePath: string): string => {
  return `${dirname(resourcePath).replace(/\\/g, '/')}/${buildProjectScriptHeaderFileName(getProjectScriptDisplayName(basename(resourcePath)))}`
}

// build scene template:
// bank, header, marker, SINIT, SUPDATE
export const buildManagedSceneFileContents = (
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

// this function is used for building scene files for scenes that share the same script
// these are just wrappers that define their own initialization but otherwise call the base script
export const buildManagedScriptedSceneFileContents = (
  sceneIdentifier: string,
  bank: number,
  sceneScriptIdentifier: string,
  sceneScriptHeaderPath: string,
  initializationLines: string[]
): { headerContent: string; sourceContent: string } => {
  const scriptIncludePath = sceneScriptHeaderPath.replace(/\\/g, '/').replace(/^src\//, '')
  const headerGuard = escapeHeaderGuardName(sceneIdentifier)
  const generatedInitializationBlock = [
    GENERATED_SCENE_BUILD_BEGIN,
    ...initializationLines,
    GENERATED_SCENE_BUILD_END
  ]

  return {
    headerContent: [
      MANAGED_SCENE_FILE_MARKER,
      `#ifndef ${headerGuard}`,
      `#define ${headerGuard}`,
      `#include "${scriptIncludePath}"`,
      '',
      `typedef ${sceneScriptIdentifier} ${sceneIdentifier};`,
      '',
      `#endif // ${headerGuard}`,
      ''
    ].join('\n'),
    sourceContent: [
      buildManagedSourcePrefix(sceneIdentifier, bank).trimEnd(),
      MANAGED_SCENE_FILE_MARKER,
      '',
      `void scene_init_state_${sceneScriptIdentifier}(void) BANKED;`,
      `void scene_update_${sceneScriptIdentifier}(void) BANKED;`,
      '',
      'void SINIT(void) BANKED{',
      `    FAR_CALL(TO_FAR_PTR(scene_init_state_${sceneScriptIdentifier}, BANK(${sceneScriptIdentifier}_bankref)), RVoid_PVoid_BANKED);`,
      ...generatedInitializationBlock,
      '}',
      '',
      'void SUPDATE(void) BANKED{',
      `    FAR_CALL(TO_FAR_PTR(scene_update_${sceneScriptIdentifier}, BANK(${sceneScriptIdentifier}_bankref)), RVoid_PVoid_BANKED);`,
      '}',
      ''
    ].join('\n')
  }
}

// build actor template: bank, header, marker, AINIT, AUPDATE
export const buildManagedDefaultActorFileContents = (
  actorIdentifier: string,
  bank: number
): { headerContent: string; sourceContent: string } => {
  return {
    headerContent: `${MANAGED_DEFAULT_ACTOR_FILE_MARKER}\n${buildActorHeaderTemplate(actorIdentifier)}`,
    sourceContent: `${buildManagedSourcePrefix(actorIdentifier, bank)}${MANAGED_DEFAULT_ACTOR_FILE_MARKER}\n\n${buildActorSourceTemplate(actorIdentifier)}`
  }
}

// removes generated content from old versions (these files are no longer generated)
export const removeLegacyGeneratedFiles = async (projectPath: string): Promise<void> => {
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

// removes any files that include MANAGED_SCENE_FILE_MARKER that are .c or .h files in src/CustomScenes and are
// not in keepPaths
export const syncManagedSceneFiles = async (
  projectPath: string,
  keepPaths: string[]
): Promise<void> => {
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

// writes the initialization of the first scene in main
export const rewriteStartingSceneInMain = async (
  projectPath: string,
  sceneIdentifier: string
): Promise<string> => {
  const mainAbsolutePath = resolvePathWithinProject(projectPath, MAIN_SOURCE_PATH)
  const mainContent = await readFile(mainAbsolutePath, 'utf-8')
  let nextMainContent = mainContent

  // includes:
  // try to replace within managed blocks first
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
    // if not present, replace any imports from CustomScenes
  } else {
    nextMainContent = nextMainContent.replace(
      /#include\s+"CustomScenes\/[^"]+\.h"/,
      `#include "CustomScenes/${sceneIdentifier}.h"`
    )
  }

  // instantiation:
  // try to replace within managed blocks first
  if (
    nextMainContent.includes(STARTING_SCENE_INSTANTIATION_BEGIN) &&
    nextMainContent.includes(STARTING_SCENE_INSTANTIATION_END)
  ) {
    nextMainContent = replaceManagedBlock(
      nextMainContent,
      STARTING_SCENE_INSTANTIATION_BEGIN,
      STARTING_SCENE_INSTANTIATION_END,
      [
        `    ${sceneIdentifier}* ss = (${sceneIdentifier}*) malloc(sizeof(${sceneIdentifier}));`,
        '    if(ss != NULL){',
        `        ss->base.type = _${sceneIdentifier};`,
        '        set_scene((Scene*) ss);',
        '    }'
      ]
    )
  } // if not present, tries to match declaration, assignment and set_scene call
  else {
    nextMainContent = nextMainContent.replace(
      /[ \t]*[A-Za-z_][A-Za-z0-9_]*\s+ss;\r?\n[ \t]*ss\.base\.type\s*=\s*_[A-Za-z_][A-Za-z0-9_]*;\r?\n(?:\r?\n)?[ \t]*set_scene\(\(Scene\*\)\s*&ss\);\r?\n/,
      `    ${sceneIdentifier}* ss = (${sceneIdentifier}*) malloc(sizeof(${sceneIdentifier}));\n    if(ss != NULL){\n        ss->base.type = _${sceneIdentifier};\n        set_scene((Scene*) ss);\n    }\n`
    )
  }

  // check if no changes were made, and if so, check if the expected code is present
  if (nextMainContent === mainContent) {
    const alreadyIncludesStartingScene = mainContent.includes(
      `#include "CustomScenes/${sceneIdentifier}.h"`
    )
    const alreadyInstantiatesStartingScene = mainContent.includes(
      `ss->base.type = _${sceneIdentifier};`
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

// rewrites a file with a freshly generated prefix and the existsing editable content
export const rewriteManagedProjectScriptSource = async (
  projectPath: string,
  script: ProjectScriptRecordResolved,
  options?: ProjectScriptBankingOptions
): Promise<string> => {
  const sourceAbsolutePath = resolvePathWithinProject(projectPath, script.path)
  const headerPath = getProjectScriptHeaderPath(script.path)
  const headerAbsolutePath = resolvePathWithinProject(projectPath, headerPath)
  const existingSourceContent = await readFile(sourceAbsolutePath, 'utf-8')
  const existingHeaderContent = await readFile(headerAbsolutePath, 'utf-8')
  const editableSourceContent =
    script.kind === 'scene'
      ? stripGeneratedSceneInitializationBlock(splitEditableSourceContent(existingSourceContent))
      : splitEditableSourceContent(existingSourceContent)
  const nextEditableSourceContent = shouldAutoBankScriptFunctions(options)
    ? ensureBankedScriptFunctionDefinitions(editableSourceContent)
    : editableSourceContent
  const managedSourcePrefix = buildManagedSourcePrefix(script.name, script.bank)
  const headerContent = shouldAutoBankScriptFunctions(options)
    ? ensureBankedScriptHeaderPrototypes(
        existingHeaderContent,
        collectBankedScriptFunctionNames(nextEditableSourceContent)
      )
    : existingHeaderContent

  await writeFile(
    sourceAbsolutePath,
    `${managedSourcePrefix}${nextEditableSourceContent}`,
    'utf-8'
  )
  await writeFile(headerAbsolutePath, headerContent, 'utf-8')

  return script.path.replace(/\\/g, '/')
}

// rewrites a scene script file with a freshly generated initialization block based on the current content
export const rewriteScriptedSceneInitialization = async (
  projectPath: string,
  sceneScript: ProjectScriptRecordResolved,
  initializationLines: string[]
): Promise<string> => {
  const sourceAbsolutePath = resolvePathWithinProject(projectPath, sceneScript.path)
  const sourceContent = await readFile(sourceAbsolutePath, 'utf-8')
  const nextSourceContent = injectGeneratedSceneInitializationBlock(
    sourceContent,
    initializationLines
  )

  await writeFile(sourceAbsolutePath, nextSourceContent, 'utf-8')

  return sceneScript.path.replace(/\\/g, '/')
}

const buildScriptEnvironmentHeaderContent = (
  scriptHeaderIncludes: string[],
  scriptBankRefExterns: string[] = []
): string => {
  return `#ifndef SCRIPT_ENVIRONMENT_H\n#define SCRIPT_ENVIRONMENT_H\n#include "MainDefinitions.h"\n#include "Actor/Actor.h"\n#include "Scene/Scene.h"\n#include "Collisions/CollisionManager.h"\n#include "Collisions/ColliderRegistry.h"\n#include "Assets/Animations/AnimationRegistry.h"\n#include "Assets/Map/MapRegistry.h"\n#include "Assets/Music/SongRegistry.h"\n#include "Assets/Text/Text.h"\n#include "Interrupts/InterruptManager.h"\n#include "Saves/SaveData.h"\n${scriptHeaderIncludes.length > 0 ? `${scriptHeaderIncludes.join('\n')}\n` : ''}${scriptBankRefExterns.length > 0 ? `${scriptBankRefExterns.join('\n')}\n` : ''}#include <gb/gb.h>\n#include <stdint.h>\n#include <stdlib.h>\n#include <stdio.h>\n#include <string.h>\n\n#endif // SCRIPT_ENVIRONMENT_H\n`
}

// generates a header file that includes some base headers and detected script headers
export const writeGeneratedScriptEnvironment = async (projectPath: string): Promise<void> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const headerPath = resolvePathWithinProject(normalizedProjectPath, SCRIPT_ENVIRONMENT_PATH)
  const scriptRecords = await loadProjectScriptRecords(normalizedProjectPath)
  const scriptHeaderIncludes = [
    ...new Set(
      scriptRecords.map((script) => {
        const headerPath = getProjectScriptHeaderPath(script.path).replace(/\\/g, '/')
        return `#include "${headerPath.replace(/^src\//, '')}"`
      })
    )
  ].sort((left, right) => left.localeCompare(right))
  const scriptBankRefExterns = scriptRecords
    .map((script) => `BANKREF_EXTERN(${script.identifier}_bankref)`)
    .sort((left, right) => left.localeCompare(right))
  const headerContent = buildScriptEnvironmentHeaderContent(
    scriptHeaderIncludes,
    scriptBankRefExterns
  )

  await mkdir(dirname(headerPath), { recursive: true })
  await writeFile(headerPath, headerContent, 'utf-8')
}

// creates template files for the script
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
  headerContent: string,
  options?: ProjectScriptBankingOptions
): Promise<ProjectScriptSavePayload> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const scriptName = getProjectScriptDisplayName(basename(resourcePath))
  const paths = getScriptFilePaths(scriptKind, scriptName, resourcePath)
  const sourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, paths.sourcePath)
  const headerAbsolutePath = resolvePathWithinProject(normalizedProjectPath, paths.headerPath)
  const bank = await readProjectTrackedResourceBank(normalizedProjectPath, paths.resourcePath)
  const { managedSourcePrefix } = buildScriptTemplates(scriptKind, scriptName, bank)
  const nextEditableSourceContent = shouldAutoBankScriptFunctions(options)
    ? ensureBankedScriptFunctionDefinitions(editableSourceContent)
    : editableSourceContent
  const nextHeaderContent = shouldAutoBankScriptFunctions(options)
    ? ensureBankedScriptHeaderPrototypes(
        headerContent,
        collectBankedScriptFunctionNames(nextEditableSourceContent)
      )
    : headerContent
  const sourceContent = `${managedSourcePrefix}${nextEditableSourceContent}`

  await writeFile(sourceAbsolutePath, sourceContent, 'utf-8')
  await writeFile(headerAbsolutePath, nextHeaderContent, 'utf-8')
  await writeGeneratedScriptEnvironment(normalizedProjectPath)

  return {
    resourcePath: paths.resourcePath,
    scriptKind,
    sourceContent,
    editableSourceContent: nextEditableSourceContent,
    headerContent: nextHeaderContent
  }
}

// renames/moves script files and updates their identifiers, updates script environment
export const renameProjectScriptFiles = async (
  projectPath: string,
  resourcePath: string,
  nextResourcePath: string
): Promise<void> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const sourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, resourcePath)
  const headerAbsolutePath = resolvePathWithinProject(
    normalizedProjectPath,
    getProjectScriptHeaderPath(resourcePath)
  )
  const nextSourceAbsolutePath = resolvePathWithinProject(normalizedProjectPath, nextResourcePath)
  const nextHeaderAbsolutePath = resolvePathWithinProject(
    normalizedProjectPath,
    getProjectScriptHeaderPath(nextResourcePath)
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
  const deletedResourcePath = `${deletedContentPath.replace(/\\/g, '/').replace(/\/+$/, '')}/${basename(resourcePath)}`
  await transferProjectScriptFiles(projectPath, resourcePath, deletedResourcePath, 'move')
}

export const restoreProjectScriptFilesFromDeletedContainer = async (
  projectPath: string,
  resourcePath: string,
  deletedContentPath: string
): Promise<void> => {
  const deletedResourcePath = `${deletedContentPath.replace(/\\/g, '/').replace(/\/+$/, '')}/${basename(resourcePath)}`
  await transferProjectScriptFiles(projectPath, deletedResourcePath, resourcePath, 'move')
}

// moves or copies script files without updating their identifiers, updates script environment
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
    getProjectScriptHeaderPath(resourcePath)
  )
  const destinationSourceAbsolutePath = resolvePathWithinProject(
    normalizedProjectPath,
    destinationResourcePath
  )
  const destinationHeaderAbsolutePath = resolvePathWithinProject(
    normalizedProjectPath,
    getProjectScriptHeaderPath(destinationResourcePath)
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
    getProjectScriptHeaderPath(resourcePath)
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

type ScriptFunctionBankQualifier = 'BANKED' | 'NONBANKED'

interface ScriptFunctionDefinitionMatch {
  braceIndex: number
  functionName: string
  qualifier: ScriptFunctionBankQualifier | null
}

const SCRIPT_FUNCTION_DECLARATION_TAIL_PATTERN =
  /(^|\n)([ \t]*(?!(?:if|else|for|while|switch|return|sizeof|do|case|default|typedef|struct|union|enum)\b)([^;{}#]*?\b([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)))\s*$/m

const parseTopLevelScriptFunctionDefinition = (
  topLevelCandidate: string,
  braceIndex: number
): ScriptFunctionDefinitionMatch | null => {
  const closingParenIndex = topLevelCandidate.lastIndexOf(')')

  if (closingParenIndex === -1) {
    return null
  }

  const declarationCandidate = topLevelCandidate.slice(0, closingParenIndex + 1)
  const suffix = topLevelCandidate.slice(closingParenIndex + 1)
  const declarationMatch = declarationCandidate.match(SCRIPT_FUNCTION_DECLARATION_TAIL_PATTERN)

  if (!declarationMatch) {
    return null
  }

  const declaration = declarationMatch[2]
  const functionName = declarationMatch[4]

  if (!functionName) {
    return null
  }

  const nameIndex = declaration.lastIndexOf(functionName)
  const declarationPrefix = declaration.slice(0, nameIndex).trim()

  if (declarationPrefix.length === 0 || declarationPrefix.includes('=')) {
    return null
  }

  const qualifierMatch = suffix.match(/\b(BANKED|NONBANKED)\b/)

  return {
    braceIndex,
    functionName,
    qualifier: (qualifierMatch?.[1] as ScriptFunctionBankQualifier | undefined) ?? null
  }
}

const scanTopLevelScriptFunctionDefinitions = (
  sourceContent: string
): ScriptFunctionDefinitionMatch[] => {
  const matches: ScriptFunctionDefinitionMatch[] = []
  let depth = 0
  let topLevelBoundary = 0
  let mode: 'code' | 'line-comment' | 'block-comment' | 'string' | 'char' | 'preprocessor' = 'code'
  let isEscaped = false
  let lineHasOnlyWhitespace = true

  for (let index = 0; index < sourceContent.length; index += 1) {
    const character = sourceContent[index]
    const nextCharacter = sourceContent[index + 1]

    switch (mode) {
      case 'line-comment':
        if (character === '\n') {
          mode = 'code'
          lineHasOnlyWhitespace = true
        }
        continue
      case 'block-comment':
        if (character === '*' && nextCharacter === '/') {
          index += 1
          mode = 'code'
        }
        continue
      case 'string':
        if (isEscaped) {
          isEscaped = false
        } else if (character === '\\') {
          isEscaped = true
        } else if (character === '"') {
          mode = 'code'
        }
        continue
      case 'char':
        if (isEscaped) {
          isEscaped = false
        } else if (character === '\\') {
          isEscaped = true
        } else if (character === "'") {
          mode = 'code'
        }
        continue
      case 'preprocessor':
        if (character === '\n' && sourceContent[index - 1] !== '\\') {
          mode = 'code'
          lineHasOnlyWhitespace = true
        }
        continue
      case 'code':
        break
    }

    if (character === '/' && nextCharacter === '/') {
      mode = 'line-comment'
      index += 1
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      mode = 'block-comment'
      index += 1
      continue
    }

    if (character === '"') {
      mode = 'string'
      isEscaped = false
      lineHasOnlyWhitespace = false
      continue
    }

    if (character === "'") {
      mode = 'char'
      isEscaped = false
      lineHasOnlyWhitespace = false
      continue
    }

    if (lineHasOnlyWhitespace && character === '#') {
      mode = 'preprocessor'
      continue
    }

    if (character === '\n') {
      lineHasOnlyWhitespace = true
      continue
    }

    if (!/\s/.test(character)) {
      lineHasOnlyWhitespace = false
    }

    if (depth === 0 && character === ';') {
      topLevelBoundary = index + 1
      continue
    }

    if (character === '{') {
      if (depth === 0) {
        const match = parseTopLevelScriptFunctionDefinition(
          sourceContent.slice(topLevelBoundary, index),
          index
        )

        if (match) {
          matches.push(match)
        }
      }

      depth += 1
      continue
    }

    if (character === '}') {
      depth = Math.max(0, depth - 1)

      if (depth === 0) {
        topLevelBoundary = index + 1
      }
    }
  }

  return matches
}

const ensureBankedScriptFunctionDefinitions = (sourceContent: string): string => {
  const matches = scanTopLevelScriptFunctionDefinitions(sourceContent)
    .filter((match) => match.qualifier === null)
    .sort((left, right) => right.braceIndex - left.braceIndex)

  return matches.reduce((nextContent, match) => {
    return `${nextContent.slice(0, match.braceIndex)} BANKED${nextContent.slice(match.braceIndex)}`
  }, sourceContent)
}

const collectBankedScriptFunctionNames = (sourceContent: string): Set<string> => {
  const names = new Set<string>()

  for (const match of scanTopLevelScriptFunctionDefinitions(sourceContent)) {
    if (match.qualifier !== 'NONBANKED') {
      names.add(match.functionName)
    }
  }

  return names
}

const ensureBankedScriptHeaderPrototypes = (
  headerContent: string,
  functionNames: Set<string>
): string => {
  if (functionNames.size === 0) {
    return headerContent
  }

  const escapedNames = [...functionNames]
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const prototypePattern = new RegExp(
    `(^|\\n)([ \\t]*(?!(?:static|if|else|for|while|switch|return|sizeof|do|case|default|typedef|struct|union|enum)\\b)[^;{}#]*?\\b(?:${escapedNames})\\s*\\([^;{}]*\\))\\s*(?:BANKED|NONBANKED)?\\s*;`,
    'g'
  )

  const nextHeaderContent = headerContent.replace(
    prototypePattern,
    (_match, prefix: string, declaration: string) => {
      return `${prefix}${declaration} BANKED;`
    }
  )

  if (
    nextHeaderContent.includes(' BANKED;') &&
    !/#include\s+"MainDefinitions\.h"/.test(nextHeaderContent)
  ) {
    return nextHeaderContent.replace(
      /(#ifndef\s+[A-Za-z_][A-Za-z0-9_]*\s*\n#define\s+[A-Za-z_][A-Za-z0-9_]*\s*)/,
      '$1\n#include "MainDefinitions.h"\n'
    )
  }

  return nextHeaderContent
}

// looks for any scripts that contain functions that match the callback pattern, returns candidates with the
// function name and script info
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

// looks for the MAX_COLLISION_CALLBACKS define in ColliderRegistry.h and returns its value or a default of 4
export const readMaxCollisionCallbacks = async (projectPath: string): Promise<number> => {
  return withProjectCoreFileOperation(projectPath, async () => {
    const normalizedProjectPath = await ensureProjectDirectory(projectPath)
    const headerPath = resolvePathWithinProject(
      normalizedProjectPath,
      'src/Collisions/ColliderRegistry.h'
    )

    try {
      const headerContent = await readFile(headerPath, 'utf-8')
      const match = headerContent.match(/#define\s+MAX_COLLISION_CALLBACKS\s+(\d+)/)
      return match ? Number(match[1]) : 4
    } catch (error) {
      if (isMissingFileError(error)) {
        return 4
      }

      throw error
    }
  })
}

// looks for the tags array in Actor.h and Collider.h and returns the smallest size found or a default of 5
export const readMaxTagSlots = async (projectPath: string): Promise<number> => {
  return withProjectCoreFileOperation(projectPath, async () => {
    const normalizedProjectPath = await ensureProjectDirectory(projectPath)
    const headerPaths = ['src/Actor/Actor.h', 'src/Collisions/Collider.h']
    const slotCounts: number[] = []

    for (const headerPath of headerPaths) {
      const absolutePath = resolvePathWithinProject(normalizedProjectPath, headerPath)
      let headerContent = ''

      try {
        headerContent = await readFile(absolutePath, 'utf-8')
      } catch (error) {
        if (isMissingFileError(error)) {
          continue
        }

        throw error
      }

      const match = headerContent.match(/Tags\s+tags\[(\d+)\]/)

      if (match) {
        slotCounts.push(Number(match[1]))
      }
    }

    return slotCounts.length > 0 ? Math.min(...slotCounts) : 5
  })
}

const isCanonicalProjectScriptPath = (resourcePath: string): boolean => {
  return (
    isProjectScriptSourcePath(resourcePath) && getProjectScriptKindFromPath(resourcePath) !== null
  )
}

const collectProjectResourcePaths = async (projectPath: string): Promise<string[]> => {
  return walkRelativePaths(projectPath, '', IGNORED_PROJECT_RESOURCE_ROOT_DIRECTORIES)
}

// walks through project resources, checks if they are scripts that aren't placeholders or managed and
// builds records for them
export const loadProjectScriptRecords = async (
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
