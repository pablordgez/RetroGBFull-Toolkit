import { describe, expect, it, vi } from 'vitest'
import type { DragEvent } from 'react'
import {
  asMusicDocument,
  clamp,
  clampByte,
  createDefaultInstrument,
  createEmptySteps,
  createPatternId,
  formatHexByte,
  getInstrumentKind,
  getInstrumentKindForChannel,
  getNoteLabel,
  getPatternById,
  getPatternChannel,
  getPitchFromPointer,
  getSequenceLength,
  isInstrumentValidForChannel,
  isPatternUsingSweep,
  isPatternValidForChannel,
  isPulseInstrumentUsingSweep,
  parseByteInput,
  readDragPayload,
  sanitizeMusicSequenceCompatibility,
  updateNoiseInstrument,
  updatePulseInstrument,
  writeDragPayload
} from '../../../src/renderer/src/components/MusicEditor/musicEditorModel'
import { MUSIC_NOTE_REST, type MusicAssetDocument } from '../../../src/shared/projectAssets'

const createDataTransfer = (initial = new Map<string, string>()): DataTransfer =>
  ({
    effectAllowed: 'all',
    dropEffect: 'move',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: vi.fn(),
    setDragImage: vi.fn(),
    getData: vi.fn((format: string) => initial.get(format) ?? ''),
    setData: vi.fn((format: string, value: string) => {
      initial.set(format, value)
    })
  }) as unknown as DataTransfer

