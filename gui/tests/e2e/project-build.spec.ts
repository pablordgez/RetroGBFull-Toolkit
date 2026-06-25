import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import {
  buildAndCompileFromMenu,
  createProjectThroughLauncher,
  createSmileyGameThroughGui,
  expect,
  test,
  workspaceStatus
} from './fixtures'

test.describe('project build and compile', () => {
  test('creates a smiley actor scene with a dark tile background and compiles it', async ({
    electronApp,
    page,
    workspaceDir
  }) => {
    const { projectPath, projectWindow } = await createProjectThroughLauncher(
      electronApp,
      page,
      workspaceDir,
      'HappyPathGame'
    )
    await createSmileyGameThroughGui(electronApp, projectWindow)

    const resourcePane = projectWindow.getByTestId('resource-management-pane')
    await expect(resourcePane.getByRole('button', { name: 'Smiley', exact: true })).toBeVisible()
    await expect(resourcePane.getByRole('button', { name: 'Dark', exact: true })).toBeVisible()
    await expect(resourcePane.getByRole('button', { name: 'DarkRoom', exact: true })).toBeVisible()
    await expect(resourcePane.getByRole('button', { name: 'Room START', exact: true })).toBeVisible()

    await buildAndCompileFromMenu(projectWindow)

    await expect(workspaceStatus(projectWindow)).toContainText(
      'Built project code and compiled obj/HappyPathGame.gb.',
      { timeout: 60_000 }
    )
    await expect
      .poll(async () =>
        stat(join(projectPath, 'obj', 'HappyPathGame.gb'))
          .then(() => true)
          .catch(() => false)
      )
      .toBe(true)

    const generatedScene = await readFile(
      join(projectPath, 'src', 'CustomScenes', 'Room.c'),
      'utf-8'
    )
    const actorScript = await readFile(
      join(projectPath, 'src', 'CustomActors', 'SmileyMover.c'),
      'utf-8'
    )

    expect(generatedScene).toContain('set_scene_map(maps[darkroom]);')
    expect(generatedScene).toContain('set_actor_animation(animations[smiley]);')
    expect(actorScript).toContain('J_LEFT')
    expect(actorScript).toContain('J_RIGHT')
    expect(actorScript).toContain('J_UP')
    expect(actorScript).toContain('J_DOWN')
  })

  test('compiles the same scene without a background tilemap', async ({
    electronApp,
    page,
    workspaceDir
  }) => {
    const { projectPath, projectWindow } = await createProjectThroughLauncher(
      electronApp,
      page,
      workspaceDir,
      'NoBackgroundGame'
    )
    await createSmileyGameThroughGui(electronApp, projectWindow, {
      includeBackground: false
    })

    await expect(
      projectWindow.getByText('Load a tilemap to visualize the scene bounds.')
    ).toBeVisible()

    await buildAndCompileFromMenu(projectWindow)

    await expect(workspaceStatus(projectWindow)).toContainText(
      'Built project code and compiled obj/NoBackgroundGame.gb.',
      { timeout: 60_000 }
    )

    const generatedScene = await readFile(
      join(projectPath, 'src', 'CustomScenes', 'Room.c'),
      'utf-8'
    )
    expect(generatedScene).not.toContain('set_scene_map(')
  })

  test('reports compile output when actor code has errors', async ({
    electronApp,
    page,
    workspaceDir
  }) => {
    const { projectPath, projectWindow } = await createProjectThroughLauncher(
      electronApp,
      page,
      workspaceDir,
      'CodeErrorGame'
    )
    await createSmileyGameThroughGui(electronApp, projectWindow, {
      compileError: true
    })

    await buildAndCompileFromMenu(projectWindow)

    await expect(workspaceStatus(projectWindow)).toContainText('Project compilation failed.', {
      timeout: 60_000
    })
    await expect(workspaceStatus(projectWindow)).toContainText(
      'src/CustomActors/BrokenActor.c:1: error: expected expression'
    )
  })

  test('directly compiles an empty game', async ({ electronApp, page, workspaceDir }) => {
    const { projectPath, projectWindow } = await createProjectThroughLauncher(
      electronApp,
      page,
      workspaceDir,
      'EmptyGame'
    )

    await expect(
      projectWindow.getByText('Create or load a new scene to start working')
    ).toBeVisible()

    await buildAndCompileFromMenu(projectWindow)

    await expect(workspaceStatus(projectWindow)).toContainText(
      'Built project code and compiled obj/EmptyGame.gb.',
      { timeout: 60_000 }
    )
    await expect
      .poll(async () =>
        stat(join(projectPath, 'obj', 'EmptyGame.gb'))
          .then(() => true)
          .catch(() => false)
      )
      .toBe(true)
  })

  test('fails after deleting the tileset used by the tilemap', async ({
    electronApp,
    page,
    workspaceDir
  }) => {
    const { projectPath, projectWindow } = await createProjectThroughLauncher(
      electronApp,
      page,
      workspaceDir,
      'MissingTilesetGame'
    )
    await createSmileyGameThroughGui(electronApp, projectWindow)

    await projectWindow.getByText('Dark', { exact: true }).click({ button: 'right' })
    await projectWindow.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(projectWindow.getByRole('dialog')).toContainText('Delete "Dark"?')
    await projectWindow.getByRole('button', { name: 'Delete' }).click()
    await expect(projectWindow.getByText('Dark', { exact: true })).toBeHidden()

    await buildAndCompileFromMenu(projectWindow)

    await expect(workspaceStatus(projectWindow)).toContainText(
      'Tilemap "DarkRoom" does not have a tileset assigned.',
      { timeout: 60_000 }
    )
  })
})
