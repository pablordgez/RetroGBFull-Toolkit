export const isEditableElementTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || Boolean(target.isContentEditable)
}

export const isMacLikePlatform = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false
  }

  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
}

export const getCommandShortcutLabelPrefix = (): string => {
  return isMacLikePlatform() ? '\u2318' : 'Ctrl+'
}
