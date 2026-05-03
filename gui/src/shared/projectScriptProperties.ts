import { normalizeCodeIdentifier } from './codeIdentifiers'
import type {
  ParsedScriptPropertyDefinition,
  ProjectCodeEnumSymbol,
  ProjectCodeStructSymbol,
  ProjectCodeSymbolIndex
} from './projectCodeWorkspace'
import { getProjectScriptDisplayName } from './projectScripts'

// handles script properties on right pane of scene editor

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

// gets the script name from the path and searches for a struct with the same name in the symbol index
const findStructForScript = (
  scriptPath: string,
  symbolIndex: ProjectCodeSymbolIndex
): ProjectCodeStructSymbol | null => {
  const scriptName = getProjectScriptDisplayName(scriptPath.split(/[\\/]/).at(-1) ?? scriptPath)
  const structName = normalizeCodeIdentifier(scriptName)

  return symbolIndex.structs.find((entry) => entry.name === structName) ?? null
}

// checks if the type is an enum, if so returns the enum symbol
const findEnumSymbol = (
  typeName: string,
  symbolIndex: ProjectCodeSymbolIndex
): ProjectCodeEnumSymbol | null => {
  const visitedTypeNames = new Set<string>()
  let currentTypeName = typeName

  while (!visitedTypeNames.has(currentTypeName)) {
    visitedTypeNames.add(currentTypeName)

    // check if the type name corresponds directly to an enum
    const enumSymbol = symbolIndex.enums.find((entry) => entry.name === currentTypeName)

    if (enumSymbol) {
      return enumSymbol
    }

    // if not, check if it's an alias to an enum
    const typeAlias = symbolIndex.typeAliases.find((entry) => entry.name === currentTypeName)

    // if it's not an alias, the alias doesn't point to a type or it points to a pointer type, stop the search
    if (!typeAlias?.targetType || typeAlias.targetType.pointerDepth > 0) {
      break
    }

    // if the type was an alias, continue the search with the target type
    currentTypeName = typeAlias.targetType.name
  }

  return null
}

// build the list of editable properties for a script
export const getParsedScriptPropertyDefinitions = (
  scriptPath: string | null,
  symbolIndex: ProjectCodeSymbolIndex | null
): ParsedScriptPropertyDefinition[] => {
  if (!scriptPath || !symbolIndex) {
    return []
  }

  // find the struct for the script
  const structSymbol = findStructForScript(scriptPath, symbolIndex)

  if (!structSymbol) {
    return []
  }

  return structSymbol.fields.flatMap((field): ParsedScriptPropertyDefinition[] => {
    // ignore the 'base' field, array fields, and fields without a type
    if (field.name === 'base' || field.isArray || !field.type) {
      return []
    }

    const typeName = field.type.name

    // allow pointers to animations
    if (field.type.pointerDepth === 1 && typeName === 'Animation') {
      return [
        {
          name: field.name,
          kind: 'animation',
          typeName
        }
      ]
    }

    // don't allow any other pointers
    if (field.type.pointerDepth > 0) {
      return []
    }

    const integerRange = INTEGER_TYPE_RANGES[typeName]

    // allow integer types and build with the specific integer specs
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

    // allow boolean types
    if (BOOLEAN_TYPES.has(typeName)) {
      return [
        {
          name: field.name,
          kind: 'boolean',
          typeName
        }
      ]
    }


    // allow enums, check if it's an enum or an alias to an enum and build with the enum values
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

// gets the stored value for one of the script properties
// returns undefined if there is no value or the value is invalid
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

// validates the editor input, returning either an object with null value and an error message or an object with the value and null error
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
