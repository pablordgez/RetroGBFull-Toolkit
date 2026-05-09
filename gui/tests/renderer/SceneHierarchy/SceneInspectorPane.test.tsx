import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SceneAssetDocument } from '../../../src/shared/projectAssets'
import type {
  ParsedScriptPropertyDefinition,
  ProjectScriptCallbackCandidate
} from '../../../src/shared/projectCodeWorkspace'
import { SceneInspectorPane } from '../../../src/renderer/src/components/SceneHierarchy/SceneInspectorPane'
import { useSceneDocumentEditor } from '../../../src/renderer/src/components/SceneHierarchy/useSceneDocumentEditor'

const createScene = (): SceneAssetDocument => ({
  kind: 'scene',
  version: 1,
  tilemapPath: 'Maps/Room.rgbtilemap.json',
  windowPath: null,
  scriptPath: 'src/CustomScenes/Room.c',
  scriptProperties: {
    gravity: 2,
    paused: false,
    intro_animation: 'Sprites/RoomIntro.rgbsprite.json',
    state: 'STATE_RUN'
  },
  nodes: [
    {
      id: 'hero-node',
      type: 'actor',
      name: 'Hero',
      isCollapsed: false,
      spritePath: null,
      scriptPath: 'src/CustomActors/Hero.c',
      scriptProperties: {
        speed: 3,
        active: true,
        idle_animation: 'Sprites/HeroIdle.rgbsprite.json',
        mood: 'MOOD_ALERT'
      },
      x: 0,
      y: 0,
      physicsMode: 'balanced',
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

const sceneScriptPropertyDefinitions: ParsedScriptPropertyDefinition[] = [
  {
    name: 'gravity',
    kind: 'integer',
    typeName: 'uint8_t',
    minimum: 0,
    maximum: 255,
    isSigned: false
  },
  {
    name: 'paused',
    kind: 'boolean',
    typeName: 'BOOLEAN'
  },
  {
    name: 'intro_animation',
    kind: 'animation',
    typeName: 'Animation'
  },
  {
    name: 'state',
    kind: 'enum',
    typeName: 'SceneState',
    enumValues: ['STATE_IDLE', 'STATE_RUN']
  }
]

const actorScriptPropertyDefinitions: ParsedScriptPropertyDefinition[] = [
  {
    name: 'speed',
    kind: 'integer',
    typeName: 'uint8_t',
    minimum: 0,
    maximum: 255,
    isSigned: false
  },
  {
    name: 'active',
    kind: 'boolean',
    typeName: 'BOOLEAN'
  },
  {
    name: 'idle_animation',
    kind: 'animation',
    typeName: 'Animation'
  },
  {
    name: 'mood',
    kind: 'enum',
    typeName: 'HeroMood',
    enumValues: ['MOOD_CALM', 'MOOD_ALERT']
  }
]

const renderInspector = () => {
  const onRequestSpriteSelection = vi.fn()
  const onRequestActorScriptSelection = vi.fn()
  const onRequestSceneAnimationPropertySelection = vi.fn()
  const onRequestActorAnimationPropertySelection = vi.fn()

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
          sceneScriptPropertyDefinitions={sceneScriptPropertyDefinitions}
          actorScriptPropertyDefinitions={actorScriptPropertyDefinitions}
          collisionCallbackCandidates={collisionCallbackCandidates}
          maxCollisionCallbacks={4}
          maxTagSlots={2}
          projectTags={[
            { id: 'player', name: 'Player' },
            { id: 'friendly', name: 'Friendly' },
            { id: 'enemy', name: 'Enemy' }
          ]}
          defaultSpritePalettes={[['#9bbc0f', '#8bac0f', '#306230', '#0f380f'], null]}
          defaultBackgroundPalette={['#9bbc0f', '#8bac0f', '#306230', '#0f380f']}
          spritePaletteMismatchPaths={['Sprites/HeroAlt.rgbsprite.json']}
          backgroundPaletteMismatchPaths={['Windows/Hud.rgbwindow.json']}
          onRequestActorScriptSelection={onRequestActorScriptSelection}
          onRequestSpriteSelection={onRequestSpriteSelection}
          onRequestSceneAnimationPropertySelection={onRequestSceneAnimationPropertySelection}
          onRequestActorAnimationPropertySelection={onRequestActorAnimationPropertySelection}
          onSetSceneScriptProperty={(propertyName, propertyValue) => {
            editor.setSceneScriptProperty(propertyName, propertyValue)
          }}
          onSetActorScriptProperty={(nodeId, propertyName, propertyValue) => {
            editor.setActorScriptProperty(nodeId, propertyName, propertyValue)
          }}
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
    onRequestActorScriptSelection,
    onRequestSceneAnimationPropertySelection,
    onRequestActorAnimationPropertySelection
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

  it('updates actor state, validates script properties, and requests sprite selection', () => {
    const {
      onRequestSpriteSelection,
      onRequestActorScriptSelection,
      onRequestActorAnimationPropertySelection
    } = renderInspector()

    fireEvent.click(screen.getByRole('button', { name: 'Select Hero' }))

    expect(screen.getByText('No sprite selected')).toBeInTheDocument()
    expect(screen.getByText('160 x 144px')).toBeInTheDocument()
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
    expect(screen.getByLabelText('active')).toBeChecked()
    expect(screen.getByText('HeroIdle')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /physics mode/i })).toHaveValue('balanced')
    expect(screen.getByRole('combobox', { name: /mood/i })).toHaveValue('MOOD_ALERT')

    fireEvent.click(screen.getByRole('button', { name: 'Select Sprite' }))
    expect(onRequestSpriteSelection).toHaveBeenCalledWith('hero-node')
    fireEvent.click(screen.getByRole('button', { name: 'Change Actor Script' }))
    expect(onRequestActorScriptSelection).toHaveBeenCalledWith('hero-node')
    fireEvent.click(screen.getByRole('button', { name: 'Change Animation' }))
    expect(onRequestActorAnimationPropertySelection).toHaveBeenCalledWith(
      'hero-node',
      'idle_animation'
    )

    fireEvent.click(screen.getByLabelText('Player'))
    fireEvent.click(screen.getByLabelText('Friendly'))
    expect(screen.getByLabelText('Player')).toBeChecked()
    expect(screen.getByLabelText('Friendly')).toBeChecked()
    expect(screen.getByLabelText('Enemy')).toBeDisabled()

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

    const speedInput = screen.getByRole('textbox', { name: /speed/i })
    fireEvent.change(speedInput, { target: { value: '999' } })
    fireEvent.blur(speedInput)
    expect(screen.getByText('Maximum value is 255.')).toBeInTheDocument()
    expect(speedInput).toHaveValue('999')
    fireEvent.keyDown(speedInput, { key: 'Escape' })
    expect(speedInput).toHaveValue('3')

    fireEvent.change(screen.getByRole('combobox', { name: /mood/i }), {
      target: { value: 'MOOD_CALM' }
    })
    expect(screen.getByRole('combobox', { name: /mood/i })).toHaveValue('MOOD_CALM')

    fireEvent.change(screen.getByRole('combobox', { name: /physics mode/i }), {
      target: { value: 'highFidelity' }
    })
    expect(screen.getByRole('combobox', { name: /physics mode/i })).toHaveValue('highFidelity')
  })

  it('shows and updates scene script properties when the scene root is selected', () => {
    const { onRequestSceneAnimationPropertySelection } = renderInspector()

    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
    expect(screen.getByText('Sprite Palette 0')).toBeInTheDocument()
    expect(screen.getByText(/Sprite palette matches neither scene palette: HeroAlt/)).toBeInTheDocument()
    expect(screen.getByText('Background/Window Palette')).toBeInTheDocument()
    expect(screen.getByText(/Background\/window palette differs: Hud/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Sprite Palette 0 color 0')).not.toBeInTheDocument()

    const dataTransfer = {
      value: '',
      effectAllowed: 'move',
      setData(_type: string, value: string) {
        this.value = value
      },
      getData() {
        return this.value
      }
    }
    const spritePalette0 = within(screen.getByLabelText('Sprite Palette 0'))
    fireEvent.dragStart(spritePalette0.getByTitle('Index 0: #9bbc0f. Drag to reorder.'), {
      dataTransfer
    })
    fireEvent.drop(spritePalette0.getByTitle('Index 2: #306230. Drag to reorder.'), {
      dataTransfer
    })
    expect(
      within(screen.getByLabelText('Sprite Palette 0')).getByTitle(
        'Index 0: #8bac0f. Drag to reorder.'
      )
    ).toBeInTheDocument()

    const gravityInput = screen.getByRole('textbox', { name: /gravity/i })
    fireEvent.change(gravityInput, { target: { value: '12' } })
    fireEvent.keyDown(gravityInput, { key: 'Enter' })
    expect(gravityInput).toHaveValue('12')

    const pausedCheckbox = screen.getByLabelText('paused')
    fireEvent.click(pausedCheckbox)
    expect(pausedCheckbox).toBeChecked()

    fireEvent.change(screen.getByRole('combobox', { name: /state/i }), {
      target: { value: 'STATE_IDLE' }
    })
    expect(screen.getByRole('combobox', { name: /state/i })).toHaveValue('STATE_IDLE')

    fireEvent.click(screen.getByRole('button', { name: 'Change Animation' }))
    expect(onRequestSceneAnimationPropertySelection).toHaveBeenCalledWith('intro_animation')
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
