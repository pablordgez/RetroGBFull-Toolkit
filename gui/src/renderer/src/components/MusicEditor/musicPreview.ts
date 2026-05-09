import {
  MUSIC_NOTE_REST,
  type MusicAssetDocument,
  type MusicChannelKey,
  type MusicInstrument,
  type MusicPattern,
  type MusicStep
} from '../../../../shared/projectAssets'

export const NOTE_NAMES = [
  'C_3',
  'CS3',
  'D_3',
  'DS3',
  'E_3',
  'F_3',
  'FS3',
  'G_3',
  'GS3',
  'A_3',
  'AS3',
  'B_3',
  'C_4',
  'CS4',
  'D_4',
  'DS4',
  'E_4',
  'F_4',
  'FS4',
  'G_4',
  'GS4',
  'A_4',
  'AS4',
  'B_4',
  'C_5',
  'CS5',
  'D_5',
  'DS5',
  'E_5',
  'F_5',
  'FS5',
  'G_5',
  'GS5',
  'A_5',
  'AS5',
  'B_5',
  'C_6',
  'CS6',
  'D_6',
  'DS6',
  'E_6',
  'F_6',
  'FS6',
  'G_6',
  'GS6',
  'A_6',
  'AS6',
  'B_6',
  'C_7',
  'CS7',
  'D_7',
  'DS7',
  'E_7',
  'F_7',
  'FS7',
  'G_7',
  'GS7',
  'A_7',
  'AS7',
  'B_7',
  'C_8',
  'CS8',
  'D_8',
  'DS8',
  'E_8',
  'F_8',
  'FS8',
  'G_8',
  'GS8',
  'A_8',
  'AS8',
  'B_8'
] as const

export const NOTE_FREQUENCY_REGISTERS = [
  0x002c, 0x009c, 0x0106, 0x016b, 0x01c9, 0x0223, 0x0277, 0x02c6, 0x0312,
  0x0358, 0x039b, 0x03da, 0x0416, 0x044e, 0x0483, 0x04b5, 0x04e4, 0x0511,
  0x053b, 0x0563, 0x0589, 0x05ac, 0x05ce, 0x05ed, 0x060b, 0x0627, 0x0641,
  0x065a, 0x0672, 0x0688, 0x069d, 0x06b1, 0x06c4, 0x06d6, 0x06e7, 0x06f6,
  0x0705, 0x0713, 0x0720, 0x072d, 0x0739, 0x0744, 0x074e, 0x0758, 0x0762,
  0x076b, 0x0773, 0x077b, 0x0782, 0x0789, 0x0790, 0x0796, 0x079c, 0x07a2,
  0x07a7, 0x07ac, 0x07b1, 0x07b5, 0x07b9, 0x07bd, 0x07c1, 0x07c4, 0x07c8,
  0x07cb, 0x07ce, 0x07d1, 0x07d3, 0x07d6, 0x07d8, 0x07da, 0x07dc, 0x07de
] as const

export interface PulseInstrumentState {
  duty: number
  length: number
  initialVolume: number
  envelopeDirection: 'decrease' | 'increase'
  envelopePace: number
  dacEnabled: boolean
}

export interface NoiseInstrumentState {
  length: number
  initialVolume: number
  envelopeDirection: 'decrease' | 'increase'
  envelopePace: number
  clockShift: number
  widthMode: 15 | 7
  divisorCode: number
  dacEnabled: boolean
}

interface VoiceState {
  instrumentIndex: number
  instrument: MusicInstrument
  active: boolean
  volume: number
  envelopeTimer: number
  phase: number
  frequency: number
  lfsr: number
  noiseTimer: number
  output: number
}

export const getPulseFrequencyHz = (periodValue: number): number => {
  return 131072 / Math.max(1, 2048 - periodValue)
}

export const getNoiseClockHz = (reg3: number): number => {
  const shift = (reg3 >> 4) & 0x0f
  const divisorCode = reg3 & 0x07
  const divisor = divisorCode === 0 ? 0.5 : divisorCode

  if (shift >= 14) {
    return 0
  }

  return 262144 / divisor / 2 ** shift
}

export const decodePulseInstrument = (instrument: MusicInstrument): PulseInstrumentState => {
  return {
    duty: (instrument.reg1 >> 6) & 0x03,
    length: instrument.reg1 & 0x3f,
    initialVolume: (instrument.reg2 >> 4) & 0x0f,
    envelopeDirection: (instrument.reg2 & 0x08) !== 0 ? 'increase' : 'decrease',
    envelopePace: instrument.reg2 & 0x07,
    dacEnabled: (instrument.reg2 & 0xf8) !== 0
  }
}

