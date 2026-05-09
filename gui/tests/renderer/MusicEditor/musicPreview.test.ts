import { describe, expect, it } from 'vitest'
import {
  decodeNoiseInstrument,
  decodePulseInstrument,
  getNoiseClockHz,
  getPulseFrequencyHz,
  renderMusicPreviewSamples
} from '../../../src/renderer/src/components/MusicEditor/musicPreview'
import type { MusicAssetDocument } from '../../../src/shared/projectAssets'

const createMusicDocument = (): MusicAssetDocument => ({
  kind: 'music',
  version: 1,
  speed: 6,
  loop: false,
  instruments: [
    { name: 'Default', reg1: 0x80, reg2: 0xf2, reg3: 0x20 },
    { name: 'Noise', reg1: 0x3f, reg2: 0xf1, reg3: 0x23 }
  ],
  patterns: [
    {
      id: 'main',
      name: 'Main',
      steps: [
        { noteIndex: 12, instrument: 0 },
        ...Array.from({ length: 15 }, () => ({ noteIndex: 0xff, instrument: 0 }))
      ]
    }
  ],
  sequence: {
    ch1: ['main'],
    ch2: [null],
    ch4: [null]
  }
})

describe('music preview audio helpers', () => {
  it('decodes pulse and noise instrument register fields', () => {
    expect(decodePulseInstrument({ reg1: 0x80, reg2: 0xf2, reg3: 0x00 })).toMatchObject({
      duty: 2,
      length: 0,
      initialVolume: 15,
      envelopeDirection: 'decrease',
      envelopePace: 2,
      dacEnabled: true
    })
    expect(decodeNoiseInstrument({ reg1: 0x3f, reg2: 0xf9, reg3: 0x2b })).toMatchObject({
      length: 63,
      initialVolume: 15,
      envelopeDirection: 'increase',
      envelopePace: 1,
      clockShift: 2,
      widthMode: 7,
      divisorCode: 3
    })
  })

  it('uses Game Boy period formulas for pulse and noise clocks', () => {
    expect(getPulseFrequencyHz(0x60b)).toBeCloseTo(261.63, 1)
    expect(getNoiseClockHz(0x20)).toBeCloseTo(131072, 0)
    expect(getNoiseClockHz(0xe0)).toBe(0)
  })

  it('renders deterministic non-silent samples for a playable document', () => {
    const firstRender = renderMusicPreviewSamples(createMusicDocument(), 44_100)
    const secondRender = renderMusicPreviewSamples(createMusicDocument(), 44_100)

    expect(firstRender.length).toBe(secondRender.length)
    expect(firstRender.some((sample) => sample !== 0)).toBe(true)
    expect(firstRender.slice(0, 512)).toEqual(secondRender.slice(0, 512))
  })
})
