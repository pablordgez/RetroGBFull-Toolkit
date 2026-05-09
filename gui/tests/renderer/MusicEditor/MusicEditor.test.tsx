import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MusicEditor } from '../../../src/renderer/src/components/MusicEditor/MusicEditor'
import { createDefaultProjectAssetDocument, type MusicAssetDocument } from '../../../src/shared/projectAssets'

const renderEditor = () => {
  return render(
    <MemoryRouter
      initialEntries={[
        '/music-editor?projectPath=/projects/Alpha&assetPath=Audio/Battle.rgbmusic.json'
      ]}
    >
      <Routes>
        <Route path="/music-editor" element={<MusicEditor />} />
      </Routes>
    </MemoryRouter>
  )
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
})
