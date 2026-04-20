import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SaveDataEditor } from '../../../src/renderer/src/components/SaveDataEditor/SaveDataEditor'

const renderSaveDataEditor = (entry: string) => {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/save-data-editor" element={<SaveDataEditor />} />
      </Routes>
    </MemoryRouter>
  )
}

const getInputsBySelector = (selector: string): HTMLInputElement[] => {
  return Array.from(document.querySelectorAll(selector)) as HTMLInputElement[]
}

describe('<SaveDataEditor />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.api.onEditorCloseRequested).mockImplementation(() => () => undefined)
    vi.mocked(window.api.confirmEditorClose).mockResolvedValue(true)
    vi.mocked(window.api.loadProjectSaveData).mockResolvedValue({
      entries: [
        {
          id: 'coins',
          name: 'coins',
          type: 'uint8_t',
          defaultValue: '0'
        }
      ]
    })
    vi.mocked(window.api.saveProjectSaveData).mockResolvedValue({
      entries: [
        {
          id: 'coins',
          name: 'coins',
          type: 'uint8_t',
          defaultValue: '1'
        }
      ]
    })
  })

  it('shows an error when opened without a project path', async () => {
    renderSaveDataEditor('/save-data-editor')

    expect(await screen.findByText('This window was opened without a project path.')).toBeInTheDocument()
    expect(window.api.loadProjectSaveData).not.toHaveBeenCalled()
  })

  it('surfaces load failures from the project save-data API', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(window.api.loadProjectSaveData).mockRejectedValue(new Error('Load failed'))

    renderSaveDataEditor('/save-data-editor?projectPath=%2Fprojects%2FAlpha')

    expect(await screen.findByText('Load failed')).toBeInTheDocument()

    consoleErrorSpy.mockRestore()
  })

  it('loads existing save-data entries and validates before saving', async () => {
    renderSaveDataEditor('/save-data-editor?projectPath=%2Fprojects%2FAlpha')

    await waitFor(() => {
      expect(window.api.loadProjectSaveData).toHaveBeenCalledWith('/projects/Alpha')
    })

    const defaultValueInput = await screen.findByDisplayValue('0')
    fireEvent.change(defaultValueInput, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))

    expect(window.api.saveProjectSaveData).not.toHaveBeenCalled()
    expect((await screen.findAllByText('Default value is required.')).length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText(/Default Value/i), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))

    await waitFor(() => {
      expect(window.api.saveProjectSaveData).toHaveBeenCalledWith('/projects/Alpha', {
        entries: [
          {
            id: 'coins',
            name: 'coins',
            type: 'uint8_t',
            defaultValue: '1'
          }
        ]
      })
    })
  })

  it('adds, reorders, updates, and removes save-data entries', async () => {
    vi.mocked(window.api.loadProjectSaveData).mockResolvedValue({ entries: [] })

    renderSaveDataEditor('/save-data-editor?projectPath=%2Fprojects%2FAlpha')

    expect(await screen.findByText('No save-data entries yet.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }))

    const typeInputs = getInputsBySelector('.save-data-editor__field--type input')
    const nameInputs = getInputsBySelector('.save-data-editor__field--name input')

    fireEvent.change(typeInputs[0], { target: { value: 'uint16_t' } })
    fireEvent.change(nameInputs[0], { target: { value: 'coins' } })
    fireEvent.change(nameInputs[1], { target: { value: 'lives' } })

    expect(screen.getByText('All rows are structurally valid.')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Down' })[0])
    expect(getInputsBySelector('.save-data-editor__field--name input').map((input) => input.value)).toEqual([
      'lives',
      'coins'
    ])

    fireEvent.click(screen.getAllByRole('button', { name: 'Up' })[1])
    expect(getInputsBySelector('.save-data-editor__field--name input').map((input) => input.value)).toEqual([
      'coins',
      'lives'
    ])

    fireEvent.change(getInputsBySelector('.save-data-editor__field--name input')[1], {
      target: { value: 'coins' }
    })
    expect(await screen.findByText('2 issues need attention.')).toBeInTheDocument()
    expect(screen.getAllByText('Each save-data name must be unique.')).toHaveLength(4)

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    await waitFor(() => {
      const remainingNameInputs = getInputsBySelector('.save-data-editor__field--name input')
      expect(remainingNameInputs).toHaveLength(1)
      expect(remainingNameInputs[0].value).toBe('coins')
    })
  })

  it('handles clean and dirty close requests, including failed saves and discard', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let closeListener: (() => void) | undefined

    vi.mocked(window.api.onEditorCloseRequested).mockImplementation((listener) => {
      closeListener = listener
      return () => undefined
    })
    vi.mocked(window.api.saveProjectSaveData).mockRejectedValueOnce(new Error('Save failed'))

    renderSaveDataEditor('/save-data-editor?projectPath=%2Fprojects%2FAlpha')

    await screen.findByDisplayValue('0')

    await act(async () => {
      closeListener?.()
    })
    await waitFor(() => {
      expect(window.api.confirmEditorClose).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByLabelText(/Default Value/i), { target: { value: '9' } })

    await act(async () => {
      closeListener?.()
    })
    const cancelDialog = await screen.findByRole('dialog')
    fireEvent.click(within(cancelDialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(window.api.confirmEditorClose).toHaveBeenCalledTimes(1)

    await act(async () => {
      closeListener?.()
    })
    const saveDialog = await screen.findByRole('dialog')
    fireEvent.click(within(saveDialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Save failed')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(window.api.confirmEditorClose).toHaveBeenCalledTimes(1)

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: "Don't Save" }))
    await waitFor(() => {
      expect(window.api.confirmEditorClose).toHaveBeenCalledTimes(2)
    })

    consoleErrorSpy.mockRestore()
  })
})
