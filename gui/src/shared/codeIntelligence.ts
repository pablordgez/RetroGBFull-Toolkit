import type {
  ProjectCodeEnumSymbol,
  ProjectCodeFunctionParameter,
  ProjectCodeFunctionSymbol,
  ProjectCodeMacroSymbol,
  ProjectCodeStructField,
  ProjectCodeStructSymbol,
  ProjectCodeSymbolIndex,
  ProjectCodeTypeAliasSymbol,
  ProjectCodeTypeReference,
  ProjectCodeVariableSymbol
} from './projectCodeWorkspace'

interface ParseProjectCodeSymbolIndexOptions {
  declaredIn?: string
  includeLocalVariables?: boolean
}

interface ParsedMacroDefinition {
  name: string
  parameters: string[] | null
  body: string
}

const CONTROL_KEYWORDS = new Set([
  'case',
  'do',
  'else',
  'for',
  'if',
  'return',
  'sizeof',
  'switch',
  'typedef',
  'while'
])

const TYPE_QUALIFIERS = new Set([
  'auto',
  'const',
  'enum',
  'extern',
  'inline',
  'long',
  'register',
  'short',
  'signed',
  'static',
  'struct',
  'typedef',
  'unsigned',
  'volatile',
  'BANKED',
  'NONBANKED'
])

const TYPEDEF_STRUCT_PATTERN =
  /typedef\s+struct(?:\s+[A-Za-z_][A-Za-z0-9_]*)?\s*\{([\s\S]*?)\}\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/g
const TYPEDEF_ENUM_PATTERN =
  /typedef\s+enum(?:\s+[A-Za-z_][A-Za-z0-9_]*)?\s*\{([\s\S]*?)\}\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/g
const TYPE_ALIAS_PATTERN =
  /typedef\s+([^;{}()]+?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g
const FUNCTION_PATTERN =
  /(^|[;\n}])\s*(?!typedef\b|return\b|if\b|for\b|while\b|switch\b)([A-Za-z_][A-Za-z0-9_\s\*]*?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^;{}()]*)\)\s*(?:BANKED|NONBANKED)?\s*(?=;|\{)/gm
const EXTERN_VARIABLE_PATTERN =
  /(^|\n)\s*extern\s+([^;()]+?)\s+(\**)\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?\s*;/g

// changes comments for white spaces
const sanitizeComments = (content: string): string => {
  let sanitized = ''
  let index = 0
  let mode: 'normal' | 'line-comment' | 'block-comment' | 'string' | 'char' = 'normal'

  while (index < content.length) {
    const currentCharacter = content[index]
    const nextCharacter = content[index + 1] ?? ''

    // if in a line comment
    if (mode === 'line-comment') {
      // replace comment with spaces, jump line at line end
      sanitized += currentCharacter === '\n' ? '\n' : ' '

      // at line end, switch back to no comment
      if (currentCharacter === '\n') {
        mode = 'normal'
      }

      index += 1
      continue
    }


    if (mode === 'block-comment') {
      // replace comment end with spaces, switch back to no comment
      if (currentCharacter === '*' && nextCharacter === '/') {
        sanitized += '  '
        index += 2
        mode = 'normal'
        continue
      }
      // replace comment with spaces, jump line at line end
      sanitized += currentCharacter === '\n' ? '\n' : ' '
      index += 1
      continue
    }

    // if in a string
    if (mode === 'string') {
      // copy the current character
      sanitized += currentCharacter

      // and if it's an escape character, also copy the next one and jump it (to avoid ending the string early on a \" character)
      if (currentCharacter === '\\') {
        sanitized += nextCharacter
        index += 2
        continue
      }

      // at string end, switch back to no comment
      if (currentCharacter === '"') {
        mode = 'normal'
      }

      index += 1
      continue
    }

    // like string but with ' for end
    if (mode === 'char') {
      sanitized += currentCharacter

      if (currentCharacter === '\\') {
        sanitized += nextCharacter
        index += 2
        continue
      }

      if (currentCharacter === "'") {
        mode = 'normal'
      }

      index += 1
      continue
    }

    // comment start
    if (currentCharacter === '/' && nextCharacter === '/') {
      sanitized += '  '
      index += 2
      mode = 'line-comment'
      continue
    }

    // block comment start
    if (currentCharacter === '/' && nextCharacter === '*') {
      sanitized += '  '
      index += 2
      mode = 'block-comment'
      continue
    }

    // string start
    if (currentCharacter === '"') {
      sanitized += currentCharacter
      index += 1
      mode = 'string'
      continue
    }

    // char start
    if (currentCharacter === "'") {
      sanitized += currentCharacter
      index += 1
      mode = 'char'
      continue
    }

    sanitized += currentCharacter
    index += 1
  }

  return sanitized
}

const normalizeWhitespace = (content: string): string => {
  return content.replace(/\s+/g, ' ').trim()
}

// split a string by a separator, unless the separator is inside parentheses, brackets or braces
const splitTopLevel = (content: string, separator: string): string[] => {
  const parts: string[] = []
  let current = ''
  let depth = 0

  for (const character of content) {
    if (character === '(' || character === '[' || character === '{') {
      depth += 1
    } else if ((character === ')' || character === ']' || character === '}') && depth > 0) {
      depth -= 1
    }

    if (character === separator && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }

    current += character
  }

  if (current.length > 0) {
    parts.push(current)
  }

  return parts
}

const parseTypeReference = (rawType: string): ProjectCodeTypeReference | null => {
  const normalizedType = normalizeWhitespace(rawType)

  if (!normalizedType) {
    return null
  }

  const pointerDepth = (normalizedType.match(/\*/g) ?? []).length
  const cleanedType = normalizedType.replace(/\*/g, ' ')
  const tokens = cleanedType
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !TYPE_QUALIFIERS.has(token))

  const name = tokens.at(-1) ?? ''

  if (!name) {
    return null
  }

  return {
    name,
    pointerDepth
  }
}

