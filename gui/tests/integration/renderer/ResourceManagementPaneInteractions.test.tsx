import React, { createRef } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ResourceManagementPane,
  type ResourceManagementPaneHandle
} from '../../../src/renderer/src/components/Docking/ResourceManagementPane'
import type {
  ProjectResourceItem,
  ProjectResourceView
} from '../../../src/shared/projectResourceModels'

const PROJECT_PATH = '/projects/Alpha'

const folderResource = (
  name: string,
  path = name,
  parentPath: string | null = null,
  extra: Partial<Extract<ProjectResourceItem, { type: 'folder' }>> = {}
): ProjectResourceItem => ({
  type: 'folder',
  id: `folder-${path}`,
  name,
  path,
  parentPath,
  ...extra
})

const fileResource = (
  name: string,
  path: string,
  resourceType: Extract<ProjectResourceItem, { type: 'file' }>['resourceType'],
  extra: Partial<Extract<ProjectResourceItem, { type: 'file' }>> = {}
): ProjectResourceItem => ({
  type: 'file',
  id: `file-${path}`,
  name,
  fileName: path.split('/').at(-1) ?? path,
  path,
  parentPath: path.includes('/') ? path.split('/').slice(0, -1).join('/') : null,
  extension: 'json',
  resourceType,
  ...extra
})

const createView = (items: ProjectResourceItem[] = [], currentPath = ''): ProjectResourceView => ({
  projectName: 'Alpha',
  projectPath: PROJECT_PATH,
  currentPath,
  parentPath: currentPath ? '' : null,
  startingScenePath: 'Scenes/Intro.rgbscene.json',
  items
})

const renderPane = (
  props: Partial<React.ComponentProps<typeof ResourceManagementPane>> = {},
  ref?: React.Ref<ResourceManagementPaneHandle>
) => render(<ResourceManagementPane projectPath={PROJECT_PATH} {...props} ref={ref} />)

const getResourceButton = async (name: string): Promise<HTMLButtonElement> => {
  const label = await screen.findByText(name)
  const button = label.closest('button')

  if (!button) {
    throw new Error(`Expected ${name} to render inside a resource button.`)
  }

  return button
}

const openResourceMenu = async (name: string) => {
  fireEvent.contextMenu(await getResourceButton(name), { clientX: 100, clientY: 120 })
}

