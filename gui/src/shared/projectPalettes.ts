export const DEFAULT_GB_PALETTE = ['#9bbc0f', '#8bac0f', '#306230', '#0f380f']
export type SceneSpritePaletteIndex = 0 | 1
export type SceneSpritePalettes = [string[] | null, string[] | null]

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

const normalizeHexColor = (color: string): string => {
  const trimmedColor = color.trim()
  return HEX_COLOR_PATTERN.test(trimmedColor) ? trimmedColor.toLowerCase() : '#000000'
}

export const normalizeProjectPalette = (palette: string[]): string[] => {
  return Array.from({ length: 4 }, (_, index) =>
    normalizeHexColor(palette[index] ?? DEFAULT_GB_PALETTE[index])
  )
}

export const normalizeSceneSpritePalettes = (palettes: unknown): SceneSpritePalettes => {
  if (!Array.isArray(palettes)) {
    return [null, null]
  }

  return [
    Array.isArray(palettes[0]) ? normalizeProjectPalette(palettes[0]) : null,
    Array.isArray(palettes[1]) ? normalizeProjectPalette(palettes[1]) : null
  ]
}

export const normalizeSpritePaletteIndex = (value: unknown): SceneSpritePaletteIndex => {
  return value === 1 ? 1 : 0
}

export const areProjectPalettesEqual = (
  leftPalette: string[] | null | undefined,
  rightPalette: string[] | null | undefined
): boolean => {
  if (!leftPalette || !rightPalette) {
    return false
  }

  const left = normalizeProjectPalette(leftPalette)
  const right = normalizeProjectPalette(rightPalette)

  return left.every((color, index) => color === right[index])
}

const getColorLuminance = (hexColor: string): number => {
  const color = normalizeHexColor(hexColor)
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)

  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

export const buildDmgPaletteRegisterValue = (palette: string[]): number => {
  const normalizedPalette = normalizeProjectPalette(palette)
  const shadesByColorIndex = new Array<number>(4).fill(0)

  normalizedPalette
    .map((color, index) => ({
      index,
      luminance: getColorLuminance(color)
    }))
    .sort((left, right) => right.luminance - left.luminance || left.index - right.index)
    .forEach((entry, shade) => {
      shadesByColorIndex[entry.index] = shade
    })

  return shadesByColorIndex.reduce(
    (registerValue, shade, colorIndex) => registerValue | ((shade & 0x03) << (colorIndex * 2)),
    0
  )
}

export const formatHexByte = (value: number): string => {
  return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`
}
