import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GB_PALETTE,
  areProjectPalettesEqual,
  buildDmgPaletteRegisterValue,
  formatHexByte,
  normalizeProjectPalette,
  normalizeSceneSpritePalettes,
  normalizeSpritePaletteIndex
} from '../../src/shared/projectPalettes'

describe('projectPalettes', () => {
  it('normalizes project and scene palettes', () => {
    expect(normalizeProjectPalette([' #ABCDEF ', 'bad', '#123456'])).toEqual([
      '#abcdef',
      '#000000',
      '#123456',
      DEFAULT_GB_PALETTE[3]
    ])
    expect(normalizeSceneSpritePalettes(null)).toEqual([null, null])
    expect(normalizeSceneSpritePalettes([['#FFFFFF'], ['#000000', '#111111']])).toEqual([
      ['#ffffff', DEFAULT_GB_PALETTE[1], DEFAULT_GB_PALETTE[2], DEFAULT_GB_PALETTE[3]],
      ['#000000', '#111111', DEFAULT_GB_PALETTE[2], DEFAULT_GB_PALETTE[3]]
    ])
    expect(normalizeSceneSpritePalettes([null, ['nope']])).toEqual([
      null,
      ['#000000', DEFAULT_GB_PALETTE[1], DEFAULT_GB_PALETTE[2], DEFAULT_GB_PALETTE[3]]
    ])
  })

  it('normalizes palette indices and compares normalized palettes', () => {
    expect(normalizeSpritePaletteIndex(1)).toBe(1)
    expect(normalizeSpritePaletteIndex('1')).toBe(0)
    expect(areProjectPalettesEqual(null, ['#000000'])).toBe(false)
    expect(areProjectPalettesEqual([' #FFFFFF '], ['#ffffff'])).toBe(true)
    expect(areProjectPalettesEqual(['#ffffff', '#111111'], ['#ffffff', '#222222'])).toBe(false)
  })

  it('builds DMG palette register values by luminance and formats bytes', () => {
    expect(buildDmgPaletteRegisterValue(['#ffffff', '#aaaaaa', '#555555', '#000000'])).toBe(0xe4)
    expect(buildDmgPaletteRegisterValue(['#000000', '#555555', '#aaaaaa', '#ffffff'])).toBe(0x1b)
    expect(buildDmgPaletteRegisterValue(['#111111', '#111111', '#222222', '#000000'])).toBe(0xc9)
    expect(formatHexByte(10)).toBe('0x0A')
    expect(formatHexByte(255)).toBe('0xFF')
  })
})
