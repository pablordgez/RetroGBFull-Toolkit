import { normalizeCodeIdentifier } from './codeIdentifiers'
import type {
  ParsedScriptPropertyDefinition,
  ProjectCodeEnumSymbol,
  ProjectCodeStructSymbol,
  ProjectCodeSymbolIndex
} from './projectCodeWorkspace'
import { getProjectScriptDisplayName } from './projectScripts'

export type ScriptPropertyValue = number | boolean | string | null
export type ScriptPropertyMap = Record<string, ScriptPropertyValue>

const INTEGER_TYPE_RANGES: Record<
  string,
  { minimum: number; maximum: number; isSigned: boolean }
> = {
  uint8_t: { minimum: 0, maximum: 0xff, isSigned: false },
  int8_t: { minimum: -0x80, maximum: 0x7f, isSigned: true },
  uint16_t: { minimum: 0, maximum: 0xffff, isSigned: false },
  int16_t: { minimum: -0x8000, maximum: 0x7fff, isSigned: true },
  uint32_t: { minimum: 0, maximum: 0xffffffff, isSigned: false },
  int32_t: { minimum: -0x80000000, maximum: 0x7fffffff, isSigned: true },
  UBYTE: { minimum: 0, maximum: 0xff, isSigned: false },
  BYTE: { minimum: -0x80, maximum: 0x7f, isSigned: true },
  UWORD: { minimum: 0, maximum: 0xffff, isSigned: false },
  WORD: { minimum: -0x8000, maximum: 0x7fff, isSigned: true },
  DWORD: { minimum: 0, maximum: 0xffffffff, isSigned: false }
}

const BOOLEAN_TYPES = new Set(['bool', 'BOOLEAN'])

const findStructForScript = (
  scriptPath: string,
  symbolIndex: ProjectCodeSymbolIndex
): ProjectCodeStructSymbol | null => {
  const scriptName = getProjectScriptDisplayName(scriptPath.split(/[\\/]/).at(-1) ?? scriptPath)
  const structName = normalizeCodeIdentifier(scriptName)

  return symbolIndex.structs.find((entry) => entry.name === structName) ?? null
}

const findEnumSymbol = (
  typeName: string,
  symbolIndex: ProjectCodeSymbolIndex
): ProjectCodeEnumSymbol | null => {
  const visitedTypeNames = new Set<string>()
  let currentTypeName = typeName

  while (!visitedTypeNames.has(currentTypeName)) {
    visitedTypeNames.add(currentTypeName)

    const enumSymbol = symbolIndex.enums.find((entry) => entry.name === currentTypeName)

    if (enumSymbol) {
      return enumSymbol
    }

    const typeAlias = symbolIndex.typeAliases.find((entry) => entry.name === currentTypeName)

    if (!typeAlias?.targetType || typeAlias.targetType.pointerDepth > 0) {
      break
    }

    currentTypeName = typeAlias.targetType.name
  }

  return null
}

export const getParsedScriptPropertyDefinitions = (
  scriptPath: string | null,
  symbolIndex: ProjectCodeSymbolIndex | null
): ParsedScriptPropertyDefinition[] => {
  if (!scriptPath || !symbolIndex) {
    return []
  }

  const structSymbol = findStructForScript(scriptPath, symbolIndex)

  if (!structSymbol) {
    return []
  }

  return structSymbol.fields.flatMap((field): ParsedScriptPropertyDefinition[] => {
    if (field.name === 'base' || field.isArray || !field.type) {
      return []
    }

    const typeName = field.type.name

    if (field.type.pointerDepth === 1 && typeName === 'Animation') {
      return [
        {
          name: field.name,
          kind: 'animation',
          typeName
        }
      ]
    }

    if (field.type.pointerDepth > 0) {
      return []
    }

    const integerRange = INTEGER_TYPE_RANGES[typeName]

    if (integerRange) {
      return [
        {
          name: field.name,
          kind: 'integer',
          typeName,
          minimum: integerRange.minimum,
          maximum: integerRange.maximum,
          isSigned: integerRange.isSigned
        }
      ]
    }

    if (BOOLEAN_TYPES.has(typeName)) {
      return [
        {
          name: field.name,
          kind: 'boolean',
          typeName
        }
      ]
    }

    const enumSymbol = findEnumSymbol(typeName, symbolIndex)

    if (enumSymbol && enumSymbol.values.length > 0) {
      return [
        {
          name: field.name,
          kind: 'enum',
          typeName: enumSymbol.name,
          enumValues: enumSymbol.values
        }
      ]
    }

    return []
  })
}

