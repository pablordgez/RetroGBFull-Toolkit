import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectScriptPickerModal } from '../../../src/renderer/src/components/ProjectAssets/ProjectScriptPickerModal'

const scriptOptions = [
  {
    kind: 'general' as const,
    name: 'Shared',
    path: 'src/Scripts/Shared.c'
  },
  {
    kind: 'actor' as const,
    name: 'Hero',
    path: 'src/CustomActors/Hero.c'
  }
]

describe('ProjectScriptPickerModal', () => {
  it('renders loading, errors, filtering, and selection actions', () => {
    const onRefresh = vi.fn()
    const onClose = vi.fn()
    const onSelectNone = vi.fn()
    const onSelect = vi.fn()

    const { rerender } = render(
      <ProjectScriptPickerModal
        title="Select Actor Script"
        description="Choose a script for this actor."
        options={[]}
        isLoading={true}
        errorMessage="Could not load scripts."
        emptyMessage="No scripts were found."
        noneLabel="No Script"
        onRefresh={onRefresh}
        onClose={onClose}
        onSelectNone={onSelectNone}
        onSelect={onSelect}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Could not load scripts.')).toBeInTheDocument()
    expect(screen.getByText('Loading scripts...')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /No Script/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()

    rerender(
      <ProjectScriptPickerModal
        title="Select Actor Script"
        description="Choose a script for this actor."
        options={scriptOptions}
        isLoading={false}
        emptyMessage="No scripts were found."
        noneLabel="No Script"
        onRefresh={onRefresh}
        onClose={onClose}
        onSelectNone={onSelectNone}
        onSelect={onSelect}
      />
    )

    fireEvent.change(screen.getByLabelText('Search scripts'), {
      target: { value: 'customactors' }
    })

    expect(screen.getByRole('button', { name: /Hero/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Shared/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /No Script/i }))
    fireEvent.click(screen.getByRole('button', { name: /Hero/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSelectNone).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(scriptOptions[1])
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows empty and no-match states while disabling actions when busy', () => {
    const { rerender } = render(
      <ProjectScriptPickerModal
        title="Select Script"
        description="Choose a script."
        options={[]}
        isLoading={false}
        emptyMessage="No scripts exist yet."
        isBusy={true}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('No scripts exist yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /None/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    rerender(
      <ProjectScriptPickerModal
        title="Select Script"
        description="Choose a script."
        options={scriptOptions}
        isLoading={false}
        emptyMessage="No scripts exist yet."
        onRefresh={vi.fn()}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Search scripts'), {
      target: { value: 'missing-function' }
    })

    expect(screen.getByText('No scripts match the current search.')).toBeInTheDocument()
  })
})
