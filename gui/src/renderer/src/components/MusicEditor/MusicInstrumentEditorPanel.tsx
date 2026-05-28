import type { Dispatch, ReactElement, SetStateAction } from 'react'
import type { MusicInstrument, MusicInstrumentKind } from '../../../../shared/projectAssets'
import {
  type NoiseInstrumentState,
  type PulseInstrumentState,
  decodeNoiseInstrument,
  decodePulseInstrument
} from './musicPreview'
import {
  DUTY_LABELS,
  createDefaultInstrument,
  formatHexByte,
  getInstrumentKind,
  parseByteInput,
  updateNoiseInstrument,
  updatePulseInstrument
} from './musicEditorModel'

interface MusicInstrumentEditorPanelProps {
  draftInstrument: MusicInstrument | null
  draftInstrumentIndex: number | null
  setDraftInstrument: Dispatch<SetStateAction<MusicInstrument | null>>
  onSave: () => void
  onDiscard: () => void
}

type PulseNumericField = {
  label: string
  property: keyof Pick<PulseInstrumentState, 'length' | 'initialVolume' | 'envelopePace'>
  min: number
  max: number
}

type NoiseNumericField = {
  label: string
  property: keyof Pick<
    NoiseInstrumentState,
    'length' | 'initialVolume' | 'envelopePace' | 'clockShift' | 'divisorCode'
  >
  min: number
  max: number
}

const PULSE_NUMERIC_FIELDS: PulseNumericField[] = [
  { label: 'Length', property: 'length', min: 0, max: 63 },
  { label: 'Volume', property: 'initialVolume', min: 0, max: 15 },
  { label: 'Pace', property: 'envelopePace', min: 0, max: 7 }
]

const NOISE_NUMERIC_FIELDS: NoiseNumericField[] = [
  { label: 'Length', property: 'length', min: 0, max: 63 },
  { label: 'Volume', property: 'initialVolume', min: 0, max: 15 },
  { label: 'Pace', property: 'envelopePace', min: 0, max: 7 },
  { label: 'Shift', property: 'clockShift', min: 0, max: 15 },
  { label: 'Divider', property: 'divisorCode', min: 0, max: 7 }
]

export const MusicInstrumentEditorPanel = ({
  draftInstrument,
  draftInstrumentIndex,
  setDraftInstrument,
  onSave,
  onDiscard
}: MusicInstrumentEditorPanelProps): ReactElement => {
  const editedInstrumentKind = draftInstrument ? getInstrumentKind(draftInstrument) : 'pulse'
  const pulseState = draftInstrument ? decodePulseInstrument(draftInstrument) : null
  const noiseState = draftInstrument ? decodeNoiseInstrument(draftInstrument) : null

  const updatePulseField = (
    property: PulseNumericField['property'],
    value: number
  ): void => {
    setDraftInstrument((current) =>
      current ? updatePulseInstrument(current, { [property]: value }) : current
    )
  }

  const updateNoiseField = (
    property: NoiseNumericField['property'],
    value: number
  ): void => {
    setDraftInstrument((current) =>
      current ? updateNoiseInstrument(current, { [property]: value }) : current
    )
  }

  return (
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
                      current
                        ? updatePulseInstrument(current, { duty: Number(event.target.value) })
                        : current
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
              {PULSE_NUMERIC_FIELDS.map((field) => (
                <label key={field.property}>
                  {field.label}
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={pulseState[field.property]}
                    onChange={(event) => updatePulseField(field.property, Number(event.target.value))}
                  />
                </label>
              ))}
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
            </div>
          ) : null}
          {noiseState && editedInstrumentKind === 'noise' ? (
            <div className="music-editor__decoded">
              <h3>Noise</h3>
              {NOISE_NUMERIC_FIELDS.map((field) => (
                <label key={field.property}>
                  {field.label}
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={noiseState[field.property]}
                    onChange={(event) => updateNoiseField(field.property, Number(event.target.value))}
                  />
                </label>
              ))}
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
            </div>
          ) : null}
          <div className="music-editor__button-row">
            <button type="button" onClick={onSave}>
              Save
            </button>
            <button type="button" onClick={onDiscard}>
              Discard
            </button>
          </div>
        </>
      ) : null}
    </aside>
  )
}
