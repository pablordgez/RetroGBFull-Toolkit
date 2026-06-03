import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TagEditor } from '../../../src/renderer/src/components/TagEditor/TagEditor'

const renderTagEditor = (entry: string) => {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/tag-editor" element={<TagEditor />} />
      </Routes>
    </MemoryRouter>
  )
}

const getNameInputs = (): HTMLInputElement[] => {
  return Array.from(
    document.querySelectorAll('.save-data-editor__field--name input')
  ) as HTMLInputElement[]
}

describe('<TagEditor />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.api.onEditorCloseRequested).mockImplementation(() => () => undefined)
    vi.mocked(window.api.confirmEditorClose).mockResolvedValue(true)
    vi.mocked(window.api.loadProjectTags).mockResolvedValue({
      entries: [{ id: 'hero', name: 'Hero' }]
    })
    vi.mocked(window.api.saveProjectTags).mockResolvedValue({
      entries: [{ id: 'hero', name: 'Player One' }]
    })
  })

  it('shows an error when opened without a project path', async () => {
    renderTagEditor('/tag-editor')

    expect(await screen.findByText('This window was opened without a project path.')).toBeInTheDocument()
    expect(window.api.loadProjectTags).not.toHaveBeenCalled()
  })

  it('loads tags, validates them, and saves after issues are fixed', async () => {
    renderTagEditor('/tag-editor?projectPath=%2Fprojects%2FAlpha')

    await waitFor(() => {
      expect(window.api.loadProjectTags).toHaveBeenCalledWith('/projects/Alpha')
    })

    expect(await screen.findByDisplayValue('Hero')).toBeInTheDocument()
    expect(screen.getByDisplayValue('TAG_HERO')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('Hero'), { target: { value: 'none' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))

    expect(window.api.saveProjectTags).not.toHaveBeenCalled()
    expect((await screen.findAllByText('"TAG_NONE" is reserved by the engine.')).length).toBeGreaterThan(0)

    fireEvent.change(screen.getByDisplayValue('none'), { target: { value: 'Player One' } })
    expect(screen.getByDisplayValue('TAG_PLAYER_ONE')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save*' }))

    await waitFor(() => {
      expect(window.api.saveProjectTags).toHaveBeenCalledWith('/projects/Alpha', {
        entries: [{ id: 'hero', name: 'Player One' }]
      })
    })

    expect(await screen.findByText('Saved 1 tag.')).toBeInTheDocument()
  })

  it('adds, reorders, deduplicates, and removes tag entries', async () => {
    vi.mocked(window.api.loadProjectTags).mockResolvedValue({ entries: [] })

    renderTagEditor('/tag-editor?projectPath=%2Fprojects%2FAlpha')

    expect(await screen.findByText('No tags yet.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add Tag' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Tag' }))

    const nameInputs = getNameInputs()
    fireEvent.change(nameInputs[0], { target: { value: 'Player' } })
    fireEvent.change(nameInputs[1], { target: { value: 'Enemy' } })

    expect(screen.getByText('Valid.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('TAG_PLAYER')).toBeInTheDocument()
    expect(screen.getByDisplayValue('TAG_ENEMY')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Down' })[0])
    expect(getNameInputs().map((input) => input.value)).toEqual(['Enemy', 'Player'])

    fireEvent.click(screen.getAllByRole('button', { name: 'Up' })[1])
    expect(getNameInputs().map((input) => input.value)).toEqual(['Player', 'Enemy'])

    fireEvent.change(getNameInputs()[1], { target: { value: 'Player' } })
    expect(await screen.findByText('2 issues need attention.')).toBeInTheDocument()
    expect(screen.getAllByText('Each tag must generate a unique C enum name.')).toHaveLength(4)

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])

    await waitFor(() => {
      const remainingInputs = getNameInputs()
      expect(remainingInputs).toHaveLength(1)
      expect(remainingInputs[0].value).toBe('Player')
    })
  })

  it('surfaces load failures from the tag API', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(window.api.loadProjectTags).mockRejectedValueOnce(new Error('Load failed'))

    renderTagEditor('/tag-editor?projectPath=%2Fprojects%2FBroken')
    expect(await screen.findByText('Load failed')).toBeInTheDocument()

    consoleErrorSpy.mockRestore()
  })

  it('handles close requests for cancel, save failure, save, and discard', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let closeListener: (() => void) | undefined
    vi.mocked(window.api.onEditorCloseRequested).mockImplementation((listener) => {
      closeListener = listener
      return () => undefined
    })
    vi.mocked(window.api.loadProjectTags).mockResolvedValue({
      entries: [{ id: 'hero', name: 'Hero' }]
    })
    vi.mocked(window.api.saveProjectTags).mockRejectedValueOnce(new Error('Save failed'))

    renderTagEditor('/tag-editor?projectPath=%2Fprojects%2FAlpha')
    await screen.findByDisplayValue('Hero')

    await act(async () => {
      closeListener?.()
    })
    await waitFor(() => {
      expect(window.api.confirmEditorClose).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByDisplayValue('Hero'), { target: { value: 'Rival' } })
    fireEvent.keyDown(window, { ctrlKey: true, key: 's' })
    expect(await screen.findByText('Save failed')).toBeInTheDocument()

    await act(async () => {
      closeListener?.()
    })
    const cancelDialog = await screen.findByRole('dialog')
    fireEvent.click(within(cancelDialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    await act(async () => {
      closeListener?.()
    })
    const saveDialog = await screen.findByRole('dialog')
    fireEvent.click(within(saveDialog).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved 1 tag.')).toBeInTheDocument()
    await waitFor(() => {
      expect(window.api.confirmEditorClose).toHaveBeenCalledTimes(2)
    })

    fireEvent.change(screen.getByDisplayValue('Player One'), { target: { value: 'Mage' } })
    await act(async () => {
      closeListener?.()
    })
    const discardDialog = await screen.findByRole('dialog')
    fireEvent.click(within(discardDialog).getByRole('button', { name: "Don't Save" }))
    await waitFor(() => {
      expect(window.api.confirmEditorClose).toHaveBeenCalledTimes(3)
    })

    consoleErrorSpy.mockRestore()
  })
})
