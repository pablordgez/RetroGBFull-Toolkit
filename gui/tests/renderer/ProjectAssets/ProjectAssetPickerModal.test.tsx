import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectAssetPickerModal } from '../../../src/renderer/src/components/ProjectAssets/ProjectAssetPickerModal'

describe('ProjectAssetPickerModal', () => {
  it('renders loading, error, and selection states', () => {
    const onRefresh = vi.fn()
    const onClose = vi.fn()
    const onSelectNone = vi.fn()
    const onSelect = vi.fn()

    const { rerender } = render(
      <ProjectAssetPickerModal
        title="Load Tilemap"
        description="Choose a tilemap."
        options={[]}
        isLoading={true}
        errorMessage="Could not load assets."
        emptyMessage="No assets found."
        noneLabel="No Tilemap"
        onRefresh={onRefresh}
        onClose={onClose}
        onSelectNone={onSelectNone}
        onSelect={onSelect}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Could not load assets.')).toBeInTheDocument()
    expect(screen.getByText('Loading assets...')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /No Tilemap/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()

    rerender(
      <ProjectAssetPickerModal
        title="Load Tilemap"
        description="Choose a tilemap."
        options={[
          {
            kind: 'tilemap',
            name: 'Room',
            path: 'Maps/Room.rgbtilemap.json'
          }
        ]}
        isLoading={false}
        emptyMessage="No assets found."
        noneLabel="No Tilemap"
        onRefresh={onRefresh}
        onClose={onClose}
        onSelectNone={onSelectNone}
        onSelect={onSelect}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /No Tilemap/i }))
    fireEvent.click(screen.getByRole('button', { name: /Room/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSelectNone).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith({
      kind: 'tilemap',
      name: 'Room',
      path: 'Maps/Room.rgbtilemap.json'
    })
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders the empty state and disables actions while busy', () => {
    render(
      <ProjectAssetPickerModal
        title="Select Sprite"
        description="Choose a sprite."
        options={[]}
        isLoading={false}
        emptyMessage="No sprites were found in this project yet."
        isBusy={true}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('No sprites were found in this project yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /None/i })).not.toBeInTheDocument()
  })
})
