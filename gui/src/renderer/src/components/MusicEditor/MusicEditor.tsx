import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactElement } from 'react'
import {
  MUSIC_NOTE_REST,
  MUSIC_PATTERN_LENGTH,
  createDefaultProjectAssetDocument,
  getProjectAssetDisplayName,
  type MusicAssetDocument,
  type MusicChannelKey,
  type MusicInstrument,
  type MusicInstrumentKind,
  type MusicPattern,
  type MusicStep
} from '../../../../shared/projectAssets'
import { useProjectAssetEditor } from '../hooks/useProjectAssetEditor'
import { EditorClosePrompt } from '../ProjectAssets/EditorClosePrompt'
import {
  MusicPreviewPlayer,
  NOTE_NAMES,
  decodeNoiseInstrument,
  decodePulseInstrument
} from './musicPreview'
import './MusicEditor.css'

const CHANNELS: MusicChannelKey[] = ['ch1', 'ch2', 'ch4']
const CHANNEL_LABELS: Record<MusicChannelKey, string> = {
  ch1: 'CH1 Pulse',
  ch2: 'CH2 Pulse',
  ch4: 'CH4 Noise'
}
const CHANNEL_KIND_LABELS: Record<MusicInstrumentKind, string> = {
  pulse: 'Pulse (CH1/CH2)',
  noise: 'Noise (CH4)'
}
const DUTY_LABELS = ['12.5%', '25%', '50%', '75%']
const DRAG_MIME = 'application/x-retrogb-music'

type EditorMode = 'sequence' | 'pattern' | 'instrument'

type MusicDragPayload =
  | { type: 'pattern'; patternId: string }
  | { type: 'clip'; patternId: string; channel: MusicChannelKey; sequenceIndex: number }
  | { type: 'note'; patternId: string; stepIndex: number; noteIndex: number; instrument: number }

const createEmptySteps = (): MusicStep[] => {
  return Array.from({ length: MUSIC_PATTERN_LENGTH }, () => ({
    noteIndex: MUSIC_NOTE_REST,
    instrument: 0
  }))
}

const createDefaultInstrument = (
  index: number,
  channelType: MusicInstrumentKind = 'pulse'
): MusicInstrument => ({
  name: `${channelType === 'noise' ? 'Noise' : 'Pulse'} ${index}`,
  channelType,
  reg1: channelType === 'noise' ? 0x3f : 0x80,
  reg2: 0xf2,
  reg3: channelType === 'noise' ? 0x20 : 0x00
})

const getInstrumentKindForChannel = (channel: MusicChannelKey): MusicInstrumentKind => {
  return channel === 'ch4' ? 'noise' : 'pulse'
}

const getInstrumentKind = (instrument: MusicInstrument): MusicInstrumentKind => {
  return instrument.channelType ?? 'pulse'
}

const getPatternChannel = (pattern: MusicPattern | null | undefined): MusicChannelKey => {
  return pattern?.channel ?? 'ch1'
}

const isInstrumentValidForChannel = (
  instrument: MusicInstrument | null | undefined,
  channel: MusicChannelKey
): boolean => {
  return instrument ? getInstrumentKind(instrument) === getInstrumentKindForChannel(channel) : false
}

const asMusicDocument = (): MusicAssetDocument => {
  return createDefaultProjectAssetDocument('music') as MusicAssetDocument
}

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.max(min, Math.min(max, Math.trunc(value)))
}

const clampByte = (value: number): number => clamp(value, 0, 255)

const formatHexByte = (value: number): string => {
  return `0x${clampByte(value).toString(16).toUpperCase().padStart(2, '0')}`
}

const parseByteInput = (value: string): number | null => {
  const trimmed = value.trim()

  if (/^0x[0-9a-f]{1,2}$/i.test(trimmed)) {
    return clampByte(Number.parseInt(trimmed.slice(2), 16))
  }

  if (/^\d{1,3}$/.test(trimmed)) {
    return clampByte(Number.parseInt(trimmed, 10))
  }

  return null
}

const getSequenceLength = (document: MusicAssetDocument): number => {
  return Math.max(1, ...CHANNELS.map((channel) => document.sequence[channel].length))
}

const getPatternById = (
  document: MusicAssetDocument,
  patternId: string | null | undefined
): MusicPattern | null => {
  return patternId ? (document.patterns.find((pattern) => pattern.id === patternId) ?? null) : null
}

const createPatternId = (patterns: MusicPattern[]): string => {
  let nextIndex = patterns.length
  let nextId = `pattern-${nextIndex}`

  while (patterns.some((pattern) => pattern.id === nextId)) {
    nextIndex += 1
    nextId = `pattern-${nextIndex}`
  }

  return nextId
}

const getNoteLabel = (noteIndex: number): string => {
  return noteIndex === MUSIC_NOTE_REST ? 'Rest' : (NOTE_NAMES[noteIndex] ?? 'Rest')
}

