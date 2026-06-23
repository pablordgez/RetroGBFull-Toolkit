import type { ProjectScriptKind } from './projectScripts'

export const PROJECT_CODE_WORKSPACE_ROOT = '/workspace'
export const PROJECT_CODE_WORKSPACE_STUB_ROOT = `${PROJECT_CODE_WORKSPACE_ROOT}/.retrogbfull/stubs`

export interface ProjectCodeWorkspaceFile {
  path: string
  content: string
}

export interface ProjectCodeWorkspaceSnapshot {
  workspaceRoot: string
  files: ProjectCodeWorkspaceFile[]
  sourceFileCount: number
}

export interface CopyEngineCoreResult {
  copiedPaths: string[]
  skippedPaths: string[]
}

export interface ProjectScriptResourcePayload {
  resourcePath: string
  scriptKind: ProjectScriptKind
  displayName: string
  sourcePath: string
  headerPath: string
  sourceContent: string
  editableSourceContent: string
  managedSourcePrefix: string
  headerContent: string
}

export interface ProjectScriptSavePayload {
  resourcePath: string
  scriptKind: ProjectScriptKind
  sourceContent: string
  editableSourceContent: string
  headerContent: string
}

export interface ProjectScriptBankingOptions {
  autoBankScriptFunctions?: boolean
}

export interface ProjectScriptCallbackCandidate {
  scriptPath: string
  scriptKind: ProjectScriptKind
  scriptName: string
  functionName: string
}

export interface ProjectCodeTypeReference {
  name: string
  pointerDepth: number
}

export interface ProjectCodeStructField {
  name: string
  type: ProjectCodeTypeReference | null
  isArray?: boolean
}

export interface ProjectCodeStructSymbol {
  name: string
  declaredIn?: string
  fields: ProjectCodeStructField[]
}

export interface ProjectCodeEnumSymbol {
  name: string
  declaredIn?: string
  values: string[]
}

export interface ProjectCodeFunctionParameter {
  name: string
  type: ProjectCodeTypeReference | null
}

export interface ProjectCodeFunctionSymbol {
  name: string
  declaredIn?: string
  returnType: ProjectCodeTypeReference | null
  parameters: ProjectCodeFunctionParameter[]
}

export interface ProjectCodeVariableSymbol {
  name: string
  declaredIn?: string
  type: ProjectCodeTypeReference | null
  scope: 'workspace' | 'local' | 'parameter'
}

export interface ProjectCodeMacroSymbol {
  name: string
  declaredIn?: string
  value: string
}

export interface ProjectCodeTypeAliasSymbol {
  name: string
  declaredIn?: string
  targetType: ProjectCodeTypeReference | null
}

export interface ProjectCodeSymbolIndex {
  structs: ProjectCodeStructSymbol[]
  enums: ProjectCodeEnumSymbol[]
  functions: ProjectCodeFunctionSymbol[]
  variables: ProjectCodeVariableSymbol[]
  macros: ProjectCodeMacroSymbol[]
  typeAliases: ProjectCodeTypeAliasSymbol[]
  sourceFilesScanned: number
}

export interface ProjectCodeDiagnostic {
  message: string
  severity: 'error' | 'warning'
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

export interface BuildProjectCodeResult {
  writtenFiles: string[]
  saveDataEntryCount: number
  spriteCount: number
  tilesetCount: number
  tilemapCount: number
  windowCount: number
  musicCount: number
  sceneCount: number
  actorScriptCount: number
  sceneScriptCount: number
}

export interface ProjectBuildProgressPayload {
  projectPath: string
  stage: 'build' | 'clean' | 'compile'
  message: string
}

export interface CompileProjectResult {
  romPath: string | null
  outputSummary: string
}

export interface BuildAndCompileProjectResult {
  buildResult: BuildProjectCodeResult
  compileResult: CompileProjectResult
}

export type ParsedScriptPropertyKind = 'integer' | 'boolean' | 'animation' | 'enum'

export interface ParsedScriptPropertyDefinition {
  name: string
  kind: ParsedScriptPropertyKind
  typeName: string
  minimum?: number
  maximum?: number
  isSigned?: boolean
  enumValues?: string[]
}

const trimLeadingSlashes = (value: string): string => value.replace(/^\/+/, '')

export const toProjectCodeWorkspacePath = (resourcePath: string): string => {
  const normalizedResourcePath = trimLeadingSlashes(resourcePath.replace(/\\/g, '/'))
  return `${PROJECT_CODE_WORKSPACE_ROOT}/${normalizedResourcePath}`
}

export const toProjectCodeWorkspaceUri = (resourcePath: string): string => {
  return `file://${toProjectCodeWorkspacePath(resourcePath)}`
}
