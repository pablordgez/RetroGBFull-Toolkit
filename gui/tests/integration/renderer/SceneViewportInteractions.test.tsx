import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  SceneAssetActorNode,
  SceneAssetCollisionNode,
  SceneAssetNode
} from '../../../src/shared/projectAssets'
import { SceneViewport } from '../../../src/renderer/src/components/SceneHierarchy/SceneViewport'
import type { SceneDocumentEditor } from '../../../src/renderer/src/components/SceneHierarchy/useSceneDocumentEditor'
import { PROJECT_ASSET_DRAG_MIME } from '../../../src/renderer/src/components/ProjectAssets/projectAssetDrag'

interface MockDataTransfer {
  dropEffect: string
  effectAllowed: string
  readonly types: string[]
  setData: (type: string, value: string) => void
  getData: (type: string) => string
}

const createMockDataTransfer = (payload?: unknown): MockDataTransfer => {
  const data = new Map<string, string>()

  if (payload !== undefined) {
    data.set(PROJECT_ASSET_DRAG_MIME, JSON.stringify(payload))
  }

  return {
    dropEffect: 'none',
    effectAllowed: 'none',
    get types() {
      return Array.from(data.keys())
    },
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value)
    }),
    getData: vi.fn((type: string) => data.get(type) ?? '')
  }
}

const createActor = (overrides: Partial<SceneAssetActorNode> = {}): SceneAssetActorNode => ({
  id: 'hero-node',
  type: 'actor',
  name: 'Hero',
  isCollapsed: false,
  spritePath: null,
  x: 2,
  y: 3,
  physicsMode: 'balanced',
  followCamera: false,
  children: [],
  ...overrides
})

const createCollision = (
  overrides: Partial<SceneAssetCollisionNode> = {}
): SceneAssetCollisionNode => ({
  id: 'wall-node',
  type: 'collision',
  name: 'Wall',
  isCollapsed: false,
  x: 4,
  y: 5,
  width: 6,
  height: 7,
  isBlocking: true,
  callbacks: [],
  exitCallbacks: [],
  children: [],
  ...overrides
})

const createEditor = (
  nodes: SceneAssetNode[],
  overrides: Partial<SceneDocumentEditor> = {}
): SceneDocumentEditor =>
  ({
    nodes,
    selectedNodeId: null,
    updateActor: vi.fn(),
    updateCollision: vi.fn(),
    ...overrides
  }) as SceneDocumentEditor

