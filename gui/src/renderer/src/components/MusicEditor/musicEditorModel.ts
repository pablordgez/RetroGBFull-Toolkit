import type { DragEvent } from 'react'
import {
  MUSIC_NOTE_REST,
  MUSIC_PATTERN_LENGTH,
  createDefaultProjectAssetDocument,
  type MusicAssetDocument,
  type MusicChannelKey,
  type MusicInstrument,
  type MusicInstrumentKind,
  type MusicPattern,
  type MusicStep
} from '../../../../shared/projectAssets'
import { NOTE_NAMES, decodeNoiseInstrument, decodePulseInstrument } from './musicPreview'

export const CHANNELS: MusicChannelKey[] = ['ch1', 'ch2', 'ch4']
export const CHANNEL_LABELS: Record<MusicChannelKey, string> = {
  ch1: 'CH1 Pulse',
  ch2: 'CH2 Pulse',
  ch4: 'CH4 Noise'
}
export const CHANNEL_KIND_LABELS: Record<MusicInstrumentKind, string> = {
  pulse: 'Pulse (CH1/CH2)',
  noise: 'Noise (CH4)'
}
export const DUTY_LABELS = ['12.5%', '25%', '50%', '75%']

const DRAG_MIME = 'application/x-retrogb-music'

export type EditorMode = 'sequence' | 'pattern' | 'instrument'

type MusicDragPayload =
  | { type: 'pattern'; patternId: string }
  | { type: 'clip'; patternId: string; channel: MusicChannelKey; sequenceIndex: number }
  | { type: 'note'; patternId: string; stepIndex: number; noteIndex: number; instrument: number }

export const createEmptySteps = (): MusicStep[] => {
  return Array.from({ length: MUSIC_PATTERN_LENGTH }, () => ({
    noteIndex: MUSIC_NOTE_REST,
    instrument: 0
  }))
}

export const createDefaultInstrument = (
  index: number,
  channelType: MusicInstrumentKind = 'pulse'
): MusicInstrument => ({
  name: `${channelType === 'noise' ? 'Noise' : 'Pulse'} ${index}`,
  channelType,
  reg1: channelType === 'noise' ? 0x3f : 0x80,
  reg2: 0xf2,
  reg3: channelType === 'noise' ? 0x20 : 0x00
})

export const getInstrumentKindForChannel = (channel: MusicChannelKey): MusicInstrumentKind => {
  return channel === 'ch4' ? 'noise' : 'pulse'
}

export const getInstrumentKind = (instrument: MusicInstrument): MusicInstrumentKind => {
  return instrument.channelType ?? 'pulse'
}

export const getPatternChannel = (pattern: MusicPattern | null | undefined): MusicChannelKey => {
  return pattern?.channel ?? 'ch1'
}

export const isInstrumentValidForChannel = (
  instrument: MusicInstrument | null | undefined,
  channel: MusicChannelKey
): boolean => {
  return instrument ? getInstrumentKind(instrument) === getInstrumentKindForChannel(channel) : false
}

export const asMusicDocument = (): MusicAssetDocument => {
  return createDefaultProjectAssetDocument('music') as MusicAssetDocument
}

export const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.max(min, Math.min(max, Math.trunc(value)))
}

export const clampByte = (value: number): number => clamp(value, 0, 255)

export const formatHexByte = (value: number): string => {
  return `0x${clampByte(value).toString(16).toUpperCase().padStart(2, '0')}`
}

export const parseByteInput = (value: string): number | null => {
  const trimmed = value.trim()

  if (/^0x[0-9a-f]{1,2}$/i.test(trimmed)) {
    return clampByte(Number.parseInt(trimmed.slice(2), 16))
  }

  if (/^\d{1,3}$/.test(trimmed)) {
    return clampByte(Number.parseInt(trimmed, 10))
  }

  return null
}

export const getSequenceLength = (document: MusicAssetDocument): number => {
  return Math.max(1, ...CHANNELS.map((channel) => document.sequence[channel].length))
}

