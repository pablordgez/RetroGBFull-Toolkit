import { readFile, writeFile } from 'fs/promises'
import { basename } from 'path'
import { ProjectLauncherError, validateProjectDirectory } from './projectLauncher'
import {
  isValidProjectResourceBank,
  normalizeResourcePath
} from './projectResourcePaths'
import { getProjectAssetKindFromFileName } from '../shared/projectAssets'
import { DEFAULT_PROJECT_RESOURCE_BANK } from '../shared/projectResourceModels'
import {
  parseProjectSaveDataState,
  serializeProjectSaveDataState,
  validateProjectSaveDataEntries,
  type ProjectSaveDataState
} from '../shared/projectSaveData'
import {
  parseProjectTagState,
  serializeProjectTagState,
  validateProjectTags,
  type ProjectTagState
} from '../shared/projectTags'
import { getProjectScriptKindFromPath, isProjectScriptSourcePath } from '../shared/projectScripts'

interface StoredProjectFile extends Record<string, unknown> {
  resources?: Record<string, unknown>
  saveData?: unknown
  tags?: unknown
  startingScenePath?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const parseStoredStartingScenePath = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedPath = normalizeResourcePath(value)

  if (!normalizedPath || getProjectAssetKindFromFileName(basename(normalizedPath)) !== 'scene') {
    return null
  }

  return normalizedPath
}

const isBankableResourcePath = (resourcePath: string): boolean => {
  if (isProjectScriptSourcePath(resourcePath) && getProjectScriptKindFromPath(resourcePath)) {
    return true
  }

  const assetKind = getProjectAssetKindFromFileName(basename(resourcePath))

  return (
    assetKind === 'sprite' ||
    assetKind === 'tileset' ||
    assetKind === 'tilemap' ||
    assetKind === 'window'
  )
}

const readStoredProjectFile = async (
  projectPath: string
): Promise<{
  jsonPath: string
  projectPath: string
  projectFile: StoredProjectFile
}> => {
  const validation = await validateProjectDirectory(projectPath)

  if (!validation.isValid) {
    throw new ProjectLauncherError(
      validation.message ?? 'The selected project could not be loaded.'
    )
  }

  const rawContent = await readFile(validation.jsonPath, 'utf-8')
  const parsedContent = JSON.parse(rawContent)

  return {
    jsonPath: validation.jsonPath,
    projectPath: validation.path,
    projectFile: isRecord(parsedContent) ? parsedContent : {}
  }
}

// build a map with resources and their bank, if the resource doesn't have a bank assigned it will assign 255
const buildTrackedResourceBankMap = (projectFile: StoredProjectFile): Map<string, number> => {
  const resourcesSection = isRecord(projectFile.resources) ? projectFile.resources : {}
  const items = Array.isArray(resourcesSection.items) ? resourcesSection.items : []
  const bankMap = new Map<string, number>()

  for (const item of items) {
    if (!isRecord(item) || item.type !== 'file' || typeof item.path !== 'string') {
      continue
    }

    const normalizedPath = normalizeResourcePath(item.path)

    if (!normalizedPath || !isBankableResourcePath(normalizedPath)) {
      continue
    }

    bankMap.set(
      normalizedPath,
      isValidProjectResourceBank(item.bank) ? Number(item.bank) : DEFAULT_PROJECT_RESOURCE_BANK
    )
  }

  return bankMap
}

export const readProjectTrackedResourceBanks = async (
  projectPath: string
): Promise<Map<string, number>> => {
  const { projectFile } = await readStoredProjectFile(projectPath)
  return buildTrackedResourceBankMap(projectFile)
}

export const readProjectTrackedResourceBank = async (
  projectPath: string,
  resourcePath: string
): Promise<number> => {
  const normalizedPath = normalizeResourcePath(resourcePath)

  if (!normalizedPath || !isBankableResourcePath(normalizedPath)) {
    return DEFAULT_PROJECT_RESOURCE_BANK
  }

  const bankMap = await readProjectTrackedResourceBanks(projectPath)
  return bankMap.get(normalizedPath) ?? DEFAULT_PROJECT_RESOURCE_BANK
}

export const loadProjectSaveDataState = async (
  projectPath: string
): Promise<ProjectSaveDataState> => {
  const { projectFile } = await readStoredProjectFile(projectPath)
  return parseProjectSaveDataState(projectFile.saveData)
}

// returns the list of tags from the project file
export const loadProjectTagState = async (projectPath: string): Promise<ProjectTagState> => {
  const { projectFile } = await readStoredProjectFile(projectPath)
  return parseProjectTagState(projectFile.tags)
}

export const loadProjectStartingScenePath = async (
  projectPath: string
): Promise<string | null> => {
  const { projectFile } = await readStoredProjectFile(projectPath)
  return parseStoredStartingScenePath(projectFile.startingScenePath)
}

export const saveProjectSaveDataState = async (
  projectPath: string,
  saveDataState: ProjectSaveDataState
): Promise<ProjectSaveDataState> => {
  const validationIssues = validateProjectSaveDataEntries(saveDataState.entries)

  if (validationIssues.length > 0) {
    throw new ProjectLauncherError(validationIssues[0].message)
  }

  const { jsonPath, projectFile } = await readStoredProjectFile(projectPath)
  const nextProjectFile: StoredProjectFile = {
    ...projectFile,
    saveData: serializeProjectSaveDataState(saveDataState)
  }

  await writeFile(jsonPath, `${JSON.stringify(nextProjectFile, null, 2)}\n`, 'utf-8')

  return {
    entries: saveDataState.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      defaultValue: entry.defaultValue
    }))
  }
}

// writes the project file with the tags section updated with the passed tags
export const saveProjectTagState = async (
  projectPath: string,
  tagState: ProjectTagState
): Promise<ProjectTagState> => {
  const validationIssues = validateProjectTags(tagState.entries)

  if (validationIssues.length > 0) {
    throw new ProjectLauncherError(validationIssues[0].message)
  }

  const { jsonPath, projectFile } = await readStoredProjectFile(projectPath)
  const nextProjectFile: StoredProjectFile = {
    ...projectFile,
    tags: serializeProjectTagState(tagState)
  }

  await writeFile(jsonPath, `${JSON.stringify(nextProjectFile, null, 2)}\n`, 'utf-8')

  return {
    entries: tagState.entries.map((entry) => ({
      id: entry.id,
      name: entry.name
    }))
  }
}
