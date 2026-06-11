import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SceneAssetDocument } from '../../../src/shared/projectAssets'
import { SceneHierarchyPane } from '../../../src/renderer/src/components/SceneHierarchy/SceneHierarchyPane'
import { useSceneDocumentEditor } from '../../../src/renderer/src/components/SceneHierarchy/useSceneDocumentEditor'

const createScene = (): SceneAssetDocument => ({
  kind: 'scene',
  version: 1,
  tilemapPath: 'Maps/Room.rgbtilemap.json',
  windowPath: 'Windows/HUD.rgbwindow.json',
  nodes: [
    {
      id: 'hero-node',
      type: 'actor',
      name: 'Hero',
      isCollapsed: false,
      spritePath: null,
      x: 0,
      y: 0,
      followCamera: true,
      children: []
    },
    {
      id: 'folder-node',
      type: 'folder',
      name: 'Folder',
      isCollapsed: false,
      children: []
    }
  ]
})

const renderPane = () => {
  const onSave = vi.fn()
  const onRequestActorLoad = vi.fn()
  const onSaveActorResource = vi.fn()

  const Harness = () => {
    const [scene, setScene] = React.useState(createScene())
    const editor = useSceneDocumentEditor({ scene, onSceneChange: setScene })

    return (
      <SceneHierarchyPane
        editor={editor}
        sceneLabel="Room Scene"
        isDirty={true}
        isSaving={false}
        onSave={onSave}
        onRequestActorLoad={onRequestActorLoad}
        onSaveActorResource={onSaveActorResource}
      />
    )
  }

  render(<Harness />)

  return {
    onSave,
    onRequestActorLoad,
    onSaveActorResource
  }
}

const renderPaneWithoutScene = () => {
  const Harness = () => {
    const editor = useSceneDocumentEditor({
      scene: null,
      onSceneChange: () => undefined
    })

    return (
      <SceneHierarchyPane
        editor={editor}
        sceneLabel="Room Scene"
        isDirty={false}
        isSaving={false}
        onSave={() => undefined}
        onRequestActorLoad={() => undefined}
        onSaveActorResource={() => undefined}
      />
    )
  }

  render(<Harness />)
}

describe('SceneHierarchyPane', () => {
  it('hides the scene root tree item when no scene is loaded', () => {
    renderPaneWithoutScene()

    const sidebar = screen.getByTestId('project-workspace-scene-sidebar')
    expect(within(sidebar).getByRole('tree')).toHaveTextContent('Open a scene to edit its hierarchy.')
    expect(screen.queryByRole('treeitem', { name: /Room Scene/i })).not.toBeInTheDocument()
  })

  it('renames actor nodes, exposes actor-only menu actions, and triggers save', async () => {
    const { onSave, onSaveActorResource } = renderPane()

    expect(screen.getByText('Unsaved changes.')).toBeInTheDocument()
    expect(screen.getByText('CAM')).toBeInTheDocument()

    const heroRow = screen.getByText('Hero').closest('.scene-hierarchy-pane__row')
    expect(heroRow).not.toBeNull()

    fireEvent.contextMenu(heroRow!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))

    const renameInput = await screen.findByLabelText('Name for Hero')
    fireEvent.change(renameInput, { target: { value: 'Player' } })
    fireEvent.keyDown(renameInput, { key: 'Enter' })

    expect(await screen.findByText('Player')).toBeInTheDocument()

    fireEvent.contextMenu(screen.getByText('Player').closest('.scene-hierarchy-pane__row')!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Save As Resource' }))

    expect(onSaveActorResource).toHaveBeenCalledWith('hero-node')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('handles keyboard clipboard shortcuts and root context menu actions', async () => {
    const { onRequestActorLoad } = renderPane()

    const sidebar = screen.getByTestId('project-workspace-scene-sidebar')
    const heroButton = within(sidebar).getByRole('treeitem', { name: /Hero/i })
    const folderButton = within(sidebar).getByRole('treeitem', { name: /Folder/i })

    fireEvent.click(heroButton)
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.click(folderButton)
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

    expect(screen.getAllByText(/Hero/).length).toBeGreaterThan(1)

    fireEvent.click(heroButton)
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true })
    expect(heroButton).toHaveClass('scene-hierarchy-pane__node--cut')

    fireEvent.contextMenu(sidebar)
    fireEvent.mouseEnter(await screen.findByRole('menuitem', { name: 'Load...' }))
    fireEvent.click((await screen.findAllByRole('menuitem', { name: 'Actor' }))[1])

    expect(onRequestActorLoad).toHaveBeenCalledWith(null)
  })

  it('opens the root new submenu from the Add button', async () => {
    renderPane()

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Folder' }))

    expect(screen.getAllByRole('treeitem', { name: /Folder/i })).toHaveLength(2)
  })
})
