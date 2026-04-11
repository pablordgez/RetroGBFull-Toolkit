export const shouldSkipBlankCompletionRequest = (
  visibleEditorText: string,
  isTriggerCharacterRequest: boolean
): boolean => {
  return visibleEditorText.trim().length === 0 && !isTriggerCharacterRequest
}
