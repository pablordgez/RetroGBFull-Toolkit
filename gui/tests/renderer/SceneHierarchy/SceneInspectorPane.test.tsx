import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SceneAssetDocument } from '../../../src/shared/projectAssets'
import type { ProjectScriptCallbackCandidate } from '../../../src/shared/projectCodeWorkspace'
import { SceneInspectorPane } from '../../../src/renderer/src/components/SceneHierarchy/SceneInspectorPane'
import { useSceneDocumentEditor } from '../../../src/renderer/src/components/SceneHierarchy/useSceneDocumentEditor'

const createScene = (): SceneAssetDocument => ({
  kind: 'scene',
  version: 1,
  tilemapPath: 'Maps/Room.rgbtilemap.json',
  windowPath: null,
  nodes: [
    {
      id: 'hero-node',
      type: 'actor',
      name: 'Hero',
      isCollapsed: false,
      spritePath: null,
      x: 0,
      y: 0,
      followCamera: false,
      children: [
        {
          id: 'hero-collision',
          type: 'collision',
          name: 'Hitbox',
          isCollapsed: false,
          x: 16,
          y: 32,
          width: 64,
          height: 32,
          isBlocking: true,
          callbacks: [],
          children: []
        }
      ]
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

const collisionCallbackCandidates: ProjectScriptCallbackCandidate[] = [
  {
    scriptPath: 'src/Scripts/Shared.c',
    scriptKind: 'general',
    scriptName: 'Shared',
    functionName: 'OnSharedCollision'
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
  }
]

const renderInspector = () => {
  const onRequestSpriteSelection = vi.fn()
  const onRequestActorScriptSelection = vi.fn()

  const Harness = () => {
    const [scene, setScene] = React.useState(createScene())
    const editor = useSceneDocumentEditor({ scene, onSceneChange: setScene })

    return (
      <>
        <button type="button" onClick={() => editor.selectNode('hero-node')}>
          Select Hero
        </button>
        <button type="button" onClick={() => editor.selectNode('hero-collision')}>
          Select Collision
        </button>
        <button type="button" onClick={() => editor.selectNode('folder-node')}>
          Select Folder
        </button>
        <SceneInspectorPane
          editor={editor}
          tilemapSize={{ width: 20, height: 18 }}
          collisionCallbackCandidates={collisionCallbackCandidates}
          maxCollisionCallbacks={4}
          onRequestActorScriptSelection={onRequestActorScriptSelection}
          onRequestSpriteSelection={onRequestSpriteSelection}
          onSetCollisionCallbacks={(nodeId, callbacks) => {
            editor.setCollisionCallbacks(nodeId, callbacks)
          }}
        />
      </>
    )
  }

  render(<Harness />)

  return {
    onRequestSpriteSelection,
    onRequestActorScriptSelection
  }
}

describe('SceneInspectorPane', () => {
  it('shows folder metadata when a folder is selected', () => {
    renderInspector()

    fireEvent.click(screen.getByRole('button', { name: 'Select Folder' }))

    expect(screen.getAllByText('Folder')).toHaveLength(2)
    expect(screen.getByText('Children')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('updates actor state, resets invalid drafts, and requests sprite selection', () => {
    const { onRequestSpriteSelection, onRequestActorScriptSelection } = renderInspector()

    fireEvent.click(screen.getByRole('button', { name: 'Select Hero' }))

    expect(screen.getByText('No sprite selected')).toBeInTheDocument()
    expect(screen.getByText('160 x 144px')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Select Sprite' }))
    expect(onRequestSpriteSelection).toHaveBeenCalledWith('hero-node')
    fireEvent.click(screen.getByRole('button', { name: 'Select Actor Script' }))
    expect(onRequestActorScriptSelection).toHaveBeenCalledWith('hero-node')

    const followCameraCheckbox = screen.getByLabelText('Follow camera')
    fireEvent.click(followCameraCheckbox)
    expect(followCameraCheckbox).toBeChecked()

    const xInput = screen.getByRole('textbox', { name: 'X' })
    fireEvent.change(xInput, { target: { value: 'oops' } })
    fireEvent.blur(xInput)
    expect(xInput).toHaveValue('0')

    fireEvent.change(xInput, { target: { value: '4' } })
    fireEvent.keyDown(xInput, { key: 'Enter' })
    expect(xInput).toHaveValue('4')
  })

  it('updates collision state and restores collision drafts on escape', () => {
    renderInspector()

    fireEvent.click(screen.getByRole('button', { name: 'Select Collision' }))

    const blockingCheckbox = screen.getByLabelText('Blocking')
    fireEvent.click(blockingCheckbox)
    expect(blockingCheckbox).not.toBeChecked()

    const widthInput = screen.getByRole('textbox', { name: 'Width' })
    fireEvent.change(widthInput, { target: { value: 'bad' } })
    fireEvent.keyDown(widthInput, { key: 'Escape' })
    expect(widthInput).toHaveValue('4')

    const xInput = screen.getByRole('textbox', { name: 'X' })
    fireEvent.change(xInput, { target: { value: '2' } })
    fireEvent.keyDown(xInput, { key: 'Enter' })
    expect(xInput).toHaveValue('2')
  })

  it('opens a callback dialog grouped by script and adds callbacks from actor or scene scripts', () => {
    renderInspector()

    fireEvent.click(screen.getByRole('button', { name: 'Select Collision' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Callback' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Hero/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    )

    fireEvent.click(within(dialog).getByRole('button', { name: /Hero/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /OnHeroCollision/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('OnHeroCollision')).toBeInTheDocument()
    expect(screen.getByText('Hero.c')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add Callback' }))
    const secondDialog = screen.getByRole('dialog')
    fireEvent.click(within(secondDialog).getByRole('button', { name: /Room/i }))
    fireEvent.click(within(secondDialog).getByRole('button', { name: /OnRoomCollision/i }))

    expect(screen.getByText('OnRoomCollision')).toBeInTheDocument()
    expect(screen.getByText('Room.c')).toBeInTheDocument()
  })
})
