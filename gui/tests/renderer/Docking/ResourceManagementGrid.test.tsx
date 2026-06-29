import React, { createRef } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectResourceItem } from '../../../src/shared/projectResourceModels'

const gridItemProps = vi.hoisted(() => [] as unknown[])

vi.mock('../../../src/renderer/src/components/Docking/ResourceManagementGridItem', () => ({
  ResourceManagementGridItem: (props: unknown) => {
    gridItemProps.push(props)
    return <div data-testid="grid-item" />
  }
}))

import { ResourceManagementGrid } from '../../../src/renderer/src/components/Docking/ResourceManagementGrid'

const sceneResource: ProjectResourceItem = {
  type: 'file',
  id: 'scene',
  name: 'Intro',
  fileName: 'Intro.rgbscene.json',
  path: 'Scenes/Intro.rgbscene.json',
  parentPath: 'Scenes',
  extension: 'json',
  resourceType: 'scene',
  bank: null
}

const spriteResource: ProjectResourceItem = {
  type: 'file',
  id: 'sprite',
  name: 'Hero',
  fileName: 'Hero.rgbsprite.json',
  path: 'Sprites/Hero.rgbsprite.json',
  parentPath: 'Sprites',
  extension: 'json',
  resourceType: 'sprite',
  bank: 9
}

const folderResource: ProjectResourceItem = {
  type: 'folder',
  id: 'folder',
  name: 'Sprites',
  path: 'Sprites',
  parentPath: null
}

const unmanagedResource: ProjectResourceItem = {
  type: 'file',
  id: 'misc',
  name: 'readme.txt',
  fileName: 'readme.txt',
  path: 'readme.txt',
  parentPath: null,
  extension: 'txt',
  resourceType: null,
  bank: null
}

const defaultProps = () => ({
  editingResource: null,
  clipboardResource: null,
  selectedResourcePath: null,
  isInteractionDisabled: false,
  canPasteClipboardResourceTo: vi.fn(() => true),
  renameInputRef: createRef<HTMLInputElement>(),
  shortcutLabels: { copy: 'Ctrl+C', cut: 'Ctrl+X', paste: 'Ctrl+V' },
  startingScenePath: null,
  onSelectResource: vi.fn(),
  onOpenResource: vi.fn(),
  onCommitRename: vi.fn(),
  onCancelRename: vi.fn(),
  onDraftNameChange: vi.fn(),
  onPlaceClipboardResource: vi.fn(),
  onPasteClipboardResource: vi.fn(),
  onShowResourceInFileExplorer: vi.fn(),
  onSetStartingScene: vi.fn(),
  onBeginResourceEditing: vi.fn(),
  onRequestDeleteResource: vi.fn(),
  onRequestBankResource: vi.fn(),
  onOpenParentDirectory: vi.fn()
})

