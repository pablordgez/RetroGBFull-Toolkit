import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActorAssetDocument, SceneAssetDocument } from '../../../src/shared/projectAssets'
import type { ProjectCodeSymbolIndex } from '../../../src/shared/projectCodeWorkspace'
import { DEFAULT_COORDINATE_MODEL_PREFERENCES } from '../../../src/renderer/src/components/Preferences/coordinatePreferences'
import { SceneEditorWorkspace } from '../../../src/renderer/src/components/ProjectWorkspace/SceneEditorWorkspace'

const listProjectAssetsByKindMock = vi.fn()
const listProjectScriptsByKindMock = vi.fn()

vi.mock('../../../src/renderer/src/components/Layout/ResizablePaneLayout', () => ({
  ResizablePaneLayout: ({
    pane,
    children
  }: {
    pane: React.ReactNode
    children: React.ReactNode
  }) => (
    <div>
      <div>{pane}</div>
      <div>{children}</div>
    </div>
  )
}))

vi.mock('../../../src/renderer/src/components/SceneHierarchy/SceneHierarchyPane', () => ({
  SceneHierarchyPane: ({
    editor,
    onRequestActorLoad,
    onSaveActorResource
  }: {
    editor: { selectNode: (nodeId: string | null) => void; nodes: Array<unknown> }
    onRequestActorLoad: (parentId: string | null) => void
    onSaveActorResource: (nodeId: string) => void
  }) => (
    <div>
      <button type="button" onClick={() => editor.selectNode('hero-node')}>
        Select Hero
      </button>
      <button type="button" onClick={() => onRequestActorLoad(null)}>
        Load Actor
      </button>
      <button type="button" onClick={() => onSaveActorResource('hero-node')}>
        Save Hero Resource
      </button>
      <div data-testid="scene-node-count">{String(editor.nodes.length)}</div>
    </div>
  )
}))

vi.mock('../../../src/renderer/src/components/SceneHierarchy/SceneInspectorPane', () => ({
  SceneInspectorPane: (props: {
    editor: {
      scriptPath: string | null
      tilemapPath: string | null
      windowPath: string | null
      nodes: Array<unknown>
      selectedActor: {
        scriptPath?: string | null
        scriptProperties?: Record<string, unknown>
        spritePaletteIndex?: number
      } | null
      selectedNodeId: string | null
      selectedNode: { type: string; spritePath?: string | null; scriptPath?: string | null } | null
      sceneScriptProperties?: Record<string, unknown>
    }
    sceneScriptPropertyDefinitions: Array<{ name: string }>
    actorScriptPropertyDefinitions: Array<{ name: string }>
    onRequestTilemapSelection: () => void
    onRequestWindowSelection: () => void
    onRequestSceneScriptSelection: () => void
    onRequestActorScriptSelection: (nodeId: string) => void
    onRequestSpriteSelection: (nodeId: string) => void
    onRequestSceneAnimationPropertySelection: (propertyName: string) => void
    onRequestActorAnimationPropertySelection: (nodeId: string, propertyName: string) => void
  }) => (
    <div data-testid="scene-inspector-pane">
      <div data-testid="scene-property-definitions">
        {props.sceneScriptPropertyDefinitions.map((definition) => definition.name).join(',')}
      </div>
      <div data-testid="actor-property-definitions">
        {props.actorScriptPropertyDefinitions.map((definition) => definition.name).join(',')}
      </div>
      <div data-testid="scene-animation-value">
        {String(props.editor.sceneScriptProperties?.intro_animation ?? '')}
      </div>
      <div data-testid="actor-animation-value">
        {String(props.editor.selectedActor?.scriptProperties?.idle_animation ?? '')}
      </div>
      <div data-testid="scene-script-path">{String(props.editor.scriptPath ?? '')}</div>
      <div data-testid="actor-script-path">
        {String(props.editor.selectedActor?.scriptPath ?? '')}
      </div>
      <div data-testid="actor-sprite-palette-index">
        {String(props.editor.selectedActor?.spritePaletteIndex ?? '')}
      </div>
      <div data-testid="tilemap-path">{String(props.editor.tilemapPath ?? '')}</div>
      <div data-testid="window-path">{String(props.editor.windowPath ?? '')}</div>
      <div data-testid="selected-sprite-path">
        {String(
          props.editor.selectedNode?.type === 'actor'
            ? (props.editor.selectedNode.spritePath ?? '')
            : ''
        )}
      </div>
      <div data-testid="selected-node-id">{String(props.editor.selectedNodeId ?? '')}</div>
      <button type="button" onClick={() => props.onRequestTilemapSelection()}>
        Pick Tilemap
      </button>
      <button type="button" onClick={() => props.onRequestWindowSelection()}>
        Pick Window
      </button>
      <button type="button" onClick={() => props.onRequestSceneScriptSelection()}>
        Pick Scene Script
      </button>
      <button type="button" onClick={() => props.onRequestActorScriptSelection('hero-node')}>
        Pick Actor Script
      </button>
      <button type="button" onClick={() => props.onRequestSpriteSelection('hero-node')}>
        Pick Sprite
      </button>
      <button
        type="button"
        onClick={() => props.onRequestSceneAnimationPropertySelection('intro_animation')}
      >
        Pick Scene Animation
      </button>
      <button
        type="button"
        onClick={() =>
          props.onRequestActorAnimationPropertySelection('hero-node', 'idle_animation')
        }
      >
        Pick Actor Animation
      </button>
    </div>
  )
}))