const parseFieldDeclarations = (content: string): ProjectCodeStructField[] => {
  const fields: ProjectCodeStructField[] = []
  const declarations = content
    .split(';')
    .map((declaration) => normalizeWhitespace(declaration))
    .filter(Boolean)

  for (const declaration of declarations) {
    if (declaration.includes('(')) {
      continue
    }

    const match = declaration.match(
      /^(.+?)\s+(\**)\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?$/
    )

    if (!match) {
      continue
    }

    const type = parseTypeReference(`${match[1]} ${match[2]}`.trim())
    fields.push({
      name: match[3],
      type,
      isArray: declaration.includes('[')
    })
  }

  return fields
}

const parseMacroDefinitions = (content: string): ParsedMacroDefinition[] => {
  const definitions: ParsedMacroDefinition[] = []
  const lines = content.split('\n')
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const match = line.match(/^\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?\s*(.*)$/)

    if (!match) {
      index += 1
      continue
    }

    const bodyLines = [match[3] ?? '']

    // if the line ends with a backslash, the macro body continues on the next line
    while (bodyLines.at(-1)?.trimEnd().endsWith('\\')) {
      bodyLines[bodyLines.length - 1] = bodyLines[bodyLines.length - 1].replace(/\\\s*$/, '')
      index += 1

      if (index >= lines.length) {
        break
      }

      bodyLines.push(lines[index])
    }

    definitions.push({
      name: match[1],
      parameters: match[2]
        ? match[2]
            .split(',')
            .map((parameter) => parameter.trim())
            .filter(Boolean)
        : null,
      body: bodyLines.join('\n').trim()
    })

    index += 1
  }

  return definitions
}

// extracts the first argument of a macro invocation (usually a name/identifier)
const extractValuesFromMacroInvocationList = (macroBody: string): string[] => {
  const values = new Set<string>()
  const invocationPattern = /[A-Za-z_][A-Za-z0-9_]*\(\s*([A-Za-z_][A-Za-z0-9_]*)/g

  for (const match of macroBody.matchAll(invocationPattern)) {
    values.add(match[1])
  }

  return [...values]
}

const parseEnumValuesWithMacros = (
  content: string,
  macroDefinitionsByName: Map<string, ParsedMacroDefinition>
): string[] => {
  const values = new Set<string>()

  // iterate enum values
  const entries = splitTopLevel(content, ',').flatMap((entry) => entry.split('\n'))

  for (const entry of entries) {
    const normalizedEntry = entry.split('=')[0]?.trim() ?? ''

    if (!normalizedEntry) {
      continue
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalizedEntry)) {
      const macroDefinition = macroDefinitionsByName.get(normalizedEntry)

      // if it's a macro without parameters, try to extract values from its body
      // (this is the structure for a macro that expands to a list of macro invocations)
      // it uses the previous function, so it extracts the first parameter of the macro invocation
      if (macroDefinition && macroDefinition.parameters === null) {
        for (const macroValue of extractValuesFromMacroInvocationList(macroDefinition.body)) {
          values.add(macroValue)
        }
        continue
      }

      // otherwise, it's a normal enum value
      values.add(normalizedEntry)
    }
  }

  return [...values]
}

