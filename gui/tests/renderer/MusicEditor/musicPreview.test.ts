import { describe, expect, it } from 'vitest'
import {
  decodeNoiseInstrument,
  decodePulseInstrument,
  getNoiseClockHz,
  getPulseFrequencyHz,
  MusicPreviewPlayer,
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
    expect(decodePulseInstrument({ sweep: 0x3b, reg1: 0x80, reg2: 0xf2, reg3: 0x00 })).toMatchObject({
      sweepPace: 3,
      sweepDirection: 'decrease',
      sweepShift: 3,
      sweepEnabled: true,
      duty: 2,
      length: 0,
      initialVolume: 15,
      envelopeDirection: 'decrease',
      envelopePace: 2,
      dacEnabled: true
    })
    expect(decodePulseInstrument({ sweep: 0x10, reg1: 0x80, reg2: 0xf2, reg3: 0x00 })).toMatchObject({
      sweepPace: 1,
      sweepShift: 0,
      sweepEnabled: true
    })
    expect(decodePulseInstrument({ sweep: 0x08, reg1: 0x80, reg2: 0xf2, reg3: 0x00 })).toMatchObject({
      sweepDirection: 'decrease',
      sweepEnabled: true
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

  it('applies channel 1 frequency sweep during preview rendering', () => {
    const sweptDocument = {
      ...createMusicDocument(),
      instruments: [{ name: 'Sweep', sweep: 0x13, reg1: 0x80, reg2: 0xf0, reg3: 0x20 }]
    }
    const plainDocument = {
      ...sweptDocument,
      instruments: [{ name: 'Plain', sweep: 0x00, reg1: 0x80, reg2: 0xf0, reg3: 0x20 }]
    }

    const sweptSamples = renderMusicPreviewSamples(sweptDocument, 8000)
    const plainSamples = renderMusicPreviewSamples(plainDocument, 8000)

    expect(sweptSamples.slice(512, 2048)).not.toEqual(plainSamples.slice(512, 2048))
  })

  it('treats instrument 0 as the first instrument instead of keeping the previous one', () => {
    const document: MusicAssetDocument = {
      ...createMusicDocument(),
      speed: 1,
      instruments: [
        { name: 'Silent', reg1: 0x80, reg2: 0x00, reg3: 0x20 },
        { name: 'Loud', reg1: 0x80, reg2: 0xf0, reg3: 0x20 }
      ],
      patterns: [
        {
          id: 'main',
          name: 'Main',
          steps: [
            { noteIndex: 12, instrument: 1 },
            { noteIndex: 12, instrument: 0 },
            ...Array.from({ length: 14 }, () => ({ noteIndex: 0xff, instrument: 0 }))
          ]
        }
      ]
    }

    const sampleRate = 8000
    const samples = renderMusicPreviewSamples(document, sampleRate)
    const stepSamples = Math.round(sampleRate / 60)
    const firstStepEnergy = samples
      .slice(0, stepSamples)
      .reduce((total, sample) => total + Math.abs(sample), 0)
    const secondStepEnergy = samples
      .slice(stepSamples, stepSamples * 2)
      .reduce((total, sample) => total + Math.abs(sample), 0)

    expect(firstStepEnergy).toBeGreaterThan(0)
    expect(secondStepEnergy).toBe(0)
  })

  it('renders rests, missing patterns, silence, noise, and envelope changes without clipping', () => {
    const document: MusicAssetDocument = {
      ...createMusicDocument(),
      speed: 1,
      instruments: [
        { name: 'Silent', reg1: 0x00, reg2: 0x00, reg3: 0xf0 },
        { name: 'Noise', reg1: 0x3f, reg2: 0xf9, reg3: 0x2b }
      ],
      patterns: [
        {
          id: 'noise',
          name: 'Noise',
          steps: [
            { noteIndex: 0xff, instrument: 0 },
            { noteIndex: 12, instrument: 1 },
            ...Array.from({ length: 14 }, () => ({ noteIndex: 0xff, instrument: 0 }))
          ]
        }
      ],
      sequence: {
        ch1: ['missing'],
        ch2: [],
        ch4: ['noise']
      }
    }

    const samples = renderMusicPreviewSamples(document, 8000)
    expect(samples.length).toBeGreaterThan(1)
    expect(samples.every((sample) => sample >= -0.95 && sample <= 0.95)).toBe(true)
  })

  it('loops preview audio at the playable step duration instead of the rendered tail', async () => {
    const originalAudioContext = window.AudioContext
    const originalRequestAnimationFrame = window.requestAnimationFrame
    const originalCancelAnimationFrame = window.cancelAnimationFrame
    const source = {
      buffer: null as AudioBuffer | null,
      loop: false,
      loopStart: -1,
      loopEnd: -1,
      onended: null as (() => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    }
    const context = {
      sampleRate: 60,
      state: 'running',
      currentTime: 0,
      destination: {},
      resume: vi.fn(),
      createBuffer: vi.fn((_channels: number, length: number, sampleRate: number) => ({
        length,
        sampleRate,
        getChannelData: vi.fn(() => new Float32Array(length))
      })),
      createBufferSource: vi.fn(() => source)
    }

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: vi.fn(function AudioContextMock() {
        return context
      })
    })
    window.requestAnimationFrame = vi.fn(() => 1)
    window.cancelAnimationFrame = vi.fn()

    try {
      const document = { ...createMusicDocument(), loop: true, speed: 6 }
      await new MusicPreviewPlayer().play(document)

      expect(source.loop).toBe(true)
      expect(source.loopStart).toBe(0)
      expect(source.loopEnd).toBeCloseTo(1.6)
      expect(source.start).toHaveBeenCalledWith(0, 0)
    } finally {
      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        writable: true,
        value: originalAudioContext
      })
      window.requestAnimationFrame = originalRequestAnimationFrame
      window.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })

  it('resumes suspended contexts, clamps start steps, reports progress, and stops cleanly', async () => {
    const originalAudioContext = window.AudioContext
    const originalRequestAnimationFrame = window.requestAnimationFrame
    const originalCancelAnimationFrame = window.cancelAnimationFrame
    const source = {
      buffer: null as AudioBuffer | null,
      loop: false,
      loopStart: -1,
      loopEnd: -1,
      onended: null as (() => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    }
    const context = {
      sampleRate: 60,
      state: 'suspended',
      currentTime: 0.25,
      destination: {},
      resume: vi.fn(async () => {
        context.state = 'running'
      }),
      createBuffer: vi.fn((_channels: number, length: number, sampleRate: number) => ({
        length,
        sampleRate,
        getChannelData: vi.fn(() => new Float32Array(length))
      })),
      createBufferSource: vi.fn(() => source)
    }

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: undefined
    })
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      writable: true,
      value: vi.fn(function AudioContextMock() {
        return context
      })
    })
    window.requestAnimationFrame = vi.fn(() => 7)
    window.cancelAnimationFrame = vi.fn()

    try {
      const player = new MusicPreviewPlayer()
      const onStep = vi.fn()
      await player.play(createMusicDocument(), 999, onStep)
      expect(context.resume).toHaveBeenCalled()
      expect(source.start).toHaveBeenCalledWith(0, 1.5)
      expect(onStep).toHaveBeenCalledWith(15)
      expect(player.isPlaying).toBe(true)

      source.onended?.()
      expect(player.isPlaying).toBe(false)

      await player.play(createMusicDocument(), -3)
      player.stop()
      player.stop()
      expect(source.stop).toHaveBeenCalled()
      expect(source.disconnect).toHaveBeenCalled()
      expect(window.cancelAnimationFrame).toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        writable: true,
        value: originalAudioContext
      })
      Object.defineProperty(window, 'webkitAudioContext', {
        configurable: true,
        writable: true,
        value: undefined
      })
      window.requestAnimationFrame = originalRequestAnimationFrame
      window.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })
})