vi.mock('../../../src/renderer/src/components/SceneHierarchy/SceneViewport', () => ({
  SceneViewport: (props: {
    onProjectAssetDrop: (
      payload: { kind: 'tilemap' | 'window' | 'actor'; path: string },
      dropPosition: { x: number; y: number }
    ) => void
    onViewportBackgroundSelect: () => void
  }) => (
    <div data-testid="scene-viewport">
      <button
        type="button"
        onClick={() =>
          props.onProjectAssetDrop(
            { kind: 'tilemap', path: 'Maps/Room.rgbtilemap.json' },
            { x: 16, y: 32 }
          )
        }
      >
        Drop Tilemap
      </button>
      <button
        type="button"
        onClick={() =>
          props.onProjectAssetDrop(
            { kind: 'window', path: 'Windows/Hud.rgbwindow.json' },
            { x: 24, y: 40 }
          )
        }
      >
        Drop Window
      </button>
      <button
        type="button"
        onClick={() =>
          props.onProjectAssetDrop(
            { kind: 'actor', path: 'Actors/Npc.rgbactor.json' },
            { x: 48, y: 64 }
          )
        }
      >
        Drop Actor
      </button>
      <button type="button" onClick={() => props.onViewportBackgroundSelect()}>
        Select Background
      </button>
    </div>
  )
}))

vi.mock('../../../src/renderer/src/components/ProjectAssets/ProjectAssetPickerModal', () => ({
  ProjectAssetPickerModal: (props: {
    title: string
    description: string
    options: Array<{ name: string; path: string }>
    errorMessage?: string | null
    emptyMessage: string
    noneLabel: string | null
    onSelectNone: (() => void) | null
    onRefresh: () => void
    onClose: () => void
    onSelect: (option: { name: string; path: string }) => void
  }) => (
    <div role="dialog" aria-label={props.title}>
      <h2>{props.title}</h2>
      <div>{props.description}</div>
      <div>{props.errorMessage ?? props.emptyMessage}</div>
      <button type="button" onClick={() => props.onRefresh()}>
        Refresh Asset Picker
      </button>
      <button type="button" onClick={() => props.onClose()}>
        Close Asset Picker
      </button>
      {props.noneLabel && props.onSelectNone ? (
        <button type="button" onClick={() => props.onSelectNone?.()}>
          {props.noneLabel}
        </button>
      ) : null}
      {props.options.map((option) => (
        <button key={option.path} type="button" onClick={() => props.onSelect(option)}>
          {option.name}
        </button>
      ))}
    </div>
  )
}))

vi.mock('../../../src/renderer/src/components/ProjectAssets/ProjectScriptPickerModal', () => ({
  ProjectScriptPickerModal: (props: {
    title: string
    description: string
    options: Array<{ name: string; path: string }>
    errorMessage?: string | null
    emptyMessage: string
    noneLabel: string
    onRefresh: () => void
    onClose: () => void
    onSelectNone: () => void
    onSelect: (option: { name: string; path: string }) => void
  }) => (
    <div role="dialog" aria-label={props.title}>
      <h2>{props.title}</h2>
      <div>{props.description}</div>
      <div>{props.errorMessage ?? props.emptyMessage}</div>
      <button type="button" onClick={() => props.onRefresh()}>
        Refresh Script Picker
      </button>
      <button type="button" onClick={() => props.onClose()}>
        Close Script Picker
      </button>
      <button type="button" onClick={() => props.onSelectNone()}>
        {props.noneLabel}
      </button>
      {props.options.map((option) => (
        <button key={option.path} type="button" onClick={() => props.onSelect(option)}>
          {option.name}
        </button>
      ))}
    </div>
  )
}))

