import { normalizeCodeIdentifier } from './codeIdentifiers'

export interface ProjectTagEntry {
  id: string
  name: string
}

export interface ProjectTagState {
  entries: ProjectTagEntry[]
}

export interface ProjectTagValidationIssue {
  entryId: string
  field: 'name'
  message: string
}

export const RESERVED_PROJECT_TAG_ENUMS = new Set(['TAG_NONE'])

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

export const buildProjectTagEnumName = (name: string): string => {
  return `TAG_${normalizeCodeIdentifier(name).toUpperCase()}`
}

// returns a list of tags with id and name
export const parseProjectTagState = (value: unknown): ProjectTagState => {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    return {
      entries: []
    }
  }

  return {
    entries: value.entries.flatMap((entry): ProjectTagEntry[] => {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
        return []
      }

      return [
        {
          id: entry.id,
          name: entry.name
        }
      ]
    })
  }
}

export const serializeProjectTagState = (state: ProjectTagState): Record<string, unknown> => {
  return {
    entries: state.entries.map((entry) => ({
      id: entry.id,
      name: entry.name
    }))
  }
}

// tags must have a non empty, non reserved and unique name
export const validateProjectTags = (entries: ProjectTagEntry[]): ProjectTagValidationIssue[] => {
  const issues: ProjectTagValidationIssue[] = []
  const entryIdsByEnumName = new Map<string, string[]>()

  for (const entry of entries) {
    const trimmedName = entry.name.trim()

    if (!trimmedName) {
      issues.push({
        entryId: entry.id,
        field: 'name',
        message: 'Name is required.'
      })
      continue
    }

    const enumName = buildProjectTagEnumName(trimmedName)

    if (RESERVED_PROJECT_TAG_ENUMS.has(enumName)) {
      issues.push({
        entryId: entry.id,
        field: 'name',
        message: `"${enumName}" is reserved by the engine.`
      })
      continue
    }

    entryIdsByEnumName.set(enumName, [...(entryIdsByEnumName.get(enumName) ?? []), entry.id])
  }

  for (const entryIds of entryIdsByEnumName.values()) {
    if (entryIds.length < 2) {
      continue
    }

    for (const entryId of entryIds) {
      issues.push({
        entryId,
        field: 'name',
        message: 'Each tag must generate a unique C enum name.'
      })
    }
  }

  return issues
}