export const getPatternById = (
  document: MusicAssetDocument,
  patternId: string | null | undefined
): MusicPattern | null => {
  return patternId ? (document.patterns.find((pattern) => pattern.id === patternId) ?? null) : null
}

export const createPatternId = (patterns: MusicPattern[]): string => {
  let nextIndex = patterns.length
  let nextId = `pattern-${nextIndex}`

  while (patterns.some((pattern) => pattern.id === nextId)) {
    nextIndex += 1
    nextId = `pattern-${nextIndex}`
  }

  return nextId
}

export const getNoteLabel = (noteIndex: number): string => {
  return noteIndex === MUSIC_NOTE_REST ? 'Rest' : (NOTE_NAMES[noteIndex] ?? 'Rest')
}

export const getPitchFromPointer = (element: HTMLElement, clientY: number): number => {
  const rect = element.getBoundingClientRect()
  const ratioFromTop = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5
  return clamp(Math.round((1 - ratioFromTop) * (NOTE_NAMES.length - 1)), 0, NOTE_NAMES.length - 1)
}

export const writeDragPayload = (event: DragEvent<HTMLElement>, payload: MusicDragPayload): void => {
  event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
  event.dataTransfer.effectAllowed = 'move'
}

export const readDragPayload = (event: DragEvent<HTMLElement>): MusicDragPayload | null => {
  try {
    const rawPayload = event.dataTransfer.getData(DRAG_MIME)
    return rawPayload ? (JSON.parse(rawPayload) as MusicDragPayload) : null
  } catch {
    return null
  }
}

export const updatePulseInstrument = (
  instrument: MusicInstrument,
  patch: Partial<{
    duty: number
    length: number
    initialVolume: number
    envelopeDirection: 'decrease' | 'increase'
    envelopePace: number
  }>
): MusicInstrument => {
  const state = decodePulseInstrument(instrument)
  const duty = patch.duty ?? state.duty
  const length = patch.length ?? state.length
  const initialVolume = patch.initialVolume ?? state.initialVolume
  const envelopeDirection = patch.envelopeDirection ?? state.envelopeDirection
  const envelopePace = patch.envelopePace ?? state.envelopePace

  return {
    ...instrument,
    channelType: 'pulse',
    reg1: ((clamp(duty, 0, 3) & 0x03) << 6) | (clamp(length, 0, 63) & 0x3f),
    reg2:
      ((clamp(initialVolume, 0, 15) & 0x0f) << 4) |
      (envelopeDirection === 'increase' ? 0x08 : 0x00) |
      (clamp(envelopePace, 0, 7) & 0x07)
  }
}

export const updateNoiseInstrument = (
  instrument: MusicInstrument,
  patch: Partial<{
    length: number
    initialVolume: number
    envelopeDirection: 'decrease' | 'increase'
    envelopePace: number
    clockShift: number
    widthMode: 15 | 7
    divisorCode: number
  }>
): MusicInstrument => {
  const state = decodeNoiseInstrument(instrument)
  const length = patch.length ?? state.length
  const initialVolume = patch.initialVolume ?? state.initialVolume
  const envelopeDirection = patch.envelopeDirection ?? state.envelopeDirection
  const envelopePace = patch.envelopePace ?? state.envelopePace
  const clockShift = patch.clockShift ?? state.clockShift
  const widthMode = patch.widthMode ?? state.widthMode
  const divisorCode = patch.divisorCode ?? state.divisorCode

  return {
    ...instrument,
    channelType: 'noise',
    reg1: clamp(length, 0, 63) & 0x3f,
    reg2:
      ((clamp(initialVolume, 0, 15) & 0x0f) << 4) |
      (envelopeDirection === 'increase' ? 0x08 : 0x00) |
      (clamp(envelopePace, 0, 7) & 0x07),
    reg3:
      ((clamp(clockShift, 0, 15) & 0x0f) << 4) |
      (widthMode === 7 ? 0x08 : 0x00) |
      (clamp(divisorCode, 0, 7) & 0x07)
  }
}