describe('<ResourceManagementPane /> integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.api.getProjectResources).mockResolvedValue(createView())
    vi.mocked(window.api.openProjectAssetEditor).mockResolvedValue(true)
    vi.mocked(window.api.openProjectScriptEditor).mockResolvedValue(true)
    vi.mocked(window.api.showProjectResourceInFileExplorer).mockResolvedValue(true)
    vi.mocked(window.api.finalizeDeletedProjectResource).mockResolvedValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the no-project state and keeps imperative creation disabled without a project path', async () => {
    const ref = createRef<ResourceManagementPaneHandle>()
    render(<ResourceManagementPane projectPath="" ref={ref} />)

    expect(
      await screen.findByText('This window was opened without a project path.')
    ).toBeInTheDocument()
    expect(window.api.getProjectResources).not.toHaveBeenCalled()

    ref.current?.createResource('folder')
    ref.current?.createScriptResource('general')
    expect(window.api.createProjectResource).not.toHaveBeenCalled()
    expect(window.api.createProjectScriptResource).not.toHaveBeenCalled()

    fireEvent.contextMenu(screen.getByTestId('resource-management-pane'), {
      clientX: 80,
      clientY: 120
    })
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'New...' }))
    expect(screen.getByRole('menuitem', { name: 'Folder' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Paste' })).toBeDisabled()
  })

  it('opens folders, scenes, actor notices, script editors, asset editors, and file explorer errors', async () => {
    const onOpenScene = vi.fn()
    const rootItems = [
      folderResource('Sprites'),
      fileResource('Intro', 'Scenes/Intro.rgbscene.json', 'scene'),
      fileResource('Hero Actor', 'Actors/Hero.rgbactor.json', 'actor'),
      fileResource('Boot', 'src/Scripts/Boot.c', null, {
        resourceType: null,
        extension: 'c',
        scriptKind: 'general'
      }),
      fileResource('Hero Sprite', 'Sprites/Hero.rgbsprite.json', 'sprite')
    ]
    vi.mocked(window.api.getProjectResources)
      .mockResolvedValueOnce(createView(rootItems))
      .mockResolvedValueOnce(createView([], 'Sprites'))
      .mockResolvedValueOnce(createView(rootItems, ''))
    vi.mocked(window.api.showProjectResourceInFileExplorer).mockRejectedValueOnce(
      new Error('Cannot reveal resource.')
    )

    renderPane({ onOpenScene })

    fireEvent.doubleClick(await getResourceButton('Sprites'))
    await waitFor(() => {
      expect(window.api.getProjectResources).toHaveBeenCalledWith(PROJECT_PATH, 'Sprites')
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }))
    await waitFor(() => {
      expect(window.api.getProjectResources).toHaveBeenCalledWith(PROJECT_PATH, '')
    })

    fireEvent.doubleClick(await getResourceButton('Intro'))
    expect(onOpenScene).toHaveBeenCalledWith('Scenes/Intro.rgbscene.json')

    fireEvent.doubleClick(await getResourceButton('Hero Actor'))
    expect(
      await screen.findByText('Load actor resources from the scene hierarchy.')
    ).toBeInTheDocument()

    fireEvent.doubleClick(await getResourceButton('Boot'))
    await waitFor(() => {
      expect(window.api.openProjectScriptEditor).toHaveBeenCalledWith(
        PROJECT_PATH,
        'src/Scripts/Boot.c',
        'general'
      )
    })

    fireEvent.doubleClick(await getResourceButton('Hero Sprite'))
    await waitFor(() => {
      expect(window.api.openProjectAssetEditor).toHaveBeenCalledWith(
        'sprite',
        PROJECT_PATH,
        'Sprites/Hero.rgbsprite.json'
      )
    })

    await openResourceMenu('Hero Sprite')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show In File Explorer' }))
    expect(await screen.findByText('Cannot reveal resource.')).toBeInTheDocument()
  })

  it('validates, resets, cancels, and saves resource bank overrides', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue(
      createView([fileResource('Hero', 'Hero.rgbsprite.json', 'sprite', { bank: 23 })])
    )
    vi.mocked(window.api.updateProjectResourceBank).mockResolvedValue({
      resourceType: 'sprite',
      resourcePath: 'Hero.rgbsprite.json',
      resourceName: 'Hero',
      parentPath: '',
      bank: 255,
      view: createView([fileResource('Hero', 'Hero.rgbsprite.json', 'sprite', { bank: 255 })])
    })

    renderPane()

    await openResourceMenu('Hero')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bank...' }))
    const dialog = screen.getByRole('dialog')
    const bankInput = within(dialog).getByDisplayValue('23')

    fireEvent.change(bankInput, { target: { value: 'abc' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByText('Bank must be an integer between 0 and 255.')
    ).toBeInTheDocument()

    fireEvent.change(bankInput, { target: { value: '300' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByText('Bank must be an integer between 0 and 255.')
    ).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset To 255' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await openResourceMenu('Hero')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bank...' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset To 255' })
    )
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.updateProjectResourceBank).toHaveBeenCalledWith(
        PROJECT_PATH,
        'sprite',
        'Hero.rgbsprite.json',
        255
      )
    })
    expect(await screen.findByText('Assigned bank 255 to "Hero".')).toBeInTheDocument()
  })

  it('creates script resources through the imperative handle and replays undo and redo history', async () => {
    const ref = createRef<ResourceManagementPaneHandle>()
    vi.mocked(window.api.getProjectResources).mockResolvedValue(createView())
    vi.mocked(window.api.createProjectScriptResource).mockResolvedValue({
      resourceType: 'script',
      resourcePath: 'src/Scripts/New Script.c',
      resourceName: 'New Script',
      parentPath: 'src/Scripts',
      scriptKind: 'general',
      view: createView([
        fileResource('New Script', 'src/Scripts/New Script.c', null, {
          resourceType: null,
          extension: 'c',
          scriptKind: 'general'
        })
      ])
    })
    vi.mocked(window.api.deleteProjectResource).mockResolvedValue({
      resourceType: 'script',
      resourcePath: 'src/Scripts/New Script.c',
      resourceName: 'New Script',
      parentPath: 'src/Scripts',
      scriptKind: 'general',
      deletionId: 'delete-script',
      view: createView()
    })
    vi.mocked(window.api.restoreDeletedProjectResource).mockResolvedValue({
      resourceType: 'script',
      resourcePath: 'src/Scripts/New Script.c',
      resourceName: 'New Script',
      parentPath: 'src/Scripts',
      scriptKind: 'general',
      view: createView([
        fileResource('New Script', 'src/Scripts/New Script.c', null, {
          resourceType: null,
          extension: 'c',
          scriptKind: 'general'
        })
      ])
    })

    renderPane({}, ref)
    await waitFor(() => {
      expect(window.api.getProjectResources).toHaveBeenCalled()
    })

    ref.current?.createScriptResource('general')
    const renameInput = await screen.findByLabelText('General Script name for New Script')
    fireEvent.blur(renameInput)
    await waitFor(() => {
      expect(window.api.createProjectScriptResource).toHaveBeenCalledWith(PROJECT_PATH, 'general')
    })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => {
      expect(window.api.deleteProjectResource).toHaveBeenCalledWith(
        PROJECT_PATH,
        'script',
        'src/Scripts/New Script.c',
        undefined
      )
    })

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    await waitFor(() => {
      expect(window.api.restoreDeletedProjectResource).toHaveBeenCalledWith(
        PROJECT_PATH,
        'delete-script'
      )
    })
  })

  it('only enables pasting a cut script inside its intended script root', async () => {
    const actorScript = fileResource('Hero Actor Script', 'src/CustomActors/HeroActor.c', null, {
      resourceType: null,
      extension: 'c',
      scriptKind: 'actor'
    })
    const nestedActorFolder = folderResource(
      'Enemies',
      'src/CustomActors/Enemies',
      'src/CustomActors'
    )

    vi.mocked(window.api.getProjectResources)
      .mockResolvedValueOnce(createView([actorScript, nestedActorFolder]))
      .mockResolvedValueOnce(createView([], 'src/CustomActors/Enemies'))

    renderPane()

    fireEvent.click(await getResourceButton('Hero Actor Script'))
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true })

    fireEvent.contextMenu(screen.getByTestId('resource-management-pane'), {
      clientX: 80,
      clientY: 120
    })
    expect(screen.getByRole('menuitem', { name: 'Paste' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'Escape' })

    fireEvent.doubleClick(await getResourceButton('Enemies'))
    await waitFor(() => {
      expect(window.api.getProjectResources).toHaveBeenCalledWith(
        PROJECT_PATH,
        'src/CustomActors/Enemies'
      )
    })

    fireEvent.contextMenu(screen.getByTestId('resource-management-pane'), {
      clientX: 80,
      clientY: 120
    })
    expect(screen.getByRole('menuitem', { name: 'Paste' })).not.toBeDisabled()
  })

  it('copies, pastes, undoes, and redoes a resource transfer with hidden deletion restore', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue(
      createView([fileResource('Hero', 'Hero.rgbsprite.json', 'sprite')])
    )
    vi.mocked(window.api.transferProjectResource).mockResolvedValue({
      resourceType: 'sprite',
      resourcePath: 'Hero Copy.rgbsprite.json',
      resourceName: 'Hero Copy',
      parentPath: '',
      view: createView([
        fileResource('Hero', 'Hero.rgbsprite.json', 'sprite'),
        fileResource('Hero Copy', 'Hero Copy.rgbsprite.json', 'sprite')
      ])
    })
    vi.mocked(window.api.deleteProjectResource).mockResolvedValue({
      resourceType: 'sprite',
      resourcePath: 'Hero Copy.rgbsprite.json',
      resourceName: 'Hero Copy',
      parentPath: '',
      deletionId: 'delete-copy',
      view: createView([fileResource('Hero', 'Hero.rgbsprite.json', 'sprite')])
    })
    vi.mocked(window.api.restoreDeletedProjectResource).mockResolvedValue({
      resourceType: 'sprite',
      resourcePath: 'Hero Copy.rgbsprite.json',
      resourceName: 'Hero Copy',
      parentPath: '',
      view: createView([
        fileResource('Hero', 'Hero.rgbsprite.json', 'sprite'),
        fileResource('Hero Copy', 'Hero Copy.rgbsprite.json', 'sprite')
      ])
    })

    renderPane()
    fireEvent.click(await getResourceButton('Hero'))
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

    await waitFor(() => {
      expect(window.api.transferProjectResource).toHaveBeenCalledWith(
        PROJECT_PATH,
        'sprite',
        'Hero.rgbsprite.json',
        '',
        'copy'
      )
    })
    expect(await screen.findByText('Hero Copy')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => {
      expect(window.api.deleteProjectResource).toHaveBeenCalledWith(
        PROJECT_PATH,
        'sprite',
        'Hero Copy.rgbsprite.json',
        undefined
      )
    })

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    await waitFor(() => {
      expect(window.api.restoreDeletedProjectResource).toHaveBeenCalledWith(
        PROJECT_PATH,
        'delete-copy'
      )
    })
  })

  it('shows paste only on folders and pastes into the right-clicked folder', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue(
      createView([fileResource('Hero', 'Hero.rgbsprite.json', 'sprite'), folderResource('Sprites')])
    )
    vi.mocked(window.api.transferProjectResource).mockResolvedValue({
      resourceType: 'sprite',
      resourcePath: 'Sprites/Hero Copy.rgbsprite.json',
      resourceName: 'Hero Copy',
      parentPath: 'Sprites',
      view: createView([
        fileResource('Hero', 'Hero.rgbsprite.json', 'sprite'),
        folderResource('Sprites')
      ])
    })

    renderPane()
    fireEvent.click(await getResourceButton('Hero'))
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })

    await openResourceMenu('Hero')
    expect(screen.queryByRole('menuitem', { name: 'Paste' })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })

    await openResourceMenu('Sprites')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste' }))

    await waitFor(() => {
      expect(window.api.transferProjectResource).toHaveBeenCalledWith(
        PROJECT_PATH,
        'sprite',
        'Hero.rgbsprite.json',
        'Sprites',
        'copy'
      )
    })
  })

  it('warns when changing project code folders', async () => {
    vi.mocked(window.api.getProjectResources).mockResolvedValue(
      createView([
        folderResource('src'),
        folderResource('Source', 'Source', null, { hasScriptDescendants: true })
      ])
    )

    renderPane()

    await openResourceMenu('src')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(
      await screen.findByText(
        'Changing this code folder can break script paths and includes. Engine core files stay protected.'
      )
    ).toBeInTheDocument()

    fireEvent.keyDown(screen.getByLabelText('Folder name for src'), { key: 'Escape' })
    await openResourceMenu('src')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(
      within(screen.getByRole('dialog')).getByText(
        'Changing this code folder can break script paths and includes. Engine core files stay protected.'
      )
    ).toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await openResourceMenu('Source')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(
      within(screen.getByRole('dialog')).getByText(
        'Changing this code folder can break script paths and includes. Engine core files stay protected.'
      )
    ).toBeInTheDocument()
  })
})