export const decodeNoiseInstrument = (instrument: MusicInstrument): NoiseInstrumentState => {
  return {
    length: instrument.reg1 & 0x3f,
    initialVolume: (instrument.reg2 >> 4) & 0x0f,
    envelopeDirection: (instrument.reg2 & 0x08) !== 0 ? 'increase' : 'decrease',
    envelopePace: instrument.reg2 & 0x07,
    clockShift: (instrument.reg3 >> 4) & 0x0f,
    widthMode: (instrument.reg3 & 0x08) !== 0 ? 7 : 15,
    divisorCode: instrument.reg3 & 0x07,
    dacEnabled: (instrument.reg2 & 0xf8) !== 0
  }
}

const DUTY_PATTERNS = [
  [0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 0]
]

const CHANNELS: MusicChannelKey[] = ['ch1', 'ch2', 'ch4']
const SILENT_INSTRUMENT: MusicInstrument = {
  reg1: 0,
  reg2: 0,
  reg3: 0
}

const createVoiceState = (instrument: MusicInstrument): VoiceState => {
  return {
    instrumentIndex: 0,
    instrument,
    active: false,
    volume: 0,
    envelopeTimer: 0,
    phase: 0,
    frequency: 0,
    lfsr: 0x7fff,
    noiseTimer: 0,
    output: 0
  }
}

const applyEnvelopeTick = (voice: VoiceState, isNoise: boolean): void => {
  const instrumentState = isNoise
    ? decodeNoiseInstrument(voice.instrument)
    : decodePulseInstrument(voice.instrument)

  if (!voice.active || instrumentState.envelopePace === 0) {
    return
  }

  voice.envelopeTimer += 1

  if (voice.envelopeTimer < instrumentState.envelopePace) {
    return
  }

  voice.envelopeTimer = 0

  if (instrumentState.envelopeDirection === 'increase') {
    voice.volume = Math.min(15, voice.volume + 1)
    return
  }

  voice.volume = Math.max(0, voice.volume - 1)
}

const triggerPulse = (voice: VoiceState, instrument: MusicInstrument, step: MusicStep): void => {
  const state = decodePulseInstrument(instrument)
  voice.instrument = instrument
  voice.volume = state.initialVolume
  voice.envelopeTimer = 0
  voice.frequency = getPulseFrequencyHz(NOTE_FREQUENCY_REGISTERS[step.noteIndex] ?? 0)
  voice.active = state.dacEnabled
}

const triggerNoise = (voice: VoiceState, instrument: MusicInstrument): void => {
  const state = decodeNoiseInstrument(instrument)
  voice.instrument = instrument
  voice.volume = state.initialVolume
  voice.envelopeTimer = 0
  voice.frequency = getNoiseClockHz(instrument.reg3)
  voice.active = state.dacEnabled && voice.frequency > 0
  voice.lfsr = 0x7fff
  voice.noiseTimer = 0
  voice.output = 0
}

const stepNoiseLfsr = (voice: VoiceState, instrument: MusicInstrument): void => {
  const widthMode = (instrument.reg3 & 0x08) !== 0
  const xorBit = (voice.lfsr & 0x01) ^ ((voice.lfsr >> 1) & 0x01)
  voice.output = (voice.lfsr & 0x01) === 0 ? 1 : 0
  voice.lfsr = (voice.lfsr >> 1) | (xorBit << 14)

  if (widthMode) {
    voice.lfsr = (voice.lfsr & ~(1 << 6)) | (xorBit << 6)
  }
}

const renderPulseSample = (voice: VoiceState, sampleRate: number): number => {
  if (!voice.active || voice.frequency <= 0 || voice.volume <= 0) {
    return 0
  }

  const duty = decodePulseInstrument(voice.instrument).duty
  const pattern = DUTY_PATTERNS[duty] ?? DUTY_PATTERNS[2]
  const sampleIndex = Math.floor(voice.phase * 8) & 7
  const value = pattern[sampleIndex] ? 1 : -1
  voice.phase = (voice.phase + voice.frequency / sampleRate) % 1
  return value * (voice.volume / 15)
}

const renderNoiseSample = (voice: VoiceState, sampleRate: number): number => {
  if (!voice.active || voice.frequency <= 0 || voice.volume <= 0) {
    return 0
  }

  voice.noiseTimer += voice.frequency / sampleRate

  while (voice.noiseTimer >= 1) {
    stepNoiseLfsr(voice, voice.instrument)
    voice.noiseTimer -= 1
  }

  return (voice.output ? 1 : -1) * (voice.volume / 15)
}