const renderViewport = (
  editor: SceneDocumentEditor,
  overrides: Partial<Parameters<typeof SceneViewport>[0]> = {}
): ReturnType<typeof render> & {
  props: Parameters<typeof SceneViewport>[0]
  surface: HTMLElement
  world: HTMLDivElement
} => {
  const props: Parameters<typeof SceneViewport>[0] = {
    editor,
    tilemapSize: { width: 20, height: 18 },
    loadError: null,
    spritePreviews: {},
    tilemapDocument: { width: 20, height: 18 },
    tilesetDocumentLoaded: true,
    windowDocument: null,
    windowTilesetDocumentLoaded: true,
    onActorSelect: vi.fn(),
    onCollisionSelect: vi.fn(),
    onViewportBackgroundSelect: vi.fn(),
    onProjectAssetDrop: vi.fn(),
    drawTilemap: vi.fn(),
    drawWindow: vi.fn(),
    ...overrides
  }

  const rendered = render(React.createElement(SceneViewport, props))
  const surface = screen.getByTestId('scene-viewport-surface')
  const world = document.querySelector('.scene-viewport__world') as HTMLDivElement

  Object.defineProperty(surface, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      right: 320,
      bottom: 240,
      width: 320,
      height: 240,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })
  })
  Object.defineProperty(world, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      right: 160,
      bottom: 144,
      width: 160,
      height: 144,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })
  })

  return {
    ...rendered,
    props,
    surface,
    world
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('<SceneViewport /> integration', () => {
  it('handles empty, error, reset, pan, zoom, background, and invalid drop states', async () => {
    const editor = createEditor([])
    const rendered = renderViewport(editor, {
      tilemapSize: null,
      loadError: 'Tilemap failed to load.',
      tilemapDocument: null,
      tilesetDocumentLoaded: false
    })

    expect(screen.getByText('Tilemap failed to load.')).toBeInTheDocument()
    expect(screen.getByText('Load a tilemap to visualize the scene bounds.')).toBeInTheDocument()

    fireEvent.mouseDown(rendered.surface, { button: 1, clientX: 10, clientY: 10 })
    fireEvent.mouseMove(rendered.surface, { clientX: 30, clientY: 35 })
    fireEvent.mouseUp(rendered.surface)
    fireEvent.mouseDown(rendered.surface, { button: 1, clientX: 10, clientY: 10 })
    fireEvent.mouseLeave(rendered.surface)
    fireEvent.wheel(rendered.surface, { deltaY: -10, clientX: 40, clientY: 40 })
    fireEvent.wheel(rendered.surface, { deltaY: 10, clientX: 40, clientY: 40 })
    fireEvent.click(screen.getByRole('button', { name: 'Reset View' }))
    fireEvent.mouseDown(rendered.world, { button: 0 })

    expect(rendered.props.onViewportBackgroundSelect).toHaveBeenCalledTimes(1)

    const invalidDataTransfer = createMockDataTransfer({ kind: 'sprite', path: 'Hero.json' })
    fireEvent.dragEnter(rendered.surface, { dataTransfer: invalidDataTransfer })
    fireEvent.dragOver(rendered.surface, { dataTransfer: invalidDataTransfer })
    fireEvent.drop(rendered.surface, {
      dataTransfer: invalidDataTransfer,
      clientX: 16,
      clientY: 16
    })

    expect(rendered.props.onProjectAssetDrop).not.toHaveBeenCalled()
  })

  it('draws loaded map and window layers, previews actors, and drops project assets', async () => {
    const editor = createEditor([
      createActor({
        id: 'hero-node',
        spritePath: 'Sprites/Hero.rgbsprite.json',
        spritePaletteIndex: 1,
        x: 240 * 16,
        followCamera: true,
        cameraDeadzone: {
          left: 20,
          right: 40,
          top: 20,
          bottom: 20
        }
      }),
      createActor({ id: 'plain-node', name: 'Plain', x: 12, y: 8 }),
      createCollision()
    ])
    const rendered = renderViewport(editor, {
      tilemapSize: { width: 40, height: 36 },
      tilemapDocument: { width: 40, height: 36 },
      spritePreviews: {
        'Sprites/Hero.rgbsprite.json': {
          path: 'Sprites/Hero.rgbsprite.json',
          imageUrl: 'hero-default.png',
          imageUrlsByPalette: ['hero-a.png', 'hero-b.png'],
          width: 16,
          height: 24
        }
      },
      windowDocument: {
        width: 20,
        height: 18,
        windowVisibilityBands: [
          { start: 0, end: 16 },
          { start: 128, end: 144 }
        ]
      }
    })

    await waitFor(() => {
      expect(rendered.props.drawTilemap).toHaveBeenCalledWith(expect.any(HTMLCanvasElement))
      expect(rendered.props.drawWindow).toHaveBeenCalledWith(expect.any(HTMLCanvasElement))
    })
    expect(document.querySelectorAll('.scene-viewport__window-region')).toHaveLength(2)
    expect(screen.getByTitle('Camera follow target')).toBeInTheDocument()
    expect(
      document.querySelector<HTMLDivElement>('.scene-viewport__screen-outline')?.style.left
    ).toBe('128px')
    expect(
      document.querySelector<HTMLImageElement>('.scene-viewport__actor-sprite')?.src
    ).toContain('hero-b.png')
    expect(document.querySelector('.scene-viewport__actor-placeholder')).not.toBeNull()

    const dataTransfer = createMockDataTransfer({
      kind: 'actor',
      path: 'Actors/Hero.rgbactor.json'
    })

    fireEvent.dragEnter(rendered.surface, { dataTransfer })
    expect(rendered.surface).toHaveClass('scene-viewport__surface--drop-active')
    fireEvent.dragOver(rendered.surface, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('copy')
    fireEvent.dragLeave(rendered.surface, { dataTransfer })
    expect(rendered.surface).not.toHaveClass('scene-viewport__surface--drop-active')
    fireEvent.dragEnter(rendered.surface, { dataTransfer })
    fireEvent.drop(rendered.surface, { dataTransfer, clientX: 32, clientY: 24 })

    expect(rendered.props.onProjectAssetDrop).toHaveBeenCalledWith(
      { kind: 'actor', path: 'Actors/Hero.rgbactor.json' },
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number)
      })
    )
  })

  it('selects actors and commits drag movement only when the actor changes position', async () => {
    const updateActor = vi.fn()
    const onActorSelect = vi.fn()
    const editor = createEditor([createActor()], {
      selectedNodeId: 'hero-node',
      updateActor
    })
    const rendered = renderViewport(editor, { onActorSelect })
    const actorButton = document.querySelector('.scene-viewport__actor') as HTMLButtonElement

    fireEvent.mouseDown(actorButton, { button: 1, clientX: 16, clientY: 24 })
    expect(onActorSelect).not.toHaveBeenCalled()

    fireEvent.click(actorButton)
    expect(onActorSelect).toHaveBeenCalledWith('hero-node')

    fireEvent.mouseDown(actorButton, { button: 0, clientX: 16, clientY: 24 })
    fireEvent.pointerUp(window)
    expect(updateActor).not.toHaveBeenCalled()

    fireEvent.mouseDown(actorButton, { button: 0, clientX: 16, clientY: 24 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 48 })
    fireEvent.pointerUp(window)

    expect(updateActor).toHaveBeenCalledWith(
      'hero-node',
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number)
      })
    )
    expect(updateActor.mock.calls[0][1]).not.toEqual({ x: 2, y: 3 })
    fireEvent.mouseDown(rendered.world, { button: 2 })
    expect(rendered.props.onViewportBackgroundSelect).not.toHaveBeenCalled()
  })

  it('selects, moves, and resizes collision boxes through every corner handle', () => {
    const updateCollision = vi.fn()
    const onCollisionSelect = vi.fn()
    const editor = createEditor([createCollision()], {
      selectedNodeId: 'wall-node',
      updateCollision
    })
    const rendered = renderViewport(editor, { onCollisionSelect })
    const collision = screen.getByTestId('scene-collision-wall-node')

    fireEvent.mouseDown(collision, { button: 2, clientX: 32, clientY: 40 })
    expect(onCollisionSelect).not.toHaveBeenCalled()

    fireEvent.click(collision)
    expect(onCollisionSelect).toHaveBeenCalledWith('wall-node')

    fireEvent.mouseDown(collision, { button: 0, clientX: 32, clientY: 40 })
    fireEvent.pointerMove(window, { clientX: 48, clientY: 56 })
    fireEvent.pointerUp(window)
    expect(updateCollision).toHaveBeenCalledWith(
      'wall-node',
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number)
      })
    )
    rendered.unmount()

    const movements = [
      { handleIndex: 0, point: { clientX: 16, clientY: 16 } },
      { handleIndex: 1, point: { clientX: 96, clientY: 16 } },
      { handleIndex: 2, point: { clientX: 16, clientY: 96 } },
      { handleIndex: 3, point: { clientX: 96, clientY: 96 } }
    ]

    for (const movement of movements) {
      const resizeEditor = createEditor([createCollision()], {
        selectedNodeId: 'wall-node',
        updateCollision
      })
      const resizeRendered = renderViewport(resizeEditor)
      const resizeHandles = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.scene-viewport__collision-handle')
      )

      expect(resizeHandles).toHaveLength(4)
      fireEvent.mouseDown(resizeHandles[movement.handleIndex], {
        button: 0,
        clientX: 32,
        clientY: 40
      })
      fireEvent.pointerMove(window, movement.point)
      fireEvent.pointerUp(window)
      resizeRendered.unmount()
    }

    expect(updateCollision).toHaveBeenCalledTimes(5)
    for (const [, nextRect] of updateCollision.mock.calls) {
      expect(nextRect).toEqual(
        expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number)
        })
      )
    }
  })
})