describe('musicEditorModel edge cases', () => {
  it('creates defaults and clamps/parses byte values', () => {
    expect(createEmptySteps()).toHaveLength(16)
    expect(createEmptySteps()[0]).toEqual({ noteIndex: MUSIC_NOTE_REST, instrument: 0 })
    expect(createDefaultInstrument(2)).toMatchObject({ name: 'Pulse 2', channelType: 'pulse', reg1: 0x80 })
    expect(createDefaultInstrument(3, 'noise')).toMatchObject({
      name: 'Noise 3',
      channelType: 'noise',
      reg1: 0x3f,
      reg3: 0x20
    })

    expect(clamp(Number.NaN, 5, 10)).toBe(5)
    expect(clamp(12.9, 0, 10)).toBe(10)
    expect(clampByte(-1)).toBe(0)
    expect(formatHexByte(300)).toBe('0xFF')
    expect(parseByteInput(' 0x0f ')).toBe(15)
    expect(parseByteInput('999')).toBe(255)
    expect(parseByteInput('0x100')).toBeNull()
    expect(parseByteInput('bad')).toBeNull()
  })

  it('reads document, channel, pattern, note, and pitch helpers', () => {
    const document: MusicAssetDocument = {
      ...asMusicDocument(),
      sequence: { ch1: ['a'], ch2: ['a', null, null], ch4: [] },
      patterns: [{ id: 'a', name: 'A', channel: 'ch4', steps: createEmptySteps() }]
    }

    expect(getInstrumentKindForChannel('ch1')).toBe('pulse')
    expect(getInstrumentKindForChannel('ch4')).toBe('noise')
    expect(getInstrumentKind({ reg1: 0, reg2: 0, reg3: 0 })).toBe('pulse')
    expect(getPatternChannel(document.patterns[0])).toBe('ch4')
    expect(getPatternChannel(null)).toBe('ch1')
    expect(isInstrumentValidForChannel({ channelType: 'noise', reg1: 0, reg2: 0, reg3: 0 }, 'ch4')).toBe(true)
    expect(isInstrumentValidForChannel({ channelType: 'pulse', sweep: 0x11, reg1: 0, reg2: 0, reg3: 0 }, 'ch2')).toBe(false)
    expect(isInstrumentValidForChannel({ channelType: 'pulse', sweep: 0x10, reg1: 0, reg2: 0, reg3: 0 }, 'ch2')).toBe(false)
    expect(isInstrumentValidForChannel(undefined, 'ch4')).toBe(false)
    expect(getSequenceLength(document)).toBe(3)
    expect(getPatternById(document, 'a')).toBe(document.patterns[0])
    expect(getPatternById(document, null)).toBeNull()
    expect(createPatternId([{ id: 'pattern-1', name: 'One', steps: [] }, { id: 'pattern-2', name: 'Two', steps: [] }])).toBe('pattern-3')
    expect(getNoteLabel(0)).toBe('C_3')
    expect(getNoteLabel(MUSIC_NOTE_REST)).toBe('Rest')
    expect(getNoteLabel(500)).toBe('Rest')

    const element = documentElementWithBounds({ top: 10, height: 100 })
    expect(getPitchFromPointer(element, 10)).toBe(71)
    expect(getPitchFromPointer(element, 110)).toBe(0)
    expect(getPitchFromPointer(documentElementWithBounds({ top: 0, height: 0 }), 20)).toBe(36)
  })

  it('allows pulse patterns on both channels until they use sweep', () => {
    const document: MusicAssetDocument = {
      ...asMusicDocument(),
      instruments: [
        { channelType: 'pulse', sweep: 0x00, reg1: 0x80, reg2: 0xf2, reg3: 0 },
        { channelType: 'pulse', sweep: 0x12, reg1: 0x80, reg2: 0xf2, reg3: 0 }
      ],
      patterns: [
        {
          id: 'plain',
          name: 'Plain',
          channel: 'ch1',
          steps: [{ noteIndex: 12, instrument: 0 }, ...createEmptySteps().slice(1)]
        },
        {
          id: 'sweep',
          name: 'Sweep',
          channel: 'ch1',
          steps: [{ noteIndex: 12, instrument: 1 }, ...createEmptySteps().slice(1)]
        }
      ],
      sequence: {
        ch1: ['plain', 'sweep'],
        ch2: ['plain', 'sweep'],
        ch4: ['plain']
      }
    }

    expect(isPulseInstrumentUsingSweep(document.instruments[0])).toBe(false)
    expect(isPulseInstrumentUsingSweep(document.instruments[1])).toBe(true)
    expect(isPulseInstrumentUsingSweep({ ...document.instruments[0], sweep: 0x01 })).toBe(true)
    expect(isPatternUsingSweep(document, document.patterns[0])).toBe(false)
    expect(isPatternUsingSweep(document, document.patterns[1])).toBe(true)
    expect(isPatternValidForChannel(document, document.patterns[0], 'ch2')).toBe(true)
    expect(isPatternValidForChannel(document, document.patterns[1], 'ch1')).toBe(true)
    expect(isPatternValidForChannel(document, document.patterns[1], 'ch2')).toBe(false)
    expect(sanitizeMusicSequenceCompatibility(document).sequence).toEqual({
      ch1: ['plain', 'sweep'],
      ch2: ['plain', null],
      ch4: [null]
    })
  })

  it('writes and reads drag payloads safely', () => {
    const data = new Map<string, string>()
    const event = { dataTransfer: createDataTransfer(data) } as DragEvent<HTMLElement>

    writeDragPayload(event, { type: 'clip', patternId: 'a', channel: 'ch1', sequenceIndex: 2 })
    expect(event.dataTransfer.effectAllowed).toBe('move')
    expect(readDragPayload(event)).toEqual({
      type: 'clip',
      patternId: 'a',
      channel: 'ch1',
      sequenceIndex: 2
    })

    expect(readDragPayload({ dataTransfer: createDataTransfer() } as DragEvent<HTMLElement>)).toBeNull()
    expect(
      readDragPayload({
        dataTransfer: createDataTransfer(new Map([['application/x-retrogb-music', '{bad']]))
      } as DragEvent<HTMLElement>)
    ).toBeNull()
  })

  it('updates pulse and noise register fields with patch defaults and clamps', () => {
    const pulse = updatePulseInstrument(
      { name: 'Pulse', reg1: 0x80, reg2: 0xf2, reg3: 0 },
      {
        duty: 9,
        length: 100,
        initialVolume: 20,
        envelopeDirection: 'increase',
        envelopePace: 9,
        sweepPace: 9,
        sweepDirection: 'decrease',
        sweepShift: 9
      }
    )
    expect(pulse).toMatchObject({ channelType: 'pulse', sweep: 0x7f, reg1: 0xff, reg2: 0xff })
    expect(updatePulseInstrument(pulse, {})).toMatchObject({ sweep: 0x7f, reg1: 0xff, reg2: 0xff })

    const noise = updateNoiseInstrument(
      { name: 'Noise', reg1: 0x3f, reg2: 0xf1, reg3: 0x20 },
      {
        length: 100,
        initialVolume: 20,
        envelopeDirection: 'increase',
        envelopePace: 9,
        clockShift: 20,
        widthMode: 7,
        divisorCode: 9
      }
    )
    expect(noise).toMatchObject({ channelType: 'noise', reg1: 0x3f, reg2: 0xff, reg3: 0xff })
    expect(updateNoiseInstrument(noise, { widthMode: 15 })).toMatchObject({ reg3: 0xf7 })
  })
})

const documentElementWithBounds = (bounds: { top: number; height: number }): HTMLElement => {
  const element = document.createElement('div')
  element.getBoundingClientRect = () =>
    ({
      top: bounds.top,
      bottom: bounds.top + bounds.height,
      left: 0,
      right: 100,
      width: 100,
      height: bounds.height,
      x: 0,
      y: bounds.top,
      toJSON: () => ({})
    }) as DOMRect
  return element
}