export const renderMusicPreviewSamples = (
  document: MusicAssetDocument,
  sampleRate: number
): Float32Array => {
  const sequenceLength = Math.max(...CHANNELS.map((channel) => document.sequence[channel].length))
  const stepDurationSeconds = Math.max(1, document.speed) / 60
  const totalSteps = Math.max(1, sequenceLength * 16)
  const tailSeconds = 0.15
  const totalSamples = Math.max(1, Math.ceil((totalSteps * stepDurationSeconds + tailSeconds) * sampleRate))
  const samples = new Float32Array(totalSamples)
  const patternsById = new Map(document.patterns.map((pattern) => [pattern.id, pattern]))
  const voices: Record<MusicChannelKey, VoiceState> = {
    ch1: createVoiceState(document.instruments[0] ?? SILENT_INSTRUMENT),
    ch2: createVoiceState(document.instruments[0] ?? SILENT_INSTRUMENT),
    ch4: createVoiceState(document.instruments[0] ?? SILENT_INSTRUMENT)
  }
  let nextStepSample = 0
  let songStep = -1
  let nextEnvelopeSample = Math.max(1, Math.round(sampleRate / 64))
  let envelopeSample = nextEnvelopeSample

  for (let sampleIndex = 0; sampleIndex < totalSamples; sampleIndex += 1) {
    if (sampleIndex >= nextStepSample && songStep + 1 < totalSteps) {
      songStep += 1
      nextStepSample = Math.round((songStep + 1) * stepDurationSeconds * sampleRate)
      const patternIndex = Math.floor(songStep / 16)
      const stepIndex = songStep % 16

      for (const channel of CHANNELS) {
        const patternId = document.sequence[channel][patternIndex]
        const pattern: MusicPattern | undefined = patternId ? patternsById.get(patternId) : undefined
        const step = pattern?.steps[stepIndex]

        if (!step) {
          continue
        }

        if (step.instrument !== 0) {
          voices[channel].instrumentIndex = step.instrument
        }

        const instrument =
          document.instruments[voices[channel].instrumentIndex] ??
          document.instruments[0] ??
          SILENT_INSTRUMENT

        if (step.noteIndex === MUSIC_NOTE_REST) {
          continue
        }

        if (channel === 'ch4') {
          triggerNoise(voices[channel], instrument)
        } else {
          triggerPulse(voices[channel], instrument, step)
        }
      }
    }

    if (sampleIndex >= envelopeSample) {
      envelopeSample += nextEnvelopeSample
      applyEnvelopeTick(voices.ch1, false)
      applyEnvelopeTick(voices.ch2, false)
      applyEnvelopeTick(voices.ch4, true)
    }

    const mixed =
      renderPulseSample(voices.ch1, sampleRate) * 0.28 +
      renderPulseSample(voices.ch2, sampleRate) * 0.28 +
      renderNoiseSample(voices.ch4, sampleRate) * 0.22
    samples[sampleIndex] = Math.max(-0.95, Math.min(0.95, mixed))
  }

  return samples
}

export class MusicPreviewPlayer {
  private context: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private animationFrame: number | null = null

  get isPlaying(): boolean {
    return this.source !== null
  }

  async play(
    document: MusicAssetDocument,
    startStep = 0,
    onStep?: (stepIndex: number) => void
  ): Promise<void> {
    this.stop()

    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.context ??= new AudioContextConstructor()

    if (this.context.state === 'suspended') {
      await this.context.resume()
    }

    const samples = renderMusicPreviewSamples(document, this.context.sampleRate)
    const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate)
    buffer.getChannelData(0).set(samples)
    const sequenceLength = Math.max(...CHANNELS.map((channel) => document.sequence[channel].length))
    const totalSteps = Math.max(1, sequenceLength * 16)
    const stepDurationSeconds = Math.max(1, document.speed) / 60
    const playableDurationSeconds = totalSteps * stepDurationSeconds
    const offsetStep = Math.max(0, Math.min(totalSteps - 1, Math.trunc(startStep)))
    const offsetSeconds = offsetStep * stepDurationSeconds

    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.loop = document.loop
    source.connect(this.context.destination)
    source.onended = () => {
      if (this.source === source) {
        this.source = null
      }
      if (this.animationFrame !== null) {
        window.cancelAnimationFrame(this.animationFrame)
        this.animationFrame = null
      }
    }
    const startedAt = this.context.currentTime
    const updateStep = (): void => {
      if (!this.context || this.source !== source) {
        return
      }

      const elapsedSeconds = this.context.currentTime - startedAt + offsetSeconds
      const playSeconds = document.loop
        ? elapsedSeconds % playableDurationSeconds
        : Math.min(elapsedSeconds, playableDurationSeconds - 0.0001)
      onStep?.(Math.max(0, Math.min(totalSteps - 1, Math.floor(playSeconds / stepDurationSeconds))))
      this.animationFrame = window.requestAnimationFrame(updateStep)
    }

    source.start(0, offsetSeconds)
    this.source = source
    updateStep()
  }

  stop(): void {
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }

    if (!this.source) {
      return
    }

    const source = this.source
    this.source = null
    source.onended = null
    source.stop()
    source.disconnect()
  }
}
