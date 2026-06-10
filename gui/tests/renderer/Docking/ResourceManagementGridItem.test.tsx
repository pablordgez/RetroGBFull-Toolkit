import React, { createRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PROJECT_ASSET_DRAG_MIME } from '../../../src/renderer/src/components/ProjectAssets/projectAssetDrag'
import { ResourceManagementGridItem } from '../../../src/renderer/src/components/Docking/ResourceManagementGridItem'
import type { ProjectResourceItem } from '../../../src/shared/projectResourceModels'

const sceneResource: ProjectResourceItem = {
  type: 'file',
  id: 'scene-1',
  name: 'Intro',
  fileName: 'Intro.rgbscene.json',
  path: 'assets/scenes/Intro.rgbscene.json',
  parentPath: 'assets/scenes',
  extension: 'json',
  resourceType: 'scene'
}

describe('<ResourceManagementGridItem />', () => {
  it('renders unmanaged files without interactive controls', () => {
    render(
      <ResourceManagementGridItem
        editingDraftName=""
        isEditing={false}
        isInteractionDisabled={false}
        isPendingCut={false}
        isSelected={false}
        onCancelRename={() => undefined}
        onCommitRename={() => undefined}
        onDraftNameChange={() => undefined}
        onOpen={() => undefined}
        onSelect={() => undefined}
        renameInputRef={createRef<HTMLInputElement>()}
        resource={{
          type: 'file',
          id: 'misc-1',
          name: 'misc.bin',
          fileName: 'misc.bin',
          path: 'misc.bin',
          parentPath: null,
          extension: 'bin',
          resourceType: null
        }}
        startingScenePath={null}
      />
    )

    expect(screen.getByText('misc.bin')).toBeInTheDocument()
    expect(screen.getAllByText('BIN')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'misc.bin' })).not.toBeInTheDocument()
  })

  it('supports inline scene renaming and cancel/save interactions', async () => {
    const onCancelRename = vi.fn()
    const onCommitRename = vi.fn()
    const onDraftNameChange = vi.fn()
    const onSelect = vi.fn()

    render(
      <ResourceManagementGridItem
        editingDraftName="Intro"
        isEditing
        isInteractionDisabled={false}
        isPendingCut
        isSelected
        menuOptions={[{ label: 'Rename' }]}
        onCancelRename={onCancelRename}
        onCommitRename={onCommitRename}
        onDraftNameChange={onDraftNameChange}
        onOpen={() => undefined}
        onSelect={onSelect}
        renameInputRef={createRef<HTMLInputElement>()}
        resource={sceneResource}
        startingScenePath={sceneResource.path}
      />
    )

    const input = screen.getByLabelText('Scene name for Intro')
    expect(screen.getByText('START')).toBeInTheDocument()

    fireEvent.contextMenu(input)
    expect(onSelect).toHaveBeenCalledWith(sceneResource.path)

    fireEvent.change(input, { target: { value: 'Updated Intro' } })
    expect(onDraftNameChange).toHaveBeenCalledWith('Updated Intro')

    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(onCommitRename).toHaveBeenCalledTimes(2)
    })

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCancelRename).toHaveBeenCalledTimes(1)
  })

  it('opens tracked assets and writes drag payloads for draggable resource kinds', () => {
    const onOpen = vi.fn()
    const onSelect = vi.fn()

    render(
      <ResourceManagementGridItem
        editingDraftName=""
        isEditing={false}
        isInteractionDisabled={false}
        isPendingCut={false}
        isSelected={false}
        menuOptions={[{ label: 'Open' }]}
        onCancelRename={() => undefined}
        onCommitRename={() => undefined}
        onDraftNameChange={() => undefined}
        onOpen={onOpen}
        onSelect={onSelect}
        renameInputRef={createRef<HTMLInputElement>()}
        resource={{
          type: 'file',
          id: 'tilemap-1',
          name: 'Intro Map',
          fileName: 'Intro.rgbtilemap.json',
          path: 'assets/tilemaps/Intro.rgbtilemap.json',
          parentPath: 'assets/tilemaps',
          extension: 'json',
          resourceType: 'tilemap'
        }}
        startingScenePath={null}
      />
    )

    const button = screen.getByText('Intro Map').closest('button')
    expect(button).toBeTruthy()
    expect(button).toHaveAttribute('draggable', 'true')

    fireEvent.click(button!)
    fireEvent.contextMenu(button!)
    fireEvent.doubleClick(button!)

    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'assets/tilemaps/Intro.rgbtilemap.json' })
    )

    const store = new Map<string, string>()
    fireEvent.dragStart(button!, {
      dataTransfer: {
        effectAllowed: 'none',
        setData: (type: string, value: string) => store.set(type, value)
      }
    })

    expect(onSelect).toHaveBeenCalledWith('assets/tilemaps/Intro.rgbtilemap.json')
    expect(store.get('text/plain')).toBe('assets/tilemaps/Intro.rgbtilemap.json')
    expect(store.get(PROJECT_ASSET_DRAG_MIME)).toContain('"kind":"tilemap"')
  })

  it('disables interaction when requested and does not mark non-draggable files as draggable', () => {
    render(
      <ResourceManagementGridItem
        editingDraftName=""
        isEditing={false}
        isInteractionDisabled
        isPendingCut={false}
        isSelected={false}
        menuOptions={[{ label: 'Open' }]}
        onCancelRename={() => undefined}
        onCommitRename={() => undefined}
        onDraftNameChange={() => undefined}
        onOpen={() => undefined}
        onSelect={() => undefined}
        renameInputRef={createRef<HTMLInputElement>()}
        resource={{
          type: 'file',
          id: 'sprite-1',
          name: 'Hero Sprite',
          fileName: 'Hero.rgbsprite.json',
          path: 'assets/sprites/Hero.rgbsprite.json',
          parentPath: 'assets/sprites',
          extension: 'json',
          resourceType: 'sprite'
        }}
        startingScenePath={null}
      />
    )

    const button = screen.getByText('Hero Sprite').closest('button')
    expect(button).toBeTruthy()
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('draggable', 'false')
  })
})
