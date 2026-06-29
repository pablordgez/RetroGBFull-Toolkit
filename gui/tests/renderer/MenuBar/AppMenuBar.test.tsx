import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppMenuBar } from '../../../src/renderer/src/components/MenuBar/AppMenuBar'

describe('AppMenuBar', () => {
  it('opens menus, invokes actions, and closes on outside interactions', () => {
    const onFileOpen = vi.fn()
    const onEditOpen = vi.fn()
    const onNewSprite = vi.fn()

    const { container } = render(
      <React.Fragment>
        <AppMenuBar
          className="main-menu"
          menus={[
            {
              id: 'file',
              label: 'File',
              onOpen: onFileOpen,
              items: [
                {
                  label: 'New',
                  children: [
                    { id: 'sprite', label: 'Sprite', onSelect: onNewSprite },
                    { id: 'scene', label: 'Scene', disabled: true, onSelect: vi.fn() }
                  ]
                },
                { label: 'Disabled', disabled: true, onSelect: vi.fn() }
              ]
            },
            {
              id: 'edit',
              label: 'Edit',
              onOpen: onEditOpen,
              items: [{ label: 'Undo', onSelect: vi.fn() }]
            }
          ]}
        />
      </React.Fragment>
    )

    expect(container.firstElementChild).toHaveClass('main-menu')
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    expect(onFileOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('menuitem', { name: 'File' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'New' })).toHaveAttribute('aria-haspopup', 'menu')
    expect(screen.getByRole('menuitem', { name: 'Scene' })).toBeDisabled()

    fireEvent.click(screen.getByRole('menuitem', { name: 'New' }))
    expect(onNewSprite).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sprite' }))
    expect(onNewSprite).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menuitem', { name: 'Sprite' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Edit' }).parentElement!)
    expect(onEditOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menuitem', { name: 'Undo' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menuitem', { name: 'Sprite' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    fireEvent.blur(window)
    expect(screen.queryByRole('menuitem', { name: 'Sprite' })).not.toBeInTheDocument()
  })

  it('does not open disabled top-level menus and toggles active menus closed', () => {
    render(
      <React.Fragment>
        <AppMenuBar
          menus={[
            { label: 'File', items: [{ label: 'Open', onSelect: vi.fn() }] },
            { label: 'Build', disabled: true, items: [{ label: 'Run', onSelect: vi.fn() }] }
          ]}
        />
      </React.Fragment>
    )

    fireEvent.click(screen.getByRole('menuitem', { name: 'Build' }))
    expect(screen.queryByRole('menuitem', { name: 'Run' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    expect(screen.queryByRole('menuitem', { name: 'Open' })).not.toBeInTheDocument()
  })

  it('renders checkbox menu items and keeps them open when requested', () => {
    const onToggle = vi.fn()

    const { rerender } = render(
      <React.Fragment>
        <AppMenuBar
          menus={[
            {
              label: 'Preferences',
              items: [
                {
                  label: 'Display GUI pixel coordinates',
                  checked: true,
                  closeOnSelect: false,
                  onSelect: onToggle
                }
              ]
            }
          ]}
        />
      </React.Fragment>
    )

    fireEvent.click(screen.getByRole('menuitem', { name: 'Preferences' }))

    const checkboxItem = screen.getByRole('menuitemcheckbox', {
      name: 'Display GUI pixel coordinates'
    })
    expect(checkboxItem).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(checkboxItem)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Display GUI pixel coordinates' })
    ).toBeInTheDocument()

    rerender(
      <React.Fragment>
        <AppMenuBar
          menus={[
            {
              label: 'Preferences',
              items: [
                {
                  label: 'Display GUI pixel coordinates',
                  checked: false,
                  closeOnSelect: false,
                  onSelect: onToggle
                }
              ]
            }
          ]}
        />
      </React.Fragment>
    )

    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Display GUI pixel coordinates' })
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('renders right-aligned action buttons and closes open menus before invoking them', () => {
    const onAction = vi.fn()

    render(
      <React.Fragment>
        <AppMenuBar
          menus={[
            {
              label: 'File',
              items: [{ label: 'Open', onSelect: vi.fn() }]
            }
          ]}
          actions={[
            {
              id: 'docs',
              label: 'Docs',
              ariaLabel: 'Open documentation in browser',
              onSelect: onAction
            }
          ]}
        />
      </React.Fragment>
    )

    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Open documentation in browser' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menuitem', { name: 'Open' })).not.toBeInTheDocument()
  })
})