const getPitchFromPointer = (element: HTMLElement, clientY: number): number => {
  const rect = element.getBoundingClientRect()
  const ratioFromTop = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5
  return clamp(Math.round((1 - ratioFromTop) * (NOTE_NAMES.length - 1)), 0, NOTE_NAMES.length - 1)
}

const writeDragPayload = (event: DragEvent<HTMLElement>, payload: MusicDragPayload): void => {
  event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
  event.dataTransfer.effectAllowed = 'move'
}

const readDragPayload = (event: DragEvent<HTMLElement>): MusicDragPayload | null => {
  try {
    const rawPayload = event.dataTransfer.getData(DRAG_MIME)
    return rawPayload ? (JSON.parse(rawPayload) as MusicDragPayload) : null
  } catch {
    return null
  }
}

const updatePulseInstrument = (
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

const updateNoiseInstrument = (
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

export const MusicEditor = (): ReactElement => {
  const [document, setDocument] = useState<MusicAssetDocument>(() => asMusicDocument())
  const [mode, setMode] = useState<EditorMode>('sequence')
  const [selectedSequenceIndex, setSelectedSequenceIndex] = useState(0)
  const [selectedStepIndex, setSelectedStepIndex] = useState(0)
  const [selectedInstrumentIndex, setSelectedInstrumentIndex] = useState<number | null>(null)
  const [focusedPatternId, setFocusedPatternId] = useState<string | null>(null)
  const [activeChannel, setActiveChannel] = useState<MusicChannelKey>('ch1')
  const [playheadStep, setPlayheadStep] = useState(0)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [draftInstrument, setDraftInstrument] = useState<MusicInstrument | null>(null)
  const [draftInstrumentIndex, setDraftInstrumentIndex] = useState<number | null>(null)
  const previewRef = useRef<MusicPreviewPlayer | null>(null)
  const undoStackRef = useRef<MusicAssetDocument[]>([])
  const redoStackRef = useRef<MusicAssetDocument[]>([])

  const applyDocument = useCallback((nextDocument: MusicAssetDocument) => {
    undoStackRef.current = []
    redoStackRef.current = []
    setDocument(nextDocument)
    setFocusedPatternId(nextDocument.patterns[0]?.id ?? null)
    setSelectedInstrumentIndex(nextDocument.instruments.length > 0 ? 0 : null)
    setMode('sequence')
    setSelectedSequenceIndex(0)
    setSelectedStepIndex(0)
    setPlayheadStep(0)
    setDraftInstrument(null)
    setDraftInstrumentIndex(null)
  }, [])

  const {
    assetPath,
    handleCloseDecision,
    isClosePromptOpen,
    isDirty,
    isLoaded,
    isSaving,
    saveAsset,
    statusMessage
  } = useProjectAssetEditor({
    expectedKind: 'music',
    document,
    applyDocument
  })

  const effectiveDocument = useMemo(() => {
    if (mode !== 'instrument' || draftInstrument === null || draftInstrumentIndex === null) {
      return document
    }

    if (draftInstrumentIndex >= document.instruments.length) {
      return document
    }

    return {
      ...document,
      instruments: document.instruments.map((instrument, index) =>
        index === draftInstrumentIndex ? draftInstrument : instrument
      )
    }
  }, [document, draftInstrument, draftInstrumentIndex, mode])

  const sequenceLength = getSequenceLength(document)
  const totalSteps = sequenceLength * MUSIC_PATTERN_LENGTH
  const focusedPattern = getPatternById(document, focusedPatternId) ?? null
  const selectedArrangementPattern = getPatternById(
    document,
    document.sequence[activeChannel][selectedSequenceIndex]
  )
  const editedPattern = focusedPattern ?? selectedArrangementPattern
  const editedPatternChannel = getPatternChannel(editedPattern)
  const selectedInstrument =
    selectedInstrumentIndex !== null ? document.instruments[selectedInstrumentIndex] : null
  const editedInstrument = draftInstrument ?? selectedInstrument
  const editedInstrumentKind = editedInstrument ? getInstrumentKind(editedInstrument) : 'pulse'
  const pulseState = editedInstrument ? decodePulseInstrument(editedInstrument) : null
  const noiseState = editedInstrument ? decodeNoiseInstrument(editedInstrument) : null

  useEffect(() => {
    return () => {
      previewRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    if (mode !== 'pattern') {
      return
    }

    setActiveChannel(editedPatternChannel)

    const selectedIsCompatible =
      selectedInstrumentIndex !== null &&
      isInstrumentValidForChannel(document.instruments[selectedInstrumentIndex], editedPatternChannel)

    if (selectedIsCompatible) {
      return
    }

    const firstCompatibleIndex = document.instruments.findIndex((instrument) =>
      isInstrumentValidForChannel(instrument, editedPatternChannel)
    )
    setSelectedInstrumentIndex(firstCompatibleIndex >= 0 ? firstCompatibleIndex : null)
  }, [document.instruments, editedPatternChannel, mode, selectedInstrumentIndex])

  const updateDocument = useCallback((updater: (current: MusicAssetDocument) => MusicAssetDocument) => {
    setDocument((current) => {
      const nextDocument = updater(current)

      if (nextDocument === current) {
        return current
      }

      undoStackRef.current = [...undoStackRef.current.slice(-99), current]
      redoStackRef.current = []
      return nextDocument
    })
  }, [])

  const undoDocument = useCallback(() => {
    setDocument((current) => {
      const previousDocument = undoStackRef.current.pop()

      if (!previousDocument) {
        return current
      }

      redoStackRef.current = [...redoStackRef.current.slice(-99), current]
      return previousDocument
    })
  }, [])

  const redoDocument = useCallback(() => {
    setDocument((current) => {
      const nextDocument = redoStackRef.current.pop()

      if (!nextDocument) {
        return current
      }

      undoStackRef.current = [...undoStackRef.current.slice(-99), current]
      return nextDocument
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target

      if (
        !(event.ctrlKey || event.metaKey) ||
        !(target instanceof HTMLElement) ||
        !target.closest('.music-editor')
      ) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoDocument()
        return
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        redoDocument()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [redoDocument, undoDocument])

  const seekToStep = useCallback(
    (absoluteStep: number) => {
      const nextStep = clamp(absoluteStep, 0, Math.max(0, totalSteps - 1))
      setPlayheadStep(nextStep)
      setSelectedSequenceIndex(Math.floor(nextStep / MUSIC_PATTERN_LENGTH))
      setSelectedStepIndex(nextStep % MUSIC_PATTERN_LENGTH)
    },
    [totalSteps]
  )

  const openPattern = useCallback(
    (patternId: string) => {
      const pattern = getPatternById(document, patternId)
      setFocusedPatternId(patternId)
      setActiveChannel(getPatternChannel(pattern))
      setMode('pattern')
    },
    [document]
  )

  const addPattern = useCallback(() => {
    updateDocument((current) => {
      const id = createPatternId(current.patterns)
      setFocusedPatternId(id)
      setActiveChannel(activeChannel)
      setMode('pattern')
      return {
        ...current,
        patterns: [
          ...current.patterns,
          {
            id,
            name: `Pattern ${current.patterns.length + 1}`,
            channel: activeChannel,
            steps: createEmptySteps()
          }
        ]
      }
    })
  }, [activeChannel, updateDocument])

  const addInstrument = useCallback(() => {
    const nextIndex = document.instruments.length
    const channelType = getInstrumentKindForChannel(editedPatternChannel)
    setSelectedInstrumentIndex(nextIndex)
    setDraftInstrumentIndex(nextIndex)
    setDraftInstrument(createDefaultInstrument(nextIndex, channelType))
    setMode('instrument')
  }, [document.instruments.length, editedPatternChannel])

  const editInstrument = useCallback(
    (instrumentIndex: number) => {
      const instrument = document.instruments[instrumentIndex]

      if (!instrument) {
        return
      }

      setSelectedInstrumentIndex(instrumentIndex)
      setDraftInstrumentIndex(instrumentIndex)
      setDraftInstrument({ ...instrument })
      setMode('instrument')
    },
    [document.instruments]
  )

  const saveInstrumentDraft = useCallback(() => {
    if (draftInstrument === null || draftInstrumentIndex === null) {
      return
    }

    updateDocument((current) => {
      const nextInstruments =
        draftInstrumentIndex >= current.instruments.length
          ? [...current.instruments, draftInstrument]
          : current.instruments.map((instrument, index) =>
              index === draftInstrumentIndex ? draftInstrument : instrument
            )

      return {
        ...current,
        instruments: nextInstruments
      }
    })
    setSelectedInstrumentIndex(draftInstrumentIndex)
    setDraftInstrument(null)
    setDraftInstrumentIndex(null)
    setMode('pattern')
  }, [draftInstrument, draftInstrumentIndex, updateDocument])

  const discardInstrumentDraft = useCallback(() => {
    const fallbackIndex =
      draftInstrumentIndex !== null && draftInstrumentIndex < document.instruments.length
        ? draftInstrumentIndex
        : document.instruments.length > 0
          ? 0
          : null
    setSelectedInstrumentIndex(fallbackIndex)
    setDraftInstrument(null)
    setDraftInstrumentIndex(null)
    setMode('pattern')
  }, [document.instruments.length, draftInstrumentIndex])

  const updatePatternStep = useCallback(
    (patternId: string, stepIndex: number, patch: Partial<MusicStep>) => {
      updateDocument((current) => ({
        ...current,
        patterns: current.patterns.map((pattern) =>
          pattern.id === patternId
            ? {
                ...pattern,
                steps: pattern.steps.map((step, index) =>
                  index === stepIndex ? { ...step, ...patch } : step
                )
              }
            : pattern
        )
      }))
    },
    [updateDocument]
  )

  const placeNote = useCallback(
    (patternId: string, stepIndex: number, noteIndex: number) => {
      if (selectedInstrumentIndex === null) {
        return
      }

      const instrument = document.instruments[selectedInstrumentIndex]

      if (!isInstrumentValidForChannel(instrument, editedPatternChannel)) {
        return
      }

      updatePatternStep(patternId, stepIndex, {
        noteIndex,
        instrument: selectedInstrumentIndex
      })
    },
    [document.instruments, editedPatternChannel, selectedInstrumentIndex, updatePatternStep]
  )

  const removeNote = useCallback(
    (patternId: string, stepIndex: number) => {
      updatePatternStep(patternId, stepIndex, {
        noteIndex: MUSIC_NOTE_REST,
        instrument: 0
      })
    },
    [updatePatternStep]
  )

  const handleNoteDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, targetStepIndex: number) => {
      event.preventDefault()

      if (!editedPattern) {
        return
      }

      const payload = readDragPayload(event)
      const noteIndex = getPitchFromPointer(event.currentTarget, event.clientY)

      if (payload?.type === 'note') {
        const instrument = document.instruments[payload.instrument]

        if (!isInstrumentValidForChannel(instrument, editedPatternChannel)) {
          return
        }

        updateDocument((current) => ({
          ...current,
          patterns: current.patterns.map((pattern) => {
            if (pattern.id !== payload.patternId && pattern.id !== editedPattern.id) {
              return pattern
            }

            return {
              ...pattern,
              steps: pattern.steps.map((step, index) => {
                const isSourceStep = pattern.id === payload.patternId && index === payload.stepIndex
                const isTargetStep = pattern.id === editedPattern.id && index === targetStepIndex

                if (isTargetStep) {
                  return {
                    noteIndex,
                    instrument: payload.instrument
                  }
                }

                if (isSourceStep) {
                  return { noteIndex: MUSIC_NOTE_REST, instrument: 0 }
                }

                return step
              })
            }
          })
        }))
        return
      }

      placeNote(editedPattern.id, targetStepIndex, noteIndex)
    },
    [document.instruments, editedPattern, editedPatternChannel, placeNote, updateDocument]
  )

  const handleClipDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, channel: MusicChannelKey, sequenceIndex: number) => {
      event.preventDefault()
      const payload = readDragPayload(event)

      if (!payload || (payload.type !== 'pattern' && payload.type !== 'clip')) {
        return
      }

      const draggedPattern = getPatternById(document, payload.patternId)

      if (draggedPattern && getPatternChannel(draggedPattern) !== channel) {
        return
      }

      updateDocument((current) => {
        const nextLength = Math.max(sequenceLength, sequenceIndex + 1)
        const nextSequence = CHANNELS.reduce(
          (sequence, nextChannel) => {
            sequence[nextChannel] = Array.from(
              { length: nextLength },
              (_, index) => current.sequence[nextChannel][index] ?? null
            )
            return sequence
          },
          {} as MusicAssetDocument['sequence']
        )

        if (
          payload.type === 'clip' &&
          (payload.channel !== channel || payload.sequenceIndex !== sequenceIndex)
        ) {
          nextSequence[payload.channel][payload.sequenceIndex] = null
        }

        nextSequence[channel][sequenceIndex] = payload.patternId

        return {
          ...current,
          sequence: nextSequence
        }
      })
      setActiveChannel(channel)
      setFocusedPatternId(payload.patternId)
      seekToStep(sequenceIndex * MUSIC_PATTERN_LENGTH)
    },
    [document, seekToStep, sequenceLength, updateDocument]
  )

  const handlePreview = useCallback(async () => {
    previewRef.current ??= new MusicPreviewPlayer()

    if (previewRef.current.isPlaying) {
      previewRef.current.stop()
      setIsPreviewPlaying(false)
      return
    }

    const isPatternPreview = mode !== 'sequence' && editedPattern !== null
    const previewDocument: MusicAssetDocument = isPatternPreview
      ? {
          ...effectiveDocument,
          sequence: {
            ch1: editedPatternChannel === 'ch1' ? [editedPattern.id] : [null],
            ch2: editedPatternChannel === 'ch2' ? [editedPattern.id] : [null],
            ch4: editedPatternChannel === 'ch4' ? [editedPattern.id] : [null]
          }
        }
      : effectiveDocument
    const patternPreviewBaseStep = selectedSequenceIndex * MUSIC_PATTERN_LENGTH
    const previewStartStep = isPatternPreview ? selectedStepIndex : playheadStep

    await previewRef.current.play(previewDocument, previewStartStep, (nextStep) => {
      if (isPatternPreview) {
        const patternStep = nextStep % MUSIC_PATTERN_LENGTH
        setPlayheadStep(patternPreviewBaseStep + patternStep)
        setSelectedStepIndex(patternStep)
        return
      }

      setPlayheadStep(nextStep)
      setSelectedSequenceIndex(Math.floor(nextStep / MUSIC_PATTERN_LENGTH))
      setSelectedStepIndex(nextStep % MUSIC_PATTERN_LENGTH)
    })
    setIsPreviewPlaying(true)
  }, [
    editedPattern,
    editedPatternChannel,
    effectiveDocument,
    mode,
    playheadStep,
    selectedSequenceIndex,
    selectedStepIndex
  ])

  const addSequenceSlot = useCallback(() => {
    updateDocument((current) => ({
      ...current,
      sequence: {
        ch1: [...current.sequence.ch1, null],
        ch2: [...current.sequence.ch2, null],
        ch4: [...current.sequence.ch4, null]
      }
    }))
    seekToStep(sequenceLength * MUSIC_PATTERN_LENGTH)
  }, [seekToStep, sequenceLength, updateDocument])

  const removeSequenceSlot = useCallback(() => {
    if (sequenceLength <= 1) {
      return
    }

    updateDocument((current) => ({
      ...current,
      sequence: {
        ch1: current.sequence.ch1.filter((_, index) => index !== selectedSequenceIndex),
        ch2: current.sequence.ch2.filter((_, index) => index !== selectedSequenceIndex),
        ch4: current.sequence.ch4.filter((_, index) => index !== selectedSequenceIndex)
      }
    }))
    seekToStep(Math.max(0, selectedSequenceIndex - 1) * MUSIC_PATTERN_LENGTH)
  }, [seekToStep, selectedSequenceIndex, sequenceLength, updateDocument])

  const arrangementSlots = useMemo(
    () => Array.from({ length: sequenceLength }, (_, index) => index),
    [sequenceLength]
  )
  const arrangementGridColumns = `130px repeat(${sequenceLength}, minmax(120px, 1fr)) 92px`

  if (!isLoaded) {
    return <main className="music-editor">Loading music asset...</main>
  }

  const renderPatternsPanel = (): ReactElement => (
    <aside className="music-editor__side-panel">
      <div className="music-editor__section-header">
        <h2>Patterns</h2>
        <button type="button" onClick={addPattern}>
          New
        </button>
      </div>
      <div className="music-editor__library-list">
        {document.patterns.length === 0 ? (
          <p className="music-editor__empty-copy">No patterns yet.</p>
        ) : (
          document.patterns.map((pattern) => (
            <button
              type="button"
              key={pattern.id}
              className={pattern.id === focusedPatternId ? 'is-selected' : ''}
              draggable
              onDragStart={(event) => writeDragPayload(event, { type: 'pattern', patternId: pattern.id })}
              onClick={() => setFocusedPatternId(pattern.id)}
              onDoubleClick={() => openPattern(pattern.id)}
            >
              <span>{CHANNEL_LABELS[getPatternChannel(pattern)]}</span>
              {pattern.name}
            </button>
          ))
        )}
      </div>
    </aside>
  )

  const renderInstrumentsPanel = (): ReactElement => (
    <aside className="music-editor__side-panel">
      <div className="music-editor__section-header">
        <div>
          <h2>Instruments</h2>
          <span>{CHANNEL_KIND_LABELS[getInstrumentKindForChannel(editedPatternChannel)]}</span>
        </div>
        <button type="button" onClick={addInstrument}>
          New
        </button>
      </div>
      <button type="button" onClick={() => setMode('sequence')}>
        Back
      </button>
      <div className="music-editor__library-list">
        {document.instruments.filter((instrument) =>
          isInstrumentValidForChannel(instrument, editedPatternChannel)
        ).length === 0 ? (
          <p className="music-editor__empty-copy">No compatible instruments yet.</p>
        ) : (
          document.instruments.map((instrument, index) =>
            isInstrumentValidForChannel(instrument, editedPatternChannel) ? (
              <button
                type="button"
                key={index}
                className={index === selectedInstrumentIndex ? 'is-selected' : ''}
                onClick={() => setSelectedInstrumentIndex(index)}
                onDoubleClick={() => editInstrument(index)}
              >
                <span>{index.toString().padStart(2, '0')}</span>
                {instrument.name || `Instrument ${index}`}
              </button>
            ) : null
          )
        )}
      </div>
    </aside>
  )

  const renderInstrumentEditor = (): ReactElement => (
    <aside className="music-editor__side-panel music-editor__instrument-edit-panel">
      <div className="music-editor__section-header">
        <h2>Instrument</h2>
      </div>
      {draftInstrument ? (
        <>
          <label>
            Name
            <input
              value={draftInstrument.name ?? ''}
              onChange={(event) =>
                setDraftInstrument((current) =>
                  current ? { ...current, name: event.target.value } : current
                )
              }
            />
          </label>
          <label>
            Type
            <select
              value={getInstrumentKind(draftInstrument)}
              onChange={(event) => {
                const channelType = event.target.value as MusicInstrumentKind
                setDraftInstrument((current) =>
                  current
                    ? {
                        ...createDefaultInstrument(draftInstrumentIndex ?? 0, channelType),
                        name: current.name,
                        reg1: current.reg1,
                        reg2: current.reg2,
                        reg3: current.reg3
                      }
                    : current
                )
              }}
            >
              <option value="pulse">Pulse (CH1/CH2)</option>
              <option value="noise">Noise (CH4)</option>
            </select>
          </label>
          <div className="music-editor__hex-row">
            {(['reg1', 'reg2', 'reg3'] as const).map((registerKey) => (
              <label key={registerKey}>
                {registerKey.toUpperCase()}
                <input
                  value={formatHexByte(draftInstrument[registerKey])}
                  onChange={(event) => {
                    const parsedByte = parseByteInput(event.target.value)

                    if (parsedByte === null) {
                      return
                    }

                    setDraftInstrument((current) =>
                      current ? { ...current, [registerKey]: parsedByte } : current
                    )
                  }}
                />
              </label>
            ))}
          </div>
          {pulseState && editedInstrumentKind === 'pulse' ? (
            <div className="music-editor__decoded">
              <h3>Pulse</h3>
              <label>
                Duty
                <select
                  value={pulseState.duty}
                  onChange={(event) =>
                    setDraftInstrument((current) =>
                      current ? updatePulseInstrument(current, { duty: Number(event.target.value) }) : current
                    )
                  }
                >
                  {DUTY_LABELS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Length
                <input
                  type="number"
                  min={0}
                  max={63}
                  value={pulseState.length}
                  onChange={(event) =>
                    setDraftInstrument((current) =>
                      current
                        ? updatePulseInstrument(current, {
                            length: Number(event.target.value)
                          })
                        : current
                    )
                  }
                />
              </label>
              <label>
                Volume
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={pulseState.initialVolume}
                  onChange={(event) =>
                    setDraftInstrument((current) =>
                      current
                        ? updatePulseInstrument(current, {
                            initialVolume: Number(event.target.value)
                          })
                        : current
                    )
                  }
                />
              </label>
              <label>
                Envelope
                <select
                  value={pulseState.envelopeDirection}
                  onChange={(event) =>
                    setDraftInstrument((current) =>
                      current
                        ? updatePulseInstrument(current, {
                            envelopeDirection: event.target.value as 'decrease' | 'increase'
                          })
                        : current
                    )
                  }
                >
                  <option value="decrease">Decrease</option>
                  <option value="increase">Increase</option>
                </select>
              </label>
              <label>
                Pace
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={pulseState.envelopePace}
                  onChange={(event) =>
                    setDraftInstrument((current) =>
                      current
                        ? updatePulseInstrument(current, {
                            envelopePace: Number(event.target.value)
                          })
                        : current
                    )
                  }
                />
              </label>
            </div>
          ) : null}
          {noiseState && editedInstrumentKind === 'noise' ? (
            <div className="music-editor__decoded">
              <h3>Noise</h3>
              <label>
                Length
                <input
                  type="number"
                  min={0}
                  max={63}
                  value={noiseState.length}
                  onChange={(event) =>
                    setDraftInstrument((current) =>
                      current
                        ? updateNoiseInstrument(current, {
                            length: Number(event.target.value)
                          })
                        : current
                    )
                  }
                />
              </label>
              <label>
                Volume
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={noiseState.initialVolume}
                  onChange={(event) =>
                    setDraftInstrument((current) =>
                      current
                        ? updateNoiseInstrument(current, {
                            initialVolume: Number(event.target.value)
                          })
                        : current
                    )
                  }
                />
              </label>
              <label>
                Envelope
                <select
                  value={noiseState.envelopeDirection}
                  onChange={(event) =>
                    setDraftInstrument((current) =>
                      current
                        ? updateNoiseInstrument(current, {
                            envelopeDirection: event.target.value as 'decrease' | 'increase'
                          })
                        : current
                    )
                  }
                >
                  <option value="decrease">Decrease</option>
                  <option value="increase">Increase</option>
                </select>
              </label>
              <label>
                Pace
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={noiseState.envelopePace}
                  onChange={(event) =>
                    setDraftInstrument((current) =>
                      current
                        ? updateNoiseInstrument(current, {
                            envelopePace: Number(event.target.value)
                          })
                        : current
                    )
                  }
                />
              </label>
              <label>
                LFSR
                <select
                  value={noiseState.widthMode}
                  onChange={(event) =>
                    setDraftInstrument((current) =>
                      current
                        ? updateNoiseInstrument(current, {
                            widthMode: Number(event.target.value) as 15 | 7
                          })
                        : current
                    )
                  }
                >
                  <option value={15}>15-bit</option>
                  <option value={7}>7-bit</option>
                </select>
              </label>
              <label>
                Shift
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={noiseState.clockShift}
                  onChange={(event) =>
                    setDraftInstrument((current) =>
                      current
                        ? updateNoiseInstrument(current, {
                            clockShift: Number(event.target.value)
                          })
                        : current
                    )
                  }
                />
              </label>
              <label>
                Divider
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={noiseState.divisorCode}
                  onChange={(event) =>
                    setDraftInstrument((current) =>
                      current
                        ? updateNoiseInstrument(current, {
                            divisorCode: Number(event.target.value)
                          })
                        : current
                    )
                  }
                />
              </label>
            </div>
          ) : null}
          <div className="music-editor__button-row">
            <button type="button" onClick={saveInstrumentDraft}>
              Save
            </button>
            <button type="button" onClick={discardInstrumentDraft}>
              Discard
            </button>
          </div>
        </>
      ) : null}
    </aside>
  )

  const renderSequenceEditor = (): ReactElement => (
    <section className="music-editor__arrangement">
      <div className="music-editor__section-header">
        <h2>Sequence</h2>
        <div>
          <button type="button" onClick={addSequenceSlot}>
            Add Bar
          </button>
          <button type="button" onClick={removeSequenceSlot} disabled={sequenceLength <= 1}>
            Remove Bar
          </button>
        </div>
      </div>
      <div className="music-editor__timeline-ruler" style={{ gridTemplateColumns: arrangementGridColumns }}>
        <span />
        {arrangementSlots.map((slotIndex) => (
          <button
            type="button"
            key={slotIndex}
            className={slotIndex === selectedSequenceIndex ? 'is-selected' : ''}
            onClick={() => seekToStep(slotIndex * MUSIC_PATTERN_LENGTH)}
          >
            {slotIndex + 1}
          </button>
        ))}
        <span className="music-editor__append-ruler">+</span>
      </div>
      <div className="music-editor__arrangement-grid">
        {CHANNELS.map((channel) => (
          <div
            className="music-editor__arrangement-row"
            key={channel}
            style={{ gridTemplateColumns: arrangementGridColumns }}
          >
            <button
              type="button"
              className={channel === activeChannel ? 'music-editor__lane is-selected' : 'music-editor__lane'}
              onClick={() => setActiveChannel(channel)}
            >
              {CHANNEL_LABELS[channel]}
            </button>
            {arrangementSlots.map((slotIndex) => {
              const patternId = document.sequence[channel][slotIndex] ?? null
              const pattern = getPatternById(document, patternId)
              const isPlaying = Math.floor(playheadStep / MUSIC_PATTERN_LENGTH) === slotIndex

              return (
                <div
                  className={isPlaying ? 'music-editor__clip-cell is-playing' : 'music-editor__clip-cell'}
                  key={`${channel}-${slotIndex}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleClipDrop(event, channel, slotIndex)}
                >
                  {pattern ? (
                    <button
                      type="button"
                      className="music-editor__clip"
                      draggable
                      onDragStart={(event) =>
                        writeDragPayload(event, {
                          type: 'clip',
                          patternId: pattern.id,
                          channel,
                          sequenceIndex: slotIndex
                        })
                      }
                      onClick={() => {
                        setActiveChannel(channel)
                        setFocusedPatternId(pattern.id)
                        seekToStep(slotIndex * MUSIC_PATTERN_LENGTH)
                      }}
                      onDoubleClick={() => openPattern(pattern.id)}
                    >
                      {pattern.name}
                    </button>
                  ) : (
                    <span className="music-editor__empty-clip">Drop Pattern</span>
                  )}
                </div>
              )
            })}
            <div
              className="music-editor__clip-cell music-editor__clip-cell--append"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleClipDrop(event, channel, sequenceLength)}
            >
              <span className="music-editor__empty-clip">Drop to Add</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )

  const renderPatternEditor = (): ReactElement => (
    <section className="music-editor__pattern-area">
      <div className="music-editor__section-header">
        <div>
          <h2>{editedPattern?.name ?? 'Pattern'}</h2>
          <span>
            {selectedInstrumentIndex === null
              ? 'No compatible instrument selected'
              : `Instrument ${selectedInstrumentIndex}`}
          </span>
        </div>
        <div>
          <button type="button" onClick={() => setMode('sequence')}>
            Sequence
          </button>
          {editedPattern ? (
            <label className="music-editor__compact-field">
              <span>Channel</span>
              <select
                value={editedPatternChannel}
                onChange={(event) => {
                  const nextChannel = event.target.value as MusicChannelKey
                  updateDocument((current) => ({
                    ...current,
                    patterns: current.patterns.map((pattern) =>
                      pattern.id === editedPattern.id ? { ...pattern, channel: nextChannel } : pattern
                    )
                  }))
                  setActiveChannel(nextChannel)
                }}
              >
                {CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {CHANNEL_LABELS[channel]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {editedPattern ? (
            <input
              aria-label="Pattern Name"
              value={editedPattern.name}
              onChange={(event) =>
                updateDocument((current) => ({
                  ...current,
                  patterns: current.patterns.map((pattern) =>
                    pattern.id === editedPattern.id ? { ...pattern, name: event.target.value } : pattern
                  )
                }))
              }
            />
          ) : null}
        </div>
      </div>
      <div className="music-editor__step-strip">
        {Array.from({ length: MUSIC_PATTERN_LENGTH }, (_, stepIndex) => {
          const absoluteStep = selectedSequenceIndex * MUSIC_PATTERN_LENGTH + stepIndex
          return (
            <button
              type="button"
              key={stepIndex}
              className={[
                stepIndex === selectedStepIndex ? 'is-selected' : '',
                absoluteStep === playheadStep ? 'is-playing' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => seekToStep(absoluteStep)}
            >
              {stepIndex + 1}
            </button>
          )
        })}
      </div>
      <div className="music-editor__piano-roll">
        {Array.from({ length: MUSIC_PATTERN_LENGTH }, (_, stepIndex) => {
          const step = editedPattern?.steps[stepIndex]
          const absoluteStep = selectedSequenceIndex * MUSIC_PATTERN_LENGTH + stepIndex
          const isRest = !step || step.noteIndex === MUSIC_NOTE_REST
          const pitchPercent = isRest ? 6 : 8 + (step.noteIndex / (NOTE_NAMES.length - 1)) * 78

          return (
            <div
              className={[
                'music-editor__note-column',
                stepIndex === selectedStepIndex ? 'is-selected' : '',
                absoluteStep === playheadStep ? 'is-playing' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              key={stepIndex}
              onClick={(event: MouseEvent<HTMLDivElement>) => {
                if (!editedPattern || event.target !== event.currentTarget) {
                  return
                }

                setSelectedStepIndex(stepIndex)
                placeNote(editedPattern.id, stepIndex, getPitchFromPointer(event.currentTarget, event.clientY))
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleNoteDrop(event, stepIndex)}
            >
              {!isRest && editedPattern && step ? (
                <button
                  type="button"
                  className="music-editor__note-block"
                  style={{ bottom: `${pitchPercent}%` }}
                  draggable
                  onClick={(event) => {
                    event.stopPropagation()
                    seekToStep(absoluteStep)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    removeNote(editedPattern.id, stepIndex)
                  }}
                  onDragStart={(event) =>
                    writeDragPayload(event, {
                      type: 'note',
                      patternId: editedPattern.id,
                      stepIndex,
                      noteIndex: step.noteIndex,
                      instrument: step.instrument
                    })
                  }
                >
                  <span>{getNoteLabel(step.noteIndex)}</span>
                  <small>I{step.instrument}</small>
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )

  return (
    <main className="music-editor">
      <header className="music-editor__transport">
        <div className="music-editor__title">
          <span>Music</span>
          <h1>{getProjectAssetDisplayName(assetPath.split('/').pop() ?? 'Music')}</h1>
          <p>{isDirty ? 'Unsaved changes' : 'Saved'} {statusMessage ? `- ${statusMessage}` : ''}</p>
        </div>
        <div className="music-editor__transport-controls">
          <button type="button" onClick={handlePreview}>
            {isPreviewPlaying ? 'Stop' : 'Play'}
          </button>
          <button type="button" onClick={() => seekToStep(Math.max(0, playheadStep - 1))}>
            Prev
          </button>
          <button type="button" onClick={() => seekToStep(Math.min(totalSteps - 1, playheadStep + 1))}>
            Next
          </button>
          <label>
            Step
            <input
              aria-label="Preview Step"
              type="number"
              min={0}
              max={Math.max(0, totalSteps - 1)}
              value={playheadStep}
              onChange={(event) => seekToStep(Number(event.target.value))}
            />
          </label>
          <label>
            Speed
            <input
              type="number"
              min={1}
              max={255}
              value={document.speed}
              onChange={(event) =>
                updateDocument((current) => ({
                  ...current,
                  speed: clampByte(Number(event.target.value)) || 1
                }))
              }
            />
          </label>
          <label className="music-editor__check">
            <input
              type="checkbox"
              checked={document.loop}
              onChange={(event) =>
                updateDocument((current) => ({ ...current, loop: event.target.checked }))
              }
            />
            Loop
          </label>
          <button type="button" disabled={isSaving} onClick={() => void saveAsset()}>
            {isSaving ? 'Saving' : 'Save'}
          </button>
        </div>
      </header>

      <section className="music-editor__workspace">
        {mode === 'sequence'
          ? renderPatternsPanel()
          : mode === 'pattern'
            ? renderInstrumentsPanel()
            : renderInstrumentEditor()}
        <section className="music-editor__main">
          {mode === 'sequence' ? renderSequenceEditor() : renderPatternEditor()}
        </section>
      </section>

      {isClosePromptOpen ? (
        <EditorClosePrompt
          assetLabel={getProjectAssetDisplayName(assetPath.split('/').pop() ?? 'Music')}
          isBusy={isSaving}
          onCloseDecision={(decision) => void handleCloseDecision(decision)}
        />
      ) : null}
    </main>
  )
}
