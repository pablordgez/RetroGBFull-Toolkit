// replaces non alphanumeric / underscore characters with underscores, trims leading and trailing underscores, and appends 'resource' if the result is empty or starts with a number
export const normalizeCodeIdentifier = (value: string): string => {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!normalized) {
    return 'resource'
  }

  if (/^[0-9]/.test(normalized)) {
    return `resource_${normalized}`
  }

  return normalized
}

export const normalizeCodeIdentifierStem = (value: string): string => {
  return normalizeCodeIdentifier(value).toLowerCase()
}
