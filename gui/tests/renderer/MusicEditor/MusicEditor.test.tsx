import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MusicEditor } from '../../../src/renderer/src/components/MusicEditor/MusicEditor'
import {
  MUSIC_NOTE_REST,
  createDefaultProjectAssetDocument,
  type MusicAssetDocument,
  type MusicStep
} from '../../../src/shared/projectAssets'

const renderEditor = (): ReturnType<typeof render> => {
  return render(
    <React.Fragment>
      <MemoryRouter
        initialEntries={[
          '/music-editor?projectPath=/projects/Alpha&assetPath=Audio/Battle.rgbmusic.json'
        ]}
      >
        <Routes>
          <Route path="/music-editor" element={<MusicEditor />} />
        </Routes>
      </MemoryRouter>
    </React.Fragment>
  )
}

const createEmptySteps = (): MusicStep[] =>
  Array.from({ length: 16 }, () => ({
    noteIndex: MUSIC_NOTE_REST,
    instrument: 0
  }))

const clickInstrumentSave = (): void => {
  const saveButtons = screen.getAllByRole('button', { name: 'Save' })
  fireEvent.click(saveButtons[saveButtons.length - 1]!)
}

const createDataTransfer = (): DataTransfer => {
  const values = new Map<string, string>()

  return {
    dropEffect: 'move',
    effectAllowed: 'all',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: (format?: string) => {
      if (format) {
        values.delete(format)
        return
      }

      values.clear()
    },
    getData: (format: string) => values.get(format) ?? '',
    setData: (format: string, value: string) => {
      values.set(format, value)
    },
    setDragImage: () => undefined
  } as DataTransfer
}

