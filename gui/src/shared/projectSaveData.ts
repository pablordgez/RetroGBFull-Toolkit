export interface ProjectSaveDataEntry {
  id: string
  name: string
  type: string
  defaultValue: string
}

export interface ProjectSaveDataState {
  entries: ProjectSaveDataEntry[]
}

export interface ProjectSaveDataValidationIssue {
  entryId: string
  field: 'name' | 'type' | 'defaultValue'
  message: string
}

export const RESERVED_PROJECT_SAVE_DATA_NAMES = new Set(['signature'])

const C_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

export const isValidProjectSaveDataIdentifier = (value: string): boolean => {
  return C_IDENTIFIER_PATTERN.test(value.trim())
}

export const parseProjectSaveDataState = (value: unknown): ProjectSaveDataState => {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    return {
      entries: []
    }
  }

  return {
    entries: value.entries.flatMap((entry): ProjectSaveDataEntry[] => {
      if (
        !isRecord(entry) ||
        typeof entry.id !== 'string' ||
        typeof entry.name !== 'string' ||
        typeof entry.type !== 'string' ||
        typeof entry.defaultValue !== 'string'
      ) {
        return []
      }

      return [
        {
          id: entry.id,
          name: entry.name,
          type: entry.type,
          defaultValue: entry.defaultValue
        }
      ]
    })
  }
}

export const serializeProjectSaveDataState = (
  state: ProjectSaveDataState
): Record<string, unknown> => {
  return {
    entries: state.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      defaultValue: entry.defaultValue
    }))
  }
}

export const validateProjectSaveDataEntries = (
  entries: ProjectSaveDataEntry[]
): ProjectSaveDataValidationIssue[] => {
  const issues: ProjectSaveDataValidationIssue[] = []
  const namesByIdentifier = new Map<string, string[]>()

  for (const entry of entries) {
    const trimmedName = entry.name.trim()
    const trimmedType = entry.type.trim()
    const trimmedDefaultValue = entry.defaultValue.trim()

    if (!trimmedType) {
      issues.push({
        entryId: entry.id,
        field: 'type',
        message: 'Type is required.'
      })
    }

    if (!trimmedName) {
      issues.push({
        entryId: entry.id,
        field: 'name',
        message: 'Name is required.'
      })
    } else if (!isValidProjectSaveDataIdentifier(trimmedName)) {
      issues.push({
        entryId: entry.id,
        field: 'name',
        message: 'Name must be a valid C identifier.'
      })
    } else if (RESERVED_PROJECT_SAVE_DATA_NAMES.has(trimmedName)) {
      issues.push({
        entryId: entry.id,
        field: 'name',
        message: `"${trimmedName}" is reserved by the toolkit.`
      })
    } else {
      const matchingIds = namesByIdentifier.get(trimmedName) ?? []
      matchingIds.push(entry.id)
      namesByIdentifier.set(trimmedName, matchingIds)
    }

    if (!trimmedDefaultValue) {
      issues.push({
        entryId: entry.id,
        field: 'defaultValue',
        message: 'Default value is required.'
      })
    }
  }

  for (const entryIds of namesByIdentifier.values()) {
    if (entryIds.length < 2) {
      continue
    }

    for (const entryId of entryIds) {
      issues.push({
        entryId,
        field: 'name',
        message: 'Each save-data name must be unique.'
      })
    }
  }

  return issues
}
