import * as React from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MusicInstrument } from '../../../src/shared/projectAssets'
import { MusicInstrumentEditorPanel } from '../../../src/renderer/src/components/MusicEditor/MusicInstrumentEditorPanel'

const renderPanel = (
  initialInstrument: MusicInstrument | null,
  options: { index?: number | null; onSave?: () => void; onDiscard?: () => void } = {}
): ReturnType<typeof render> & { getInstrument: () => MusicInstrument | null } => {
  const latestInstrument = { current: initialInstrument }

  const Harness = (): React.ReactElement => {
    const [draftInstrument, setDraftInstrumentState] = React.useState<MusicInstrument | null>(initialInstrument)
    const setDraftInstrument: Dispatch<SetStateAction<MusicInstrument | null>> = (value) => {
      setDraftInstrumentState((current) => {
        const nextInstrument =
          typeof value === 'function'
            ? (value as (current: MusicInstrument | null) => MusicInstrument | null)(current)
            : value

        latestInstrument.current = nextInstrument
        return nextInstrument
      })
    }

    return (
      <MusicInstrumentEditorPanel
        draftInstrument={draftInstrument}
        draftInstrumentIndex={options.index ?? 0}
        setDraftInstrument={setDraftInstrument}
        onSave={options.onSave ?? vi.fn()}
        onDiscard={options.onDiscard ?? vi.fn()}
      />
    )
  }

  return {
    ...render(<Harness />),
    getInstrument: () => latestInstrument.current
  }
}

describe('MusicInstrumentEditorPanel', () => {
  it('renders only the shell when there is no draft instrument', () => {
    renderPanel(null)
    expect(screen.getByRole('heading', { name: 'Instrument' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('edits pulse instruments through raw registers and decoded fields', () => {
    const onSave = vi.fn()
    const onDiscard = vi.fn()
    const view = renderPanel(
      { name: 'Lead', channelType: 'pulse', reg1: 0x80, reg2: 0xf2, reg3: 0 },
      { onSave, onDiscard }
    )

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lead 2' } })
    expect(view.getInstrument()).toMatchObject({ name: 'Lead 2' })
    expect(screen.getByLabelText('Type')).toHaveDisplayValue('Pulse (CH1/CH2)')

    fireEvent.change(screen.getByLabelText('REG1'), { target: { value: 'bad' } })
    expect(view.getInstrument()).toMatchObject({ reg1: 0x80 })
    fireEvent.change(screen.getByLabelText('REG1'), { target: { value: '0x40' } })
    expect(view.getInstrument()).toMatchObject({ reg1: 0x40 })
    fireEvent.change(screen.getByLabelText('SWEEP'), { target: { value: '0x12' } })
    expect(view.getInstrument()).toMatchObject({ sweep: 0x12 })

    fireEvent.change(screen.getByLabelText('Sweep Pace'), { target: { value: '2' } })
    expect(screen.getByLabelText('Type')).toHaveDisplayValue('Pulse (CH1 sweep)')
    expect(screen.getByText('CH1 only: sweep is enabled.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Sweep Shift'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Sweep'), { target: { value: 'decrease' } })
    fireEvent.change(screen.getByLabelText('Duty'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Length'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Volume'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Pace'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Envelope'), { target: { value: 'increase' } })
    expect(view.getInstrument()).toMatchObject({ channelType: 'pulse', sweep: 0x2b, reg1: 0xcc, reg2: 0x8c })
    expect(screen.getByLabelText('Type')).toHaveDisplayValue('Pulse (CH1 sweep)')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onSave).toHaveBeenCalled()
    expect(onDiscard).toHaveBeenCalled()
  })

  it('switches to noise and edits noise-specific fields', () => {
    const view = renderPanel(
      { name: 'Perc', channelType: 'pulse', reg1: 0x80, reg2: 0xf2, reg3: 0 },
      { index: null }
    )

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'noise' } })
    expect(view.getInstrument()).toMatchObject({
      name: 'Perc',
      channelType: 'noise',
      reg1: 0x80,
      reg2: 0xf2,
      reg3: 0
    })

    fireEvent.change(screen.getByLabelText('Shift'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Divider'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('LFSR'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Envelope'), { target: { value: 'decrease' } })
    expect(view.getInstrument()).toMatchObject({ channelType: 'noise', reg3: 0x6d })
  })
})
