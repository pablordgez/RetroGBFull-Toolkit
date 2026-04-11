import type {
  ProjectCodeDiagnostic,
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

interface CursorPosition {
  line: number
  column: number
}

export interface ProjectCodeActiveCall {
  functionName: string
  activeParameterIndex: number
}

interface DelimiterEntry extends CursorPosition {
  character: '(' | '{' | '['
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
const MEMBER_ACCESS_PATTERN =
  /([A-Za-z_][A-Za-z0-9_]*(?:(?:->|\.)[A-Za-z_][A-Za-z0-9_]*)*)(?:->|\.)[A-Za-z0-9_]*$/
const DECLARATION_WITH_INITIALIZER_PATTERN =
  /^\s*([A-Za-z_][A-Za-z0-9_\s\*]*?)\s+(\**)\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/

const createPosition = (): CursorPosition => ({
  line: 1,
  column: 1
})

const clonePosition = (position: CursorPosition): CursorPosition => ({
  line: position.line,
  column: position.column
})

const advancePosition = (position: CursorPosition, character: string): void => {
  if (character === '\n') {
    position.line += 1
    position.column = 1
    return
  }

  position.column += 1
}

const buildDiagnostic = (
  message: string,
  start: CursorPosition,
  end: CursorPosition,
  severity: ProjectCodeDiagnostic['severity'] = 'error'
): ProjectCodeDiagnostic => ({
  message,
  severity,
  startLineNumber: start.line,
  startColumn: start.column,
  endLineNumber: end.line,
  endColumn: end.column
})

const sanitizeComments = (content: string): string => {
  let sanitized = ''
  let index = 0
  let mode: 'normal' | 'line-comment' | 'block-comment' | 'string' | 'char' = 'normal'

  while (index < content.length) {
    const currentCharacter = content[index]
    const nextCharacter = content[index + 1] ?? ''

    if (mode === 'line-comment') {
      sanitized += currentCharacter === '\n' ? '\n' : ' '

      if (currentCharacter === '\n') {
        mode = 'normal'
      }

      index += 1
      continue
    }

    if (mode === 'block-comment') {
      if (currentCharacter === '*' && nextCharacter === '/') {
        sanitized += '  '
        index += 2
        mode = 'normal'
        continue
      }

      sanitized += currentCharacter === '\n' ? '\n' : ' '
      index += 1
      continue
    }

    if (mode === 'string') {
      sanitized += currentCharacter

      if (currentCharacter === '\\') {
        sanitized += nextCharacter
        index += 2
        continue
      }

      if (currentCharacter === '"') {
        mode = 'normal'
      }

      index += 1
      continue
    }

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

    if (currentCharacter === '/' && nextCharacter === '/') {
      sanitized += '  '
      index += 2
      mode = 'line-comment'
      continue
    }

    if (currentCharacter === '/' && nextCharacter === '*') {
      sanitized += '  '
      index += 2
      mode = 'block-comment'
      continue
    }

    if (currentCharacter === '"') {
      sanitized += currentCharacter
      index += 1
      mode = 'string'
      continue
    }

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
      type
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

  const entries = splitTopLevel(content, ',').flatMap((entry) => entry.split('\n'))

  for (const entry of entries) {
    const normalizedEntry = entry.split('=')[0]?.trim() ?? ''

    if (!normalizedEntry) {
      continue
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalizedEntry)) {
      const macroDefinition = macroDefinitionsByName.get(normalizedEntry)

      if (macroDefinition && macroDefinition.parameters === null) {
        for (const macroValue of extractValuesFromMacroInvocationList(macroDefinition.body)) {
          values.add(macroValue)
        }
        continue
      }

      values.add(normalizedEntry)
    }
  }

  return [...values]
}

const INTEGER_LIKE_TYPE_PATTERN =
  /^(?:u?int(?:8|16|32|64)?_t|char|short|int|long|bool|BOOLEAN|BYTE|WORD|DWORD)$/i

const isIntegerLikeType = (type: ProjectCodeTypeReference | null): boolean => {
  if (!type || type.pointerDepth > 0) {
    return false
  }

  return INTEGER_LIKE_TYPE_PATTERN.test(type.name)
}

const computeDeclarationDiagnostics = (content: string): ProjectCodeDiagnostic[] => {
  const diagnostics: ProjectCodeDiagnostic[] = []
  const lines = content.split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line.match(DECLARATION_WITH_INITIALIZER_PATTERN)

    if (!match) {
      continue
    }

    const declaredType = parseTypeReference(`${match[1]} ${match[2]}`.trim())
    const initializer = match[4].trim()
    const lineNumber = index + 1
    const initializerColumn = line.indexOf(initializer) + 1

    if (isIntegerLikeType(declaredType) && initializer.startsWith('"')) {
      diagnostics.push({
        message: `Cannot initialize ${declaredType?.name ?? 'this value'} with a string literal.`,
        severity: 'error',
        startLineNumber: lineNumber,
        startColumn: initializerColumn,
        endLineNumber: lineNumber,
        endColumn: initializerColumn + initializer.length
      })
    }

    if (declaredType && declaredType.pointerDepth === 0 && initializer.startsWith('&')) {
      diagnostics.push({
        message: `Cannot initialize non-pointer ${declaredType.name} with an address expression.`,
        severity: 'error',
        startLineNumber: lineNumber,
        startColumn: initializerColumn,
        endLineNumber: lineNumber,
        endColumn: initializerColumn + initializer.length
      })
    }
  }

  return diagnostics
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

const parseLocalVariables = (sanitizedContent: string, declaredIn?: string): ProjectCodeVariableSymbol[] => {
  return sanitizedContent
    .replace(/[{}]/g, ';')
    .split(';')
    .flatMap((statement) => parseDeclarationStatement(statement, 'local', declaredIn))
}

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

const findStruct = (
  symbolIndex: ProjectCodeSymbolIndex,
  typeName: string
): ProjectCodeStructSymbol | null => {
  return symbolIndex.structs.find((entry) => entry.name === typeName) ?? null
}

const resolveTypeAlias = (
  typeName: string,
  symbolIndex: ProjectCodeSymbolIndex
): ProjectCodeTypeReference | null => {
  const visitedTypes = new Set<string>()
  let nextTypeName = typeName

  while (!visitedTypes.has(nextTypeName)) {
    visitedTypes.add(nextTypeName)

    if (findStruct(symbolIndex, nextTypeName)) {
      return {
        name: nextTypeName,
        pointerDepth: 0
      }
    }

    const alias = symbolIndex.typeAliases.find((entry) => entry.name === nextTypeName)

    if (!alias?.targetType) {
      break
    }

    nextTypeName = alias.targetType.name
  }

  return findStruct(symbolIndex, nextTypeName)
    ? {
        name: nextTypeName,
        pointerDepth: 0
      }
    : null
}

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

export const getStructFieldsForExpression = (
  expression: string,
  symbolIndex: ProjectCodeSymbolIndex
): ProjectCodeStructField[] => {
  const trimmedExpression = expression.trim()

  if (!trimmedExpression) {
    return []
  }

  const segments = trimmedExpression.split(/->|\./).filter(Boolean)

  if (segments.length === 0) {
    return []
  }

  const rootVariable = symbolIndex.variables.find((entry) => entry.name === segments[0])
  let currentType = rootVariable?.type ?? resolveTypeAlias(segments[0], symbolIndex)

  if (!currentType) {
    return []
  }

  for (const fieldName of segments.slice(1)) {
    const resolvedTypeName = resolveTypeAlias(currentType.name, symbolIndex)?.name ?? currentType.name
    const structSymbol = findStruct(symbolIndex, resolvedTypeName)

    if (!structSymbol) {
      return []
    }

    const field = structSymbol.fields.find((entry) => entry.name === fieldName)

    if (!field?.type) {
      return []
    }

    currentType = field.type
  }

  const resolvedTypeName = resolveTypeAlias(currentType.name, symbolIndex)?.name ?? currentType.name
  const structSymbol = findStruct(symbolIndex, resolvedTypeName)
  return structSymbol?.fields ?? []
}

export const getMemberAccessExpression = (textBeforeCursor: string): string | null => {
  const match = textBeforeCursor.match(MEMBER_ACCESS_PATTERN)
  return match?.[1] ?? null
}

export const getActiveFunctionCall = (textBeforeCursor: string): ProjectCodeActiveCall | null => {
  const stack: Array<{ functionName: string; activeParameterIndex: number }> = []
  let mode: 'normal' | 'line-comment' | 'block-comment' | 'string' | 'char' = 'normal'
  let index = 0
  let escapePending = false

  while (index < textBeforeCursor.length) {
    const currentCharacter = textBeforeCursor[index]
    const nextCharacter = textBeforeCursor[index + 1] ?? ''

    if (mode === 'line-comment') {
      if (currentCharacter === '\n') {
        mode = 'normal'
      }

      index += 1
      continue
    }

    if (mode === 'block-comment') {
      if (currentCharacter === '*' && nextCharacter === '/') {
        index += 2
        mode = 'normal'
        continue
      }

      index += 1
      continue
    }

    if (mode === 'string') {
      if (!escapePending && currentCharacter === '\\') {
        escapePending = true
      } else if (!escapePending && currentCharacter === '"') {
        mode = 'normal'
      } else {
        escapePending = false
      }

      index += 1
      continue
    }

    if (mode === 'char') {
      if (!escapePending && currentCharacter === '\\') {
        escapePending = true
      } else if (!escapePending && currentCharacter === "'") {
        mode = 'normal'
      } else {
        escapePending = false
      }

      index += 1
      continue
    }

    if (currentCharacter === '/' && nextCharacter === '/') {
      mode = 'line-comment'
      index += 2
      continue
    }

    if (currentCharacter === '/' && nextCharacter === '*') {
      mode = 'block-comment'
      index += 2
      continue
    }

    if (currentCharacter === '"') {
      mode = 'string'
      escapePending = false
      index += 1
      continue
    }

    if (currentCharacter === "'") {
      mode = 'char'
      escapePending = false
      index += 1
      continue
    }

    if (currentCharacter === '(') {
      const beforeParenthesis = textBeforeCursor.slice(0, index)
      const functionNameMatch = beforeParenthesis.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/)

      if (functionNameMatch) {
        stack.push({
          functionName: functionNameMatch[1],
          activeParameterIndex: 0
        })
      } else {
        stack.push({
          functionName: '',
          activeParameterIndex: 0
        })
      }

      index += 1
      continue
    }

    if (currentCharacter === ',') {
      const activeCall = stack.at(-1)

      if (activeCall) {
        activeCall.activeParameterIndex += 1
      }

      index += 1
      continue
    }

    if (currentCharacter === ')') {
      stack.pop()
      index += 1
      continue
    }

    index += 1
  }

  const activeCall = [...stack].reverse().find((entry) => entry.functionName.length > 0)

  if (!activeCall) {
    return null
  }

  return {
    functionName: activeCall.functionName,
    activeParameterIndex: activeCall.activeParameterIndex
  }
}

export const computeProjectCodeDiagnostics = (content: string): ProjectCodeDiagnostic[] => {
  const diagnostics: ProjectCodeDiagnostic[] = []
  const stack: DelimiterEntry[] = []
  const position = createPosition()
  let index = 0
  let mode: 'normal' | 'line-comment' | 'block-comment' | 'string' | 'char' = 'normal'
  let tokenStart = clonePosition(position)
  let charLiteralLength = 0
  let escapePending = false

  while (index < content.length) {
    const currentCharacter = content[index]
    const nextCharacter = content[index + 1] ?? ''
    const currentPosition = clonePosition(position)

    if (mode === 'line-comment') {
      if (currentCharacter === '\n') {
        mode = 'normal'
      }

      advancePosition(position, currentCharacter)
      index += 1
      continue
    }

    if (mode === 'block-comment') {
      if (currentCharacter === '*' && nextCharacter === '/') {
        advancePosition(position, currentCharacter)
        advancePosition(position, nextCharacter)
        index += 2
        mode = 'normal'
        continue
      }

      advancePosition(position, currentCharacter)
      index += 1
      continue
    }

    if (mode === 'string') {
      if (!escapePending && currentCharacter === '\\') {
        escapePending = true
      } else if (!escapePending && currentCharacter === '"') {
        mode = 'normal'
      } else if (currentCharacter === '\n') {
        diagnostics.push(buildDiagnostic('Unterminated string literal.', tokenStart, currentPosition))
        mode = 'normal'
      } else {
        escapePending = false
      }

      advancePosition(position, currentCharacter)
      index += 1
      continue
    }

    if (mode === 'char') {
      if (!escapePending && currentCharacter === '\\') {
        escapePending = true
      } else if (!escapePending && currentCharacter === "'") {
        if (charLiteralLength > 1) {
          diagnostics.push(
            buildDiagnostic(
              'Character literals should contain a single character.',
              tokenStart,
              clonePosition(position)
            )
          )
        }

        mode = 'normal'
      } else if (currentCharacter === '\n') {
        diagnostics.push(buildDiagnostic('Unterminated character literal.', tokenStart, currentPosition))
        mode = 'normal'
      } else {
        charLiteralLength += 1
        escapePending = false
      }

      advancePosition(position, currentCharacter)
      index += 1
      continue
    }

    if (currentCharacter === '/' && nextCharacter === '/') {
      mode = 'line-comment'
      advancePosition(position, currentCharacter)
      advancePosition(position, nextCharacter)
      index += 2
      continue
    }

    if (currentCharacter === '/' && nextCharacter === '*') {
      mode = 'block-comment'
      tokenStart = currentPosition
      advancePosition(position, currentCharacter)
      advancePosition(position, nextCharacter)
      index += 2
      continue
    }

    if (currentCharacter === '"') {
      mode = 'string'
      tokenStart = currentPosition
      escapePending = false
      advancePosition(position, currentCharacter)
      index += 1
      continue
    }

    if (currentCharacter === "'") {
      mode = 'char'
      tokenStart = currentPosition
      charLiteralLength = 0
      escapePending = false
      advancePosition(position, currentCharacter)
      index += 1
      continue
    }

    if (currentCharacter === '(' || currentCharacter === '{' || currentCharacter === '[') {
      stack.push({
        character: currentCharacter,
        ...currentPosition
      })
    } else if (currentCharacter === ')' || currentCharacter === '}' || currentCharacter === ']') {
      const expectedOpening =
        currentCharacter === ')' ? '(' : currentCharacter === '}' ? '{' : '['
      const lastOpening = stack.at(-1)

      if (!lastOpening || lastOpening.character !== expectedOpening) {
        diagnostics.push(
          buildDiagnostic(
            `Unexpected "${currentCharacter}".`,
            currentPosition,
            {
              line: currentPosition.line,
              column: currentPosition.column + 1
            }
          )
        )
      } else {
        stack.pop()
      }
    }

    advancePosition(position, currentCharacter)
    index += 1
  }

  if (mode === 'block-comment') {
    diagnostics.push(buildDiagnostic('Unterminated block comment.', tokenStart, clonePosition(position)))
  }

  if (mode === 'string') {
    diagnostics.push(buildDiagnostic('Unterminated string literal.', tokenStart, clonePosition(position)))
  }

  if (mode === 'char') {
    diagnostics.push(
      buildDiagnostic('Unterminated character literal.', tokenStart, clonePosition(position))
    )
  }

  for (const delimiter of stack) {
    diagnostics.push(
      buildDiagnostic(
        `Missing closing delimiter for "${delimiter.character}".`,
        delimiter,
        {
          line: delimiter.line,
          column: delimiter.column + 1
        }
      )
    )
  }

  return [...diagnostics, ...computeDeclarationDiagnostics(content)]
}