describe('ResourceManagementGrid', () => {
  it('constructs per-resource item props and context actions', () => {
    gridItemProps.splice(0)
    const props = defaultProps()
    render(
      <ResourceManagementGrid
        {...props}
        resources={[sceneResource, spriteResource, folderResource, unmanagedResource]}
        editingResource={{ path: spriteResource.path, draftName: 'Hero Draft' }}
        clipboardResource={{ operation: 'cut', resourcePath: spriteResource.path, resourceType: 'sprite' }}
        selectedResourcePath={sceneResource.path}
        startingScenePath={sceneResource.path}
      />
    )

    const [sceneProps, spriteProps, folderProps, unmanagedProps] = gridItemProps as Array<{
      resource: ProjectResourceItem
      menuOptions?: Array<{ label: string; disabled?: boolean; onSelect: () => void }>
      isEditing: boolean
      isPendingCut: boolean
      isSelected: boolean
      editingDraftName: string
      onCommitRename: () => void
      onCancelRename: () => void
      onDraftNameChange: (value: string) => void
    }>

    expect(sceneProps.isSelected).toBe(true)
    expect(spriteProps.isEditing).toBe(true)
    expect(spriteProps.isPendingCut).toBe(true)
    expect(spriteProps.editingDraftName).toBe('Hero Draft')
    expect(folderProps.menuOptions?.map((option) => option.label)).toContain('Paste')
    expect(unmanagedProps.menuOptions).toBeUndefined()

    sceneProps.menuOptions?.find((option) => option.label === 'Clear Starting Scene')?.onSelect()
    expect(props.onSetStartingScene).toHaveBeenCalledWith(null, sceneResource.name)

    spriteProps.menuOptions?.find((option) => option.label === 'Bank...')?.onSelect()
    expect(props.onRequestBankResource).toHaveBeenCalledWith({
      path: spriteResource.path,
      name: spriteResource.name,
      resourceType: 'sprite',
      currentBank: 9,
      draftBank: '9'
    })

    spriteProps.menuOptions?.find((option) => option.label === 'Copy')?.onSelect()
    spriteProps.menuOptions?.find((option) => option.label === 'Cut')?.onSelect()
    folderProps.menuOptions?.find((option) => option.label === 'Paste')?.onSelect()
    spriteProps.menuOptions?.find((option) => option.label === 'Show In File Explorer')?.onSelect()
    spriteProps.menuOptions?.find((option) => option.label === 'Rename')?.onSelect()
    spriteProps.menuOptions?.find((option) => option.label === 'Delete')?.onSelect()
    spriteProps.onCommitRename()
    spriteProps.onCancelRename()
    spriteProps.onDraftNameChange('Next')

    expect(props.onPlaceClipboardResource).toHaveBeenNthCalledWith(1, spriteResource, 'copy')
    expect(props.onPlaceClipboardResource).toHaveBeenNthCalledWith(2, spriteResource, 'cut')
    expect(props.onPasteClipboardResource).toHaveBeenCalledWith(folderResource.path)
    expect(props.onShowResourceInFileExplorer).toHaveBeenCalledWith(spriteResource)
    expect(props.onBeginResourceEditing).toHaveBeenCalledWith(
      spriteResource.path,
      spriteResource.name,
      'sprite',
      null
    )
    expect(props.onRequestDeleteResource).toHaveBeenCalledWith({
      path: spriteResource.path,
      name: spriteResource.name,
      resourceType: 'sprite',
      scriptKind: null,
      warningMessage: null
    })
    expect(props.onCommitRename).toHaveBeenCalledWith(spriteResource.path)
    expect(props.onCancelRename).toHaveBeenCalled()
    expect(props.onDraftNameChange).toHaveBeenCalledWith(spriteResource.path, 'Next')
  })

  it('disables interaction options and sets starting scene for non-current scenes', () => {
    gridItemProps.splice(0)
    const props = defaultProps()
    props.canPasteClipboardResourceTo.mockReturnValue(false)
    render(
      <ResourceManagementGrid
        {...props}
        resources={[sceneResource, spriteResource]}
        isInteractionDisabled
        startingScenePath={null}
      />
    )

    const [sceneProps, spriteProps] = gridItemProps as Array<{
      menuOptions?: Array<{ label: string; disabled?: boolean; onSelect: () => void }>
      onCancelRename: () => void
    }>
    expect(sceneProps.menuOptions?.find((option) => option.label === 'Copy')?.disabled).toBe(true)
    sceneProps.menuOptions?.find((option) => option.label === 'Set As Starting Scene')?.onSelect()
    expect(props.onSetStartingScene).toHaveBeenCalledWith(sceneResource.path, sceneResource.name)

    spriteProps.menuOptions?.find((option) => option.label === 'Bank...')?.onSelect()
    expect(props.onRequestBankResource).toHaveBeenCalledWith(
      expect.objectContaining({ currentBank: 9, draftBank: '9' })
    )
  })
})