const parseFunctionParameters = (content: string): ProjectCodeFunctionParameter[] => {
  const normalizedParameters = normalizeWhitespace(content)

  if (!normalizedParameters || normalizedParameters === 'void') {
    return []
  }

  return splitTopLevel(content, ',')
    .map((parameter) => normalizeWhitespace(parameter))
    .filter(Boolean)
    .flatMap((parameter): ProjectCodeFunctionParameter[] => {
      const match = parameter.match(/^(.+?)\s+(\**)\s*([A-Za-z_][A-Za-z0-9_]*)$/)

      if (!match) {
        return []
      }

      return [
        {
          name: match[3],
          type: parseTypeReference(`${match[1]} ${match[2]}`.trim())
        }
      ]
    })
}

// parses variable declarations into name, declaredIn (comes as parameter), type and scope (comes as parameter)
const parseDeclarationStatement = (
  statement: string,
  scope: ProjectCodeVariableSymbol['scope'],
  declaredIn?: string
): ProjectCodeVariableSymbol[] => {
  const normalizedStatement = normalizeWhitespace(statement.replace(/;$/, ''))

  if (!normalizedStatement) {
    return []
  }

  if (
    normalizedStatement.startsWith('#') ||
    normalizedStatement.startsWith('typedef ') ||
    CONTROL_KEYWORDS.has(normalizedStatement.split(/\s+/)[0] ?? '')
  ) {
    return []
  }

  const match = normalizedStatement.match(/^(.+?)\s+(.+)$/)

  if (!match) {
    return []
  }

  const baseType = match[1]
  const declarators = splitTopLevel(match[2], ',')
  const variables: ProjectCodeVariableSymbol[] = []

  for (const declarator of declarators) {
    const withoutInitializer = normalizeWhitespace((declarator.split('=')[0] ?? '').trim())

    if (!withoutInitializer || withoutInitializer.includes('(')) {
      continue
    }

    const declaratorMatch = withoutInitializer.match(
      /^(\**)\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?$/
    )

    if (!declaratorMatch) {
      continue
    }

    variables.push({
      name: declaratorMatch[2],
      declaredIn,
      type: parseTypeReference(`${baseType} ${declaratorMatch[1]}`.trim()),
      scope
    })
  }

  return variables
}

// split code into statements and parse variable declarations
const parseLocalVariables = (sanitizedContent: string, declaredIn?: string): ProjectCodeVariableSymbol[] => {
  return sanitizedContent
    .replace(/[{}]/g, ';')
    .split(';')
    .flatMap((statement) => parseDeclarationStatement(statement, 'local', declaredIn))
}

// searches through a list of symbols (objects with name), adds them to a map and if it finds a duplicate, merges using
// a function passed as a parameter, or keeps the old one if there is no function
const dedupeSymbols = <TSymbol extends { name: string }>(
  symbols: TSymbol[],
  merge?: (current: TSymbol, next: TSymbol) => TSymbol
): TSymbol[] => {
  const symbolsByName = new Map<string, TSymbol>()

  for (const symbol of symbols) {
    const existingSymbol = symbolsByName.get(symbol.name)

    if (!existingSymbol) {
      symbolsByName.set(symbol.name, symbol)
      continue
    }

    symbolsByName.set(symbol.name, merge ? merge(existingSymbol, symbol) : existingSymbol)
  }

  return [...symbolsByName.values()]
}

const mergeStructs = (
  current: ProjectCodeStructSymbol,
  next: ProjectCodeStructSymbol
): ProjectCodeStructSymbol => ({
  ...current,
  declaredIn: current.declaredIn ?? next.declaredIn,
  fields: dedupeSymbols([...current.fields, ...next.fields])
})

const mergeEnums = (
  current: ProjectCodeEnumSymbol,
  next: ProjectCodeEnumSymbol
): ProjectCodeEnumSymbol => ({
  ...current,
  declaredIn: current.declaredIn ?? next.declaredIn,
  values: [...new Set([...current.values, ...next.values])]
})

