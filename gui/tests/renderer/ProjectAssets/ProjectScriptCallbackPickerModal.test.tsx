import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectScriptCallbackCandidate } from '../../../src/shared/projectCodeWorkspace'
import { ProjectScriptCallbackPickerModal } from '../../../src/renderer/src/components/ProjectAssets/ProjectScriptCallbackPickerModal'

const callbackCandidates: ProjectScriptCallbackCandidate[] = [
  {
    scriptPath: 'src/CustomActors/Hero.c',
    scriptKind: 'actor',
    scriptName: 'Hero',
    functionName: 'OnHeroCollision'
  },
  {
    scriptPath: 'src/CustomActors/Hero.c',
    scriptKind: 'actor',
    scriptName: 'Hero',
    functionName: 'OnHeroCollision'
  },
  {
    scriptPath: 'src/CustomScenes/Room.c',
    scriptKind: 'scene',
    scriptName: 'Room',
    functionName: 'OnRoomCollision'
  },
  {
    scriptPath: 'src/Scripts/Shared.c',
    scriptKind: 'general',
    scriptName: 'Shared',
    functionName: 'AfterCollision'
  }
]

describe('ProjectScriptCallbackPickerModal', () => {
  it('renders loading, groups callbacks by script, and selects filtered entries', () => {
    const onRefresh = vi.fn()
    const onClose = vi.fn()
    const onSelect = vi.fn()

    const { rerender } = render(
      <ProjectScriptCallbackPickerModal
        title="Add Callback"
        description="Choose a callback."
        candidates={[]}
        isLoading={true}
        errorMessage="Could not load callbacks."
        emptyMessage="No callbacks available."
        onRefresh={onRefresh}
        onClose={onClose}
        onSelect={onSelect}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Could not load callbacks.')).toBeInTheDocument()
    expect(screen.getByText('Loading callbacks...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()

    rerender(
      <ProjectScriptCallbackPickerModal
        title="Add Callback"
        description="Choose a callback."
        candidates={callbackCandidates}
        emptyMessage="No callbacks available."
        onRefresh={onRefresh}
        onClose={onClose}
        onSelect={onSelect}
      />
    )

    fireEvent.change(screen.getByLabelText('Search callbacks'), {
      target: { value: 'actor script' }
    })

    const dialog = screen.getByRole('dialog')
    const heroGroup = within(dialog).getByRole('button', { name: /Hero/i })
    expect(heroGroup).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(heroGroup)

    expect(heroGroup).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByRole('button', { name: /OnHeroCollision/i })).toBeInTheDocument()
    expect(within(dialog).queryAllByRole('button', { name: /OnHeroCollision/i })).toHaveLength(1)

    fireEvent.click(within(dialog).getByRole('button', { name: /OnHeroCollision/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSelect).toHaveBeenCalledWith(callbackCandidates[0])
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows empty and no-match states and hides refresh when not provided', () => {
    const { rerender } = render(
      <ProjectScriptCallbackPickerModal
        title="Add Callback"
        description="Choose a callback."
        candidates={[]}
        emptyMessage="No callbacks are available yet."
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('No callbacks are available yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()

    rerender(
      <ProjectScriptCallbackPickerModal
        title="Add Callback"
        description="Choose a callback."
        candidates={callbackCandidates}
        emptyMessage="No callbacks are available yet."
        isBusy={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    const searchInput = screen.getByLabelText('Search callbacks')
    expect(searchInput).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    rerender(
      <ProjectScriptCallbackPickerModal
        title="Add Callback"
        description="Choose a callback."
        candidates={callbackCandidates}
        emptyMessage="No callbacks are available yet."
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Search callbacks'), {
      target: { value: 'missing-callback' }
    })

    expect(screen.getByText('No callbacks match the current search.')).toBeInTheDocument()
  })
})