describe('MusicEditor', () => {
  beforeEach(() => {
    vi.mocked(window.api.loadProjectAssetFile).mockReset()
    vi.mocked(window.api.saveProjectAssetFile).mockReset()
  })

  it('loads, edits, and saves a music asset document', async () => {
    const document = createDefaultProjectAssetDocument('music') as MusicAssetDocument
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'music',
      resourcePath: 'Audio/Battle.rgbmusic.json',
      document
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(
      async (_projectPath, resourcePath, savedDocument) => ({
        assetKind: 'music',
        resourcePath,
        document: savedDocument
      })
    )

    renderEditor()

    expect(await screen.findByRole('heading', { name: 'Battle' })).toBeInTheDocument()
    const speedInput = screen.getByLabelText('Speed')
    fireEvent.change(speedInput, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Audio/Battle.rgbmusic.json',
        expect.objectContaining({
          kind: 'music',
          speed: 10
        })
      )
    })
  })

  it('offers undo and redo controls for music document edits', async () => {
    const document = createDefaultProjectAssetDocument('music') as MusicAssetDocument
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'music',
      resourcePath: 'Audio/Battle.rgbmusic.json',
      document
    })

    renderEditor()

    expect(await screen.findByRole('heading', { name: 'Battle' })).toBeInTheDocument()
    const speedInput = screen.getByLabelText('Speed')
    const undoButton = screen.getByRole('button', { name: 'Undo' })
    const redoButton = screen.getByRole('button', { name: 'Redo' })

    expect(undoButton).toBeDisabled()
    expect(redoButton).toBeDisabled()

    fireEvent.change(speedInput, { target: { value: '10' } })

    await waitFor(() => expect(undoButton).toBeEnabled())
    expect(speedInput).toHaveValue(10)

    fireEvent.click(undoButton)

    await waitFor(() => expect(speedInput).toHaveValue(document.speed))
    expect(redoButton).toBeEnabled()

    fireEvent.click(redoButton)

    await waitFor(() => expect(speedInput).toHaveValue(10))
  })

  it('creates patterns and instruments, edits notes, and adjusts the sequence', async () => {
    const document = createDefaultProjectAssetDocument('music') as MusicAssetDocument
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'music',
      resourcePath: 'Audio/Battle.rgbmusic.json',
      document
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(
      async (_projectPath, resourcePath, savedDocument) => ({
        assetKind: 'music',
        resourcePath,
        document: savedDocument
      })
    )

    const view = renderEditor()

    expect(await screen.findByRole('heading', { name: 'Battle' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    expect(await screen.findByText('No compatible instrument selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lead Pulse' } })
    clickInstrumentSave()

    await screen.findByRole('button', { name: /Lead Pulse/ })

    fireEvent.change(screen.getByLabelText('Pattern Name'), { target: { value: 'Intro Lead' } })

    const noteColumns = view.container.querySelectorAll('.music-editor__note-column')
    expect(noteColumns.length).toBeGreaterThan(0)

    fireEvent.click(noteColumns[0], { clientY: 0 })
    await screen.findByText('I0')

    fireEvent.contextMenu(screen.getByRole('button', { name: /I0/ }))
    await waitFor(() => {
      expect(screen.queryByText('I0')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sequence' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Bar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bar' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!)

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Audio/Battle.rgbmusic.json',
        expect.objectContaining({
          patterns: [
            expect.objectContaining({
              name: 'Intro Lead'
            })
          ],
          instruments: [
            expect.objectContaining({
              name: 'Lead Pulse'
            })
          ],
          sequence: expect.objectContaining({
            ch1: [null]
          })
        })
      )
    })
  })

  it('switches a pattern to noise, discards an incompatible draft, and then saves a compatible one', async () => {
    const document: MusicAssetDocument = {
      kind: 'music',
      version: 1,
      speed: 8,
      loop: true,
      instruments: [
        {
          name: 'Pulse 0',
          channelType: 'pulse',
          reg1: 0x80,
          reg2: 0xf2,
          reg3: 0x00
        }
      ],
      patterns: [
        {
          id: 'pattern-0',
          name: 'Theme',
          channel: 'ch1',
          steps: createEmptySteps()
        }
      ],
      sequence: {
        ch1: ['pattern-0'],
        ch2: [null],
        ch4: [null]
      }
    }

    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'music',
      resourcePath: 'Audio/Battle.rgbmusic.json',
      document
    })

    renderEditor()

    expect(await screen.findByRole('heading', { name: 'Battle' })).toBeInTheDocument()

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Theme' }))
    fireEvent.change(screen.getByDisplayValue('CH1 Pulse'), {
      target: { value: 'ch4' }
    })

    await screen.findByText('No compatible instrument selected')

    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    expect(await screen.findByRole('heading', { name: 'Instrument' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Noise Draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    await screen.findByText('No compatible instrument selected')

    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Noise Lead' } })
    fireEvent.change(screen.getByDisplayValue('15-bit'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Divider'), { target: { value: '3' } })
    clickInstrumentSave()

    await screen.findByRole('button', { name: /Noise Lead/ })
    expect(screen.queryByText('No compatible instrument selected')).not.toBeInTheDocument()
  })

  it('shows channel compatibility and removes incompatible sequence placements when a pattern changes channel kind', async () => {
    const document: MusicAssetDocument = {
      kind: 'music',
      version: 1,
      speed: 8,
      loop: true,
      instruments: [
        {
          name: 'Pulse 0',
          channelType: 'pulse',
          reg1: 0x80,
          reg2: 0xf2,
          reg3: 0x00
        },
        {
          name: 'Sweep 1',
          channelType: 'pulse',
          sweep: 0x12,
          reg1: 0x80,
          reg2: 0xf2,
          reg3: 0x00
        }
      ],
      patterns: [
        {
          id: 'pattern-0',
          name: 'Theme',
          channel: 'ch1',
          steps: [
            { noteIndex: 60, instrument: 0 },
            ...createEmptySteps().slice(1)
          ]
        }
      ],
      sequence: {
        ch1: ['pattern-0'],
        ch2: ['pattern-0'],
        ch4: [null]
      }
    }

    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'music',
      resourcePath: 'Audio/Battle.rgbmusic.json',
      document
    })
    vi.mocked(window.api.saveProjectAssetFile).mockImplementation(
      async (_projectPath, resourcePath, savedDocument) => ({
        assetKind: 'music',
        resourcePath,
        document: savedDocument
      })
    )

    renderEditor()

    expect(await screen.findByRole('heading', { name: 'Battle' })).toBeInTheDocument()
    fireEvent.doubleClick(screen.getAllByRole('button', { name: /Theme/ })[0]!)

    expect((await screen.findAllByText('CH1/CH2 Pulse')).length).toBeGreaterThan(0)
    expect(screen.getByRole('option', { name: 'CH4 Noise' })).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('CH1 Pulse'), {
      target: { value: 'ch4' }
    })

    expect((await screen.findAllByText('CH4 Noise')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Pulse 0/ })).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!)

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Audio/Battle.rgbmusic.json',
        expect.objectContaining({
          sequence: expect.objectContaining({
            ch1: [null],
            ch2: [null],
            ch4: [null]
          })
        })
      )
    })
  })

  it('moves notes and clips through drag and drop interactions', async () => {
    const document: MusicAssetDocument = {
      kind: 'music',
      version: 1,
      speed: 8,
      loop: true,
      instruments: [
        {
          name: 'Pulse 0',
          channelType: 'pulse',
          reg1: 0x80,
          reg2: 0xf2,
          reg3: 0x00
        }
      ],
      patterns: [
        {
          id: 'pattern-0',
          name: 'Theme',
          channel: 'ch1',
          steps: [
            { noteIndex: 60, instrument: 0 },
            ...createEmptySteps().slice(1)
          ]
        }
      ],
      sequence: {
        ch1: ['pattern-0', null],
        ch2: [null, null],
        ch4: [null, null]
      }
    }

    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'music',
      resourcePath: 'Audio/Battle.rgbmusic.json',
      document
    })

    const view = renderEditor()

    expect(await screen.findByRole('heading', { name: 'Battle' })).toBeInTheDocument()

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Theme' }))

    const noteColumns = view.container.querySelectorAll('.music-editor__note-column')
    const sourceNote = noteColumns[0]?.querySelector('.music-editor__note-block')
    expect(sourceNote).toBeTruthy()

    const noteTransfer = createDataTransfer()
    fireEvent.dragStart(sourceNote!, { dataTransfer: noteTransfer })
    fireEvent.drop(noteColumns[1]!, {
      clientY: 0,
      dataTransfer: noteTransfer
    })

    await waitFor(() => {
      expect(noteColumns[0]?.querySelector('.music-editor__note-block')).toBeNull()
      expect(noteColumns[1]?.querySelector('.music-editor__note-block')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sequence' }))

    const ch1Row = view.container.querySelectorAll('.music-editor__arrangement-row')[0]
    const clipCells = ch1Row?.querySelectorAll('.music-editor__clip-cell')
    const clipButton = clipCells?.[0]?.querySelector('.music-editor__clip')
    expect(clipCells?.length).toBeGreaterThanOrEqual(2)
    expect(clipButton).toBeTruthy()

    const clipTransfer = createDataTransfer()
    fireEvent.dragStart(clipButton!, { dataTransfer: clipTransfer })
    fireEvent.drop(clipCells![1]!, { dataTransfer: clipTransfer })

    await waitFor(() => {
      expect(clipCells?.[0]?.querySelector('.music-editor__clip')).toBeNull()
      expect(clipCells?.[1]?.querySelector('.music-editor__clip')).toBeTruthy()
    })
  })
})