export const createEmptyProjectCodeSymbolIndex = (): ProjectCodeSymbolIndex => ({
  structs: [],
  enums: [],
  functions: [],
  variables: [],
  macros: [],
  typeAliases: [],
  sourceFilesScanned: 0
})

export const mergeProjectCodeSymbolIndexes = (
  symbolIndexes: ProjectCodeSymbolIndex[]
): ProjectCodeSymbolIndex => ({
  structs: dedupeSymbols(
    symbolIndexes.flatMap((index) => index.structs),
    mergeStructs
  ),
  enums: dedupeSymbols(symbolIndexes.flatMap((index) => index.enums), mergeEnums),
  functions: dedupeSymbols(symbolIndexes.flatMap((index) => index.functions)),
  variables: dedupeSymbols(symbolIndexes.flatMap((index) => index.variables)),
  macros: dedupeSymbols(symbolIndexes.flatMap((index) => index.macros)),
  typeAliases: dedupeSymbols(symbolIndexes.flatMap((index) => index.typeAliases)),
  sourceFilesScanned: symbolIndexes.reduce((total, index) => total + index.sourceFilesScanned, 0)
})

// parses a C code string, extracts different types of symbols, and returns a ProjectCodeSymbolIndex with
// the deduped symbols
export const parseProjectCodeSymbolIndexFromText = (
  content: string,
  options?: ParseProjectCodeSymbolIndexOptions
): ProjectCodeSymbolIndex => {
  const declaredIn = options?.declaredIn
  const sanitizedContent = sanitizeComments(content)
  const macroDefinitions = parseMacroDefinitions(content)
  const macroDefinitionsByName = new Map(macroDefinitions.map((definition) => [definition.name, definition]))
  const structs: ProjectCodeStructSymbol[] = []
  const enums: ProjectCodeEnumSymbol[] = []
  const functions: ProjectCodeFunctionSymbol[] = []
  const variables: ProjectCodeVariableSymbol[] = []
  const macros: ProjectCodeMacroSymbol[] = []
  const typeAliases: ProjectCodeTypeAliasSymbol[] = []

  for (const match of sanitizedContent.matchAll(TYPEDEF_STRUCT_PATTERN)) {
    structs.push({
      name: match[2],
      declaredIn,
      fields: parseFieldDeclarations(match[1])
    })
  }

  for (const match of sanitizedContent.matchAll(TYPEDEF_ENUM_PATTERN)) {
    enums.push({
      name: match[2],
      declaredIn,
      values: parseEnumValuesWithMacros(match[1], macroDefinitionsByName)
    })
  }

  for (const match of sanitizedContent.matchAll(TYPE_ALIAS_PATTERN)) {
    const aliasName = match[2]

    if (structs.some((entry) => entry.name === aliasName) || enums.some((entry) => entry.name === aliasName)) {
      continue
    }

    typeAliases.push({
      name: aliasName,
      declaredIn,
      targetType: parseTypeReference(match[1])
    })
  }

  for (const match of sanitizedContent.matchAll(FUNCTION_PATTERN)) {
    const functionName = match[3]

    if (CONTROL_KEYWORDS.has(functionName)) {
      continue
    }

    functions.push({
      name: functionName,
      declaredIn,
      returnType: parseTypeReference(match[2]),
      parameters: parseFunctionParameters(match[4])
    })
  }

  for (const macroDefinition of macroDefinitions) {
    macros.push({
      name: macroDefinition.name,
      declaredIn,
      value: macroDefinition.body
    })
  }

  for (const match of sanitizedContent.matchAll(EXTERN_VARIABLE_PATTERN)) {
    variables.push({
      name: match[4],
      declaredIn,
      type: parseTypeReference(`${match[2]} ${match[3]}`.trim()),
      scope: 'workspace'
    })
  }

  if (options?.includeLocalVariables) {
    variables.push(...parseLocalVariables(sanitizedContent, declaredIn))

    for (const functionSymbol of functions) {
      for (const parameter of functionSymbol.parameters) {
        variables.push({
          name: parameter.name,
          declaredIn,
          type: parameter.type,
          scope: 'parameter'
        })
      }
    }
  }

  return {
    structs: dedupeSymbols(structs, mergeStructs),
    enums: dedupeSymbols(enums, mergeEnums),
    functions: dedupeSymbols(functions),
    variables: dedupeSymbols(variables),
    macros: dedupeSymbols(macros),
    typeAliases: dedupeSymbols(typeAliases),
    sourceFilesScanned: 0
  }
}

