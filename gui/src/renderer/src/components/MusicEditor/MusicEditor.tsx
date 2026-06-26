import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactElement } from 'react'
import {
  MUSIC_NOTE_REST,
  MUSIC_PATTERN_LENGTH,
  getProjectAssetDisplayName,
  type MusicAssetDocument,
  type MusicChannelKey,
  type MusicInstrument,
  type MusicStep
} from '../../../../shared/projectAssets'
import { useProjectAssetEditor } from '../hooks/useProjectAssetEditor'
import { EditorClosePrompt } from '../ProjectAssets/EditorClosePrompt'
import { MusicPreviewPlayer, NOTE_NAMES } from './musicPreview'
import { MusicInstrumentEditorPanel } from './MusicInstrumentEditorPanel'
import {
  CHANNELS,
  CHANNEL_KIND_LABELS,
  CHANNEL_LABELS,
  asMusicDocument,
  clamp,
  clampByte,
  createDefaultInstrument,
  createEmptySteps,
  createPatternId,
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
  readDragPayload,
  sanitizeMusicSequenceCompatibility,
  writeDragPayload,
  type EditorMode
} from './musicEditorModel'
import './MusicEditor.css'

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
  const [, setHistoryRevision] = useState(0)
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

      const compatibleDocument = sanitizeMusicSequenceCompatibility(nextDocument)
      undoStackRef.current = [...undoStackRef.current.slice(-99), current]
      redoStackRef.current = []
      return compatibleDocument
    })
    setHistoryRevision((revision) => revision + 1)
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
    setHistoryRevision((revision) => revision + 1)
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
    setHistoryRevision((revision) => revision + 1)
  }, [])

  const canUndo = undoStackRef.current.length > 0
  const canRedo = redoStackRef.current.length > 0

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

      if (draggedPattern && !isPatternValidForChannel(document, draggedPattern, channel)) {
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
  const getPatternScopeLabel = useCallback(
    (pattern: MusicAssetDocument['patterns'][number]): string => {
      const patternChannel = getPatternChannel(pattern)

      if (patternChannel === 'ch4') {
        return 'CH4 Noise'
      }

      return isPatternUsingSweep(document, pattern) ? 'CH1 Sweep' : 'CH1/CH2 Pulse'
    },
    [document]
  )
  const getInstrumentScopeLabel = useCallback((instrument: MusicInstrument): string => {
    if (getInstrumentKind(instrument) === 'noise') {
      return 'CH4 Noise'
    }

    return isPulseInstrumentUsingSweep(instrument) ? 'CH1 Sweep' : 'CH1/CH2 Pulse'
  }, [])
  const getInstrumentUnavailableReason = useCallback(
    (instrument: MusicInstrument, channel: MusicChannelKey): string => {
      if (getInstrumentKindForChannel(channel) !== getInstrumentKind(instrument)) {
        return getInstrumentKind(instrument) === 'noise' ? 'Noise only works on CH4' : 'Pulse only works on CH1/CH2'
      }

      if (channel === 'ch2' && isPulseInstrumentUsingSweep(instrument)) {
        return 'Sweep only works on CH1'
      }

      return ''
    },
    []
  )
  const editedPatternScope = editedPattern ? getPatternScopeLabel(editedPattern) : 'No pattern'
  const selectedInstrument = selectedInstrumentIndex !== null ? document.instruments[selectedInstrumentIndex] : null
  const selectedInstrumentScope = selectedInstrument ? getInstrumentScopeLabel(selectedInstrument) : null

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
          document.patterns.map((pattern) => {
            const patternScope = getPatternScopeLabel(pattern)

            return (
              <button
                type="button"
                key={pattern.id}
                className={pattern.id === focusedPatternId ? 'is-selected' : ''}
                draggable
                onDragStart={(event) => writeDragPayload(event, { type: 'pattern', patternId: pattern.id })}
                onClick={() => setFocusedPatternId(pattern.id)}
              onDoubleClick={() => openPattern(pattern.id)}
            >
              <span>{patternScope}</span>
              <strong>{pattern.name}</strong>
            </button>
            )
          })
        )}
      </div>
    </aside>
  )

  const renderInstrumentsPanel = (): ReactElement => (
    <aside className="music-editor__side-panel">
      <div className="music-editor__section-header">
        <div>
          <h2>Instruments</h2>
          <span>{CHANNEL_LABELS[editedPatternChannel]}</span>
        </div>
        <button type="button" onClick={addInstrument}>
          New
        </button>
      </div>
      <p className="music-editor__status">
        {CHANNEL_KIND_LABELS[getInstrumentKindForChannel(editedPatternChannel)]}
        {selectedInstrumentScope ? ` - selected ${selectedInstrumentScope}` : ''}
      </p>
      <button type="button" onClick={() => setMode('sequence')}>
        Back
      </button>
      <div className="music-editor__library-list">
        {document.instruments.length === 0 ? (
          <p className="music-editor__empty-copy">No compatible instruments yet.</p>
        ) : (
          document.instruments.map((instrument, index) => {
            const isCompatible = isInstrumentValidForChannel(instrument, editedPatternChannel)
            const unavailableReason = getInstrumentUnavailableReason(instrument, editedPatternChannel)

            return (
              <button
                type="button"
                key={index}
                className={[
                  index === selectedInstrumentIndex ? 'is-selected' : '',
                  isCompatible ? '' : 'is-incompatible'
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-disabled={!isCompatible}
                title={unavailableReason || getInstrumentScopeLabel(instrument)}
                onClick={() => {
                  if (isCompatible) {
                    setSelectedInstrumentIndex(index)
                  }
                }}
                onDoubleClick={() => editInstrument(index)}
              >
                <span>{index.toString().padStart(2, '0')}</span>
                <strong>{instrument.name || `Instrument ${index}`}</strong>
                <small>{isCompatible ? getInstrumentScopeLabel(instrument) : unavailableReason}</small>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )

  const renderInstrumentEditor = (): ReactElement => (
    <MusicInstrumentEditorPanel
      draftInstrument={draftInstrument}
      draftInstrumentIndex={draftInstrumentIndex}
      setDraftInstrument={setDraftInstrument}
      onSave={saveInstrumentDraft}
      onDiscard={discardInstrumentDraft}
    />
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
              const isFocusedPatternCompatible =
                !focusedPattern || isPatternValidForChannel(document, focusedPattern, channel)

              return (
                <div
                  className={[
                    'music-editor__clip-cell',
                    isPlaying ? 'is-playing' : '',
                    isFocusedPatternCompatible ? '' : 'is-incompatible'
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={`${channel}-${slotIndex}`}
                  title={isFocusedPatternCompatible ? undefined : `${getPatternScopeLabel(focusedPattern)} cannot play on ${CHANNEL_LABELS[channel]}`}
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
                    <span className="music-editor__empty-clip">
                      {isFocusedPatternCompatible ? 'Drop Pattern' : 'Unavailable'}
                    </span>
                  )}
                </div>
              )
            })}
            {(() => {
              const isFocusedPatternCompatible =
                !focusedPattern || isPatternValidForChannel(document, focusedPattern, channel)

              return (
            <div
              className={[
                'music-editor__clip-cell',
                'music-editor__clip-cell--append',
                isFocusedPatternCompatible ? '' : 'is-incompatible'
              ]
                .filter(Boolean)
                .join(' ')}
              title={isFocusedPatternCompatible ? undefined : `${getPatternScopeLabel(focusedPattern)} cannot play on ${CHANNEL_LABELS[channel]}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleClipDrop(event, channel, sequenceLength)}
            >
              <span className="music-editor__empty-clip">
                {isFocusedPatternCompatible ? 'Drop to Add' : 'Unavailable'}
              </span>
            </div>
              )
            })()}
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
              : `Instrument ${selectedInstrumentIndex}${selectedInstrumentScope ? ` - ${selectedInstrumentScope}` : ''}`}
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

                  if (nextChannel === 'ch2' && isPatternUsingSweep(document, editedPattern)) {
                    return
                  }

                  updateDocument((current) => ({
                    ...current,
                    patterns: current.patterns.map((pattern) =>
                      pattern.id === editedPattern.id ? { ...pattern, channel: nextChannel } : pattern
                    )
                  }))
                  setActiveChannel(nextChannel)
                }}
              >
                {CHANNELS.map((channel) => {
                  const isDisabled =
                    channel === 'ch2' && isPatternUsingSweep(document, editedPattern)

                  return (
                    <option key={channel} value={channel} disabled={isDisabled}>
                      {CHANNEL_LABELS[channel]}
                      {isDisabled ? ' - sweep unavailable' : ''}
                    </option>
                  )
                })}
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
      {editedPattern ? (
        <div className="music-editor__pattern-status" role="status">
          <span className="music-editor__badge">{editedPatternScope}</span>
          <span>
            {isPatternUsingSweep(document, editedPattern)
              ? 'CH2 is disabled because this pattern uses CH1 sweep.'
              : editedPatternChannel === 'ch4'
                ? 'Noise patterns can only be sequenced on CH4.'
                : 'Plain pulse patterns can be sequenced on CH1 or CH2.'}
          </span>
        </div>
      ) : null}
      <div className="music-editor__pattern-grid">
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
          <button type="button" disabled={!canUndo} onClick={undoDocument}>
            Undo
          </button>
          <button type="button" disabled={!canRedo} onClick={redoDocument}>
            Redo
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