vi.mock('../../../src/renderer/src/components/ProjectAssets/projectAssetBrowser', () => ({
  listProjectAssetsByKind: (...args: unknown[]) => listProjectAssetsByKindMock(...args)
}))

vi.mock('../../../src/renderer/src/components/ProjectAssets/projectScriptBrowser', () => ({
  listProjectScriptsByKind: (...args: unknown[]) => listProjectScriptsByKindMock(...args)
}))

vi.mock('../../../src/renderer/src/components/SceneHierarchy/useSceneAssetReferences', () => ({
  useSceneAssetReferences: () => ({
    tilemapDocument: null,
    tilemapTilesetDocument: null,
    windowDocument: null,
    windowTilesetDocument: null,
    spritePreviews: {},
    defaultSpritePalettes: [null, null],
    defaultBackgroundPalette: null,
    spritePaletteMismatchPaths: [],
    backgroundPaletteMismatchPaths: [],
    loadError: null
  })
}))

const createScene = (): SceneAssetDocument => ({
  kind: 'scene',
  version: 1,
  tilemapPath: 'Maps/Initial.rgbtilemap.json',
  windowPath: 'Windows/Initial.rgbwindow.json',
  scriptPath: 'src/CustomScenes/Room.c',
  scriptProperties: {
    intro_animation: null
  },
  nodes: [
    {
      id: 'hero-node',
      type: 'actor',
      name: 'Hero',
      isCollapsed: false,
      spritePath: 'Sprites/InitialHero.rgbsprite.json',
      scriptPath: 'src/CustomActors/Hero.c',
      scriptProperties: {
        idle_animation: null
      },
      x: 0,
      y: 0,
      followCamera: false,
      children: []
    }
  ]
})

const createSymbolIndex = (
  sceneFieldNames: string[],
  actorFieldNames: string[]
): ProjectCodeSymbolIndex => ({
  structs: [
    {
      name: 'Room',
      fields: sceneFieldNames.map((name) => ({
        name,
        type:
          name === 'intro_animation'
            ? { name: 'Animation', pointerDepth: 1 }
            : { name: 'uint8_t', pointerDepth: 0 }
      }))
    },
    {
      name: 'Hero',
      fields: actorFieldNames.map((name) => ({
        name,
        type:
          name === 'idle_animation'
            ? { name: 'Animation', pointerDepth: 1 }
            : name === 'active'
              ? { name: 'BOOLEAN', pointerDepth: 0 }
              : { name: 'uint8_t', pointerDepth: 0 }
      }))
    }
  ],
  enums: [],
  functions: [],
  variables: [],
  macros: [],
  typeAliases: [],
  sourceFilesScanned: 2
})

const createActorDocument = (name = 'NPC'): ActorAssetDocument => ({
  kind: 'actor',
  version: 1,
  root: {
    id: `${name.toLowerCase()}-node`,
    type: 'actor',
    name,
    isCollapsed: false,
    spritePath: null,
    x: 0,
    y: 0,
    followCamera: false,
    children: []
  }
})

const renderWorkspace = ({
  projectPath = '/projects/Alpha',
  scene = createScene(),
  onSceneChange = vi.fn(),
  onSave = vi.fn(),
  onStatus = vi.fn(),
  onResourcesChanged = vi.fn()
}: {
  projectPath?: string
  scene?: SceneAssetDocument | null
  onSceneChange?: ReturnType<typeof vi.fn>
  onSave?: ReturnType<typeof vi.fn>
  onStatus?: ReturnType<typeof vi.fn>
  onResourcesChanged?: ReturnType<typeof vi.fn>
} = {}): ReturnType<typeof render> => {
  return render(
    <SceneEditorWorkspace
      projectPath={projectPath}
      scenePath={scene ? 'Scenes/Room.rgbscene.json' : null}
      scene={scene}
      resourceManagerCurrentPath=""
      sceneLabel="Room"
      isDirty={false}
      isSaving={false}
      statusMessage={null}
      onSceneChange={onSceneChange}
      onSave={onSave}
      onStatus={onStatus}
      onResourcesChanged={onResourcesChanged}
      coordinatePreferences={DEFAULT_COORDINATE_MODEL_PREFERENCES}
    />
  )
}

