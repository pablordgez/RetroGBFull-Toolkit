import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  BankResourceModal,
  DeleteResourceModal
} from '../../../src/renderer/src/components/Docking/ResourceManagementModals'

describe('ResourceManagementModals', () => {
  it('renders delete context, warnings, and disabled actions', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    render(
      <DeleteResourceModal
        resource={{
          name: 'Hero',
          resourceType: 'script',
          scriptKind: 'actor',
          warningMessage: 'This script is used by actor assets.'
        }}
        isInteractionDisabled={true}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Delete "Hero"?')).toBeInTheDocument()
    expect(screen.getByText('This will remove everything inside that actor script.')).toBeInTheDocument()
    expect(screen.getByText('This script is used by actor assets.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('confirms delete actions when interaction is enabled', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    render(
      <DeleteResourceModal
        resource={{
          name: 'Sprites',
          resourceType: 'folder'
        }}
        isInteractionDisabled={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('edits, resets, and saves bank overrides', () => {
    const onCancel = vi.fn()
    const onDraftBankChange = vi.fn()
    const onReset = vi.fn()
    const onSave = vi.fn()

    render(
      <BankResourceModal
        resource={{
          name: 'Hero',
          currentBank: 7,
          draftBank: '12'
        }}
        isInteractionDisabled={false}
        onCancel={onCancel}
        onDraftBankChange={onDraftBankChange}
        onReset={onReset}
        onSave={onSave}
      />
    )

    const input = screen.getByLabelText('Bank (0-255)')
    fireEvent.change(input, { target: { value: '23' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset To 255' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(input).toHaveValue(12)
    expect(onDraftBankChange).toHaveBeenCalledWith('23')
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables bank controls while busy and when the bank already uses the default', () => {
    render(
      <BankResourceModal
        resource={{
          name: 'Shared',
          currentBank: 255,
          draftBank: '255'
        }}
        isInteractionDisabled={true}
        onCancel={vi.fn()}
        onDraftBankChange={vi.fn()}
        onReset={vi.fn()}
        onSave={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Bank (0-255)')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset To 255' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
