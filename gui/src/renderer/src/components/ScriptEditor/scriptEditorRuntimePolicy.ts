import type { ProjectScriptKind } from '../../../../shared/projectScripts'

const shouldDeferRuntimeForBlankScript = (
  scriptKind: ProjectScriptKind,
  editableSourceContent: string
): boolean => {
  return scriptKind === 'general' && editableSourceContent.trim().length === 0
}

const shouldEnableRuntimeForScript = (scriptKind: ProjectScriptKind): boolean => {
  return scriptKind === 'actor' || scriptKind === 'scene' || scriptKind === 'general'
}

export const shouldDeferInitialRuntimeForScript = (
  scriptKind: ProjectScriptKind,
  editableSourceContent: string
): boolean => {
  return shouldEnableRuntimeForScript(scriptKind)
    ? shouldDeferRuntimeForBlankScript(scriptKind, editableSourceContent)
    : true
}

export const shouldDeferRuntimeUntilEdit = (
  scriptKind: ProjectScriptKind,
  editableSourceContent: string,
  hasUserEditedSinceLoad: boolean
): boolean => {
  return (
    !shouldEnableRuntimeForScript(scriptKind) ||
    (shouldDeferRuntimeForBlankScript(scriptKind, editableSourceContent) && !hasUserEditedSinceLoad)
  )
}