describe('SceneEditorWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listProjectAssetsByKindMock.mockResolvedValue([])
    listProjectScriptsByKindMock.mockResolvedValue([])
    vi.mocked(window.api.listProjectScriptCallbackCandidates).mockResolvedValue([])
    vi.mocked(window.api.readMaxCollisionCallbacks).mockResolvedValue(4)
  })

  it('refreshes parsed scene and actor script properties after a script save event', async () => {
    let symbolIndexRequestCount = 0
    vi.mocked(window.api.getProjectCodeSymbolIndex).mockImplementation(async () => {
      symbolIndexRequestCount += 1

      return symbolIndexRequestCount === 1
        ? createSymbolIndex(['gravity'], ['speed'])
        : createSymbolIndex(['gravity', 'wind'], ['speed', 'active'])
    })

    renderWorkspace()

    await waitFor(() => {
      expect(screen.getByTestId('scene-property-definitions')).toHaveTextContent('gravity')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select Hero' }))

    await waitFor(() => {
      expect(screen.getByTestId('actor-property-definitions')).toHaveTextContent('speed')
    })

    const handleProjectScriptSaved = vi.mocked(window.api.onProjectScriptSaved).mock.calls[0]?.[0]

    expect(handleProjectScriptSaved).toBeTypeOf('function')

    handleProjectScriptSaved?.({
      projectPath: '/projects/Alpha',
      resourcePath: 'src/CustomScenes/Room.c',
      scriptKind: 'scene'
    })

    await waitFor(() => {
      expect(screen.getByTestId('scene-property-definitions')).toHaveTextContent('gravity,wind')
    })

    await waitFor(() => {
      expect(screen.getByTestId('actor-property-definitions')).toHaveTextContent('speed,active')
    })
  })

  it('applies animation picker selections back into scene and actor script properties', async () => {
    vi.mocked(window.api.getProjectCodeSymbolIndex).mockResolvedValue(
      createSymbolIndex(['intro_animation'], ['idle_animation'])
    )
    listProjectAssetsByKindMock.mockResolvedValue([
      {
        kind: 'sprite',
        name: 'Room Intro',
        path: 'Sprites/RoomIntro.rgbsprite.json'
      },
      {
        kind: 'sprite',
        name: 'Hero Idle',
        path: 'Sprites/HeroIdle.rgbsprite.json'
      }
    ])

    renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: 'Pick Scene Animation' }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Select Animation' })).toBeInTheDocument()
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Room Intro' }))

    await waitFor(() => {
      expect(screen.getByTestId('scene-animation-value')).toHaveTextContent(
        'Sprites/RoomIntro.rgbsprite.json'
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select Hero' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick Actor Animation' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hero Idle' })).toBeInTheDocument()
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Hero Idle' }))

    await waitFor(() => {
      expect(screen.getByTestId('actor-animation-value')).toHaveTextContent(
        'Sprites/HeroIdle.rgbsprite.json'
      )
    })

    expect(listProjectAssetsByKindMock).toHaveBeenCalledWith('/projects/Alpha', ['sprite'])
  })

  it('supports clearing tilemap, window, and script selections through the pickers', async () => {
    vi.mocked(window.api.getProjectCodeSymbolIndex).mockResolvedValue(
      createSymbolIndex(['intro_animation'], ['idle_animation'])
    )
    listProjectScriptsByKindMock.mockImplementation(async (_projectPath, kinds: string[]) => {
      if (kinds.includes('scene')) {
        return [{ kind: 'scene', name: 'Room Script', path: 'src/CustomScenes/Room2.c' }]
      }

      return [{ kind: 'actor', name: 'Hero Script', path: 'src/CustomActors/Hero2.c' }]
    })

    renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: 'Pick Tilemap' }))
    expect(screen.getByRole('dialog', { name: 'Load Tilemap' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'No Tilemap' }))
    await waitFor(() => {
      expect(screen.getByTestId('tilemap-path')).toHaveTextContent('')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Pick Window' }))
    expect(screen.getByRole('dialog', { name: 'Load Window' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'No Window' }))
    await waitFor(() => {
      expect(screen.getByTestId('window-path')).toHaveTextContent('')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Pick Scene Script' }))
    expect(screen.getByRole('dialog', { name: 'Select Scene Script' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'No Scene Script' }))
    await waitFor(() => {
      expect(screen.getByTestId('scene-script-path')).toHaveTextContent('')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select Hero' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick Actor Script' }))
    expect(screen.getByRole('dialog', { name: 'Select Actor Script' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'No Actor Script' }))
    await waitFor(() => {
      expect(screen.getByTestId('actor-script-path')).toHaveTextContent('')
    })
  })

  it('supports sprite selection, actor loading, and project asset drops', async () => {
    vi.mocked(window.api.getProjectCodeSymbolIndex).mockResolvedValue(
      createSymbolIndex(['intro_animation'], ['idle_animation'])
    )
    listProjectAssetsByKindMock.mockImplementation(async (_projectPath, kinds: string[]) => {
      if (kinds.includes('actor')) {
        return [{ kind: 'actor', name: 'NPC', path: 'Actors/Npc.rgbactor.json' }]
      }

      return [{ kind: 'sprite', name: 'Hero Alt', path: 'Sprites/HeroAlt.rgbsprite.json' }]
    })
    vi.mocked(window.api.loadProjectAssetFile).mockImplementation(
      async (_projectPath, assetPath) => {
        if (assetPath === 'Actors/Npc.rgbactor.json') {
          return {
            assetKind: 'actor',
            resourcePath: assetPath,
            document: createActorDocument()
          }
        }

        if (assetPath === 'Sprites/HeroAlt.rgbsprite.json') {
          return {
            assetKind: 'sprite',
            resourcePath: assetPath,
            document: {
              kind: 'sprite',
              version: 1,
              width: 8,
              height: 8,
              fps: 8,
              is8x16Mode: false,
              currentFrame: 0,
              frames: [new Array(64).fill(1)],
              palette: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
              selectedColor: 0
            }
          }
        }

        if (assetPath === 'Maps/Room.rgbtilemap.json') {
          return {
            assetKind: 'tilemap',
            resourcePath: assetPath,
            document: {
              kind: 'tilemap',
              version: 1,
              width: 20,
              height: 18,
              tilesetPath: 'Tilesets/Room.rgbtileset.json',
              tiles: []
            }
          }
        }

        if (assetPath === 'Windows/Hud.rgbwindow.json') {
          return {
            assetKind: 'window',
            resourcePath: assetPath,
            document: {
              kind: 'window',
              version: 1,
              width: 20,
              height: 18,
              tilesetPath: 'Tilesets/Ui.rgbtileset.json',
              tileIndices: []
            }
          }
        }

        if (assetPath === 'Actors/Npc.rgbactor.json') {
          return {
            assetKind: 'actor',
            resourcePath: assetPath,
            document: createActorDocument()
          }
        }

        throw new Error(`Unexpected asset load: ${assetPath}`)
      }
    )

    renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: 'Select Hero' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick Sprite' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hero Alt' }))

    await waitFor(() => {
      expect(screen.getByTestId('selected-sprite-path')).toHaveTextContent(
        'Sprites/HeroAlt.rgbsprite.json'
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Load Actor' }))
    expect(screen.getByRole('dialog', { name: 'Load Actor' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'NPC' }))

    await waitFor(() => {
      expect(screen.getByTestId('scene-node-count')).toHaveTextContent('2')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Drop Tilemap' }))
    await waitFor(() => {
      expect(screen.getByTestId('tilemap-path')).toHaveTextContent('Maps/Room.rgbtilemap.json')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Drop Window' }))
    await waitFor(() => {
      expect(screen.getByTestId('window-path')).toHaveTextContent('Windows/Hud.rgbwindow.json')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Drop Actor' }))
    await waitFor(() => {
      expect(screen.getByTestId('scene-node-count')).toHaveTextContent('3')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select Background' }))
    await waitFor(() => {
      expect(screen.getByTestId('selected-node-id')).toHaveTextContent('')
    })
  })

  it('assigns a selected sprite to palette 1 when it differs from the unused second scene palette', async () => {
    vi.mocked(window.api.getProjectCodeSymbolIndex).mockResolvedValue(
      createSymbolIndex(['intro_animation'], ['idle_animation'])
    )
    listProjectAssetsByKindMock.mockResolvedValue([
      { kind: 'sprite', name: 'Hero Alt', path: 'Sprites/HeroAlt.rgbsprite.json' }
    ])
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'sprite',
      resourcePath: 'Sprites/HeroAlt.rgbsprite.json',
      document: {
        kind: 'sprite',
        version: 1,
        width: 8,
        height: 8,
        fps: 8,
        is8x16Mode: false,
        currentFrame: 0,
        frames: [new Array(64).fill(1)],
        palette: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'],
        selectedColor: 0
      }
    })

    renderWorkspace({
      scene: {
        ...createScene(),
        spritePalettes: [['#000000', '#555555', '#aaaaaa', '#ffffff'], null]
      }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select Hero' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick Sprite' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hero Alt' }))

    await waitFor(() => {
      expect(screen.getByTestId('selected-sprite-path')).toHaveTextContent(
        'Sprites/HeroAlt.rgbsprite.json'
      )
      expect(screen.getByTestId('actor-sprite-palette-index')).toHaveTextContent('1')
    })
  })

  it('saves new actor resources and overwrites linked ones when requested', async () => {
    vi.mocked(window.api.getProjectCodeSymbolIndex).mockResolvedValue(
      createSymbolIndex(['intro_animation'], ['idle_animation'])
    )
    const onResourcesChanged = vi.fn()
    const onStatus = vi.fn()
    vi.mocked(window.api.createProjectResource).mockResolvedValue({
      resourceType: 'actor',
      resourcePath: 'Actors/Hero Copy.rgbactor.json',
      resourceName: 'Hero Copy',
      parentPath: '',
      view: {
        projectName: 'Alpha',
        projectPath: '/projects/Alpha',
        currentPath: '',
        parentPath: null,
        items: []
      }
    })
    vi.mocked(window.api.saveProjectAssetFile).mockResolvedValue({
      assetKind: 'actor',
      resourcePath: 'Actors/Hero Copy.rgbactor.json',
      document: createActorDocument('Hero')
    })

    const initialRender = renderWorkspace({ onResourcesChanged, onStatus })

    fireEvent.click(screen.getByRole('button', { name: 'Select Hero' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Hero Resource' }))

    await waitFor(() => {
      expect(window.api.createProjectResource).toHaveBeenCalledWith(
        '/projects/Alpha',
        'actor',
        '',
        'Hero'
      )
    })

    expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
      '/projects/Alpha',
      'Actors/Hero Copy.rgbactor.json',
      expect.objectContaining({
        kind: 'actor'
      })
    )
    expect(onResourcesChanged).toHaveBeenCalled()
    expect(onStatus).toHaveBeenCalledWith('info', 'Saved actor resource "Hero".')
    initialRender.unmount()

    const linkedScene = createScene()
    linkedScene.nodes[0].resourcePath = 'Actors/Hero.rgbactor.json'
    vi.mocked(window.api.saveProjectAssetFile).mockClear()
    vi.mocked(window.api.createProjectResource).mockClear()

    renderWorkspace({ scene: linkedScene, onResourcesChanged, onStatus })

    fireEvent.click(screen.getByRole('button', { name: 'Select Hero' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Hero Resource' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save Hero Resource' }))
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }))

    await waitFor(() => {
      expect(window.api.saveProjectAssetFile).toHaveBeenCalledWith(
        '/projects/Alpha',
        'Actors/Hero.rgbactor.json',
        expect.any(Object)
      )
    })

    expect(window.api.createProjectResource).not.toHaveBeenCalled()
    expect(onStatus).toHaveBeenCalledWith('info', 'Overwrote actor resource "Hero".')
  })

  it('renders the empty scene state and skips project subscriptions without a project path', async () => {
    renderWorkspace({ projectPath: '', scene: null })

    expect(screen.getByText('Create or load a new scene to start working')).toBeInTheDocument()
    await waitFor(() => {
      expect(window.api.getProjectCodeSymbolIndex).not.toHaveBeenCalled()
    })
    expect(window.api.onProjectScriptSaved).not.toHaveBeenCalled()
  })

  it('reports picker, script picker, symbol index, and drop errors', async () => {
    const onStatus = vi.fn()
    vi.mocked(window.api.getProjectCodeSymbolIndex).mockRejectedValueOnce(
      new Error('symbols failed')
    )
    listProjectAssetsByKindMock.mockRejectedValueOnce(new Error('assets failed'))
    listProjectScriptsByKindMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('scripts failed'))
    vi.mocked(window.api.loadProjectAssetFile).mockResolvedValue({
      assetKind: 'window',
      resourcePath: 'Maps/Room.rgbtilemap.json',
      document: {
        kind: 'window',
        version: 1,
        width: 20,
        height: 18,
        tilesetPath: null,
        tileIndices: []
      }
    })

    renderWorkspace({ onStatus })

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith('error', 'symbols failed')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Pick Tilemap' }))
    expect(await screen.findByText('assets failed')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pick Scene Script' }))
    expect(await screen.findByText('scripts failed')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Drop Tilemap' }))
    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith('error', 'The dropped asset is not a tilemap.')
    })
  })
})