export const getStoredScriptPropertyValue = (
  definition: ParsedScriptPropertyDefinition,
  properties: ScriptPropertyMap | null | undefined
): ScriptPropertyValue | undefined => {
  const rawValue = properties?.[definition.name]

  if (rawValue === undefined) {
    return undefined
  }

  switch (definition.kind) {
    case 'integer':
      return typeof rawValue === 'number' &&
        Number.isInteger(rawValue) &&
        rawValue >= (definition.minimum ?? Number.MIN_SAFE_INTEGER) &&
        rawValue <= (definition.maximum ?? Number.MAX_SAFE_INTEGER)
        ? rawValue
        : undefined
    case 'boolean':
      return typeof rawValue === 'boolean' ? rawValue : undefined
    case 'animation':
      return rawValue === null || typeof rawValue === 'string' ? rawValue : undefined
    case 'enum':
      return rawValue === null ||
        (typeof rawValue === 'string' && definition.enumValues?.includes(rawValue))
        ? rawValue
        : undefined
  }
}

export const validateScriptPropertyDraft = (
  definition: ParsedScriptPropertyDefinition,
  draftValue: string | boolean | null
): { value: ScriptPropertyValue; error: null } | { value: null; error: string } => {
  if (definition.kind === 'boolean') {
    if (typeof draftValue !== 'boolean') {
      return {
        value: null,
        error: 'This field expects a boolean value.'
      }
    }

    return {
      value: draftValue,
      error: null
    }
  }

  if (definition.kind === 'animation') {
    if (draftValue === null || typeof draftValue === 'string') {
      return {
        value: draftValue,
        error: null
      }
    }

    return {
      value: null,
      error: 'This field expects a sprite selection.'
    }
  }

  if (definition.kind === 'enum') {
    if (draftValue === null) {
      return {
        value: null,
        error: null
      }
    }

    if (typeof draftValue !== 'string') {
      return {
        value: null,
        error: 'This field expects an enum value.'
      }
    }

    if (draftValue.length === 0) {
      return {
        value: null,
        error: null
      }
    }

    if (definition.enumValues?.includes(draftValue)) {
      return {
        value: draftValue,
        error: null
      }
    }

    return {
      value: null,
      error: 'Choose one of the available values.'
    }
  }

  if (typeof draftValue !== 'string') {
    return {
      value: null,
      error: 'Enter a numeric value.'
    }
  }

  const trimmedDraft = draftValue.trim()

  if (trimmedDraft.length === 0) {
    return {
      value: null,
      error: 'Enter a value.'
    }
  }

  const parsedValue = Number(trimmedDraft)

  if (!Number.isFinite(parsedValue) || !Number.isInteger(parsedValue)) {
    return {
      value: null,
      error: 'Enter a whole number.'
    }
  }

  if (definition.minimum !== undefined && parsedValue < definition.minimum) {
    return {
      value: null,
      error: `Minimum value is ${definition.minimum}.`
    }
  }

  if (definition.maximum !== undefined && parsedValue > definition.maximum) {
    return {
      value: null,
      error: `Maximum value is ${definition.maximum}.`
    }
  }

  return {
    value: parsedValue,
    error: null
  }
}
