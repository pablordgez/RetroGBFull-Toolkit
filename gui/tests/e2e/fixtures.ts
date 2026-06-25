import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, join } from 'path'

type ToolchainFixture = {
  gbdkPath: string
  makePath: string
  root: string
}

type E2eFixtures = {
  electronApp: ElectronApplication
  page: Page
  toolchains: ToolchainFixture
  workspaceDir: string
}

type ProjectVariant = {
  compileError?: boolean
  includeBackground?: boolean
}

const createFakeGbdk = async (root: string): Promise<string> => {
  const gbdkPath = join(root, 'gbdk')
  const binPath = join(gbdkPath, 'bin')

  await mkdir(join(gbdkPath, 'include'), { recursive: true })
  await mkdir(join(gbdkPath, 'lib'), { recursive: true })
  await mkdir(binPath, { recursive: true })
  await writeFile(join(binPath, process.platform === 'win32' ? 'lcc.exe' : 'lcc'), '', 'utf-8')

  return gbdkPath
}

const createFakeMake = async (root: string): Promise<string> => {
  const makePath = join(root, 'make')
  const binPath = join(makePath, 'bin')
  const nodeExecutable = process.execPath.replace(/\\/g, '\\\\')
  const scriptPath = join(binPath, 'fake-make.js')

  await mkdir(binPath, { recursive: true })
  await writeFile(
    scriptPath,
    [
      "const { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } = require('fs');",
      "const { basename, join } = require('path');",
      '',
      'const walkFiles = (directory) => {',
      '  try {',
      '    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {',
      '      const path = join(directory, entry.name);',
      '      return entry.isDirectory() ? walkFiles(path) : [path];',
      '    });',
      '  } catch {',
      '    return [];',
      '  }',
      '};',
      '',
      "if (process.argv.includes('--version')) {",
      "  console.log('GNU Make 4.4.1-e2e');",
      '  process.exit(0);',
      '}',
      '',
      "if (process.argv.includes('clean')) {",
      "  rmSync(join(process.cwd(), 'obj'), { recursive: true, force: true });",
      '  process.exit(0);',
      '}',
      '',
      "for (const file of walkFiles(join(process.cwd(), 'src'))) {",
      "  if (!file.toLowerCase().endsWith('.c')) {",
      '    continue;',
      '  }',
      '',
      "  if (readFileSync(file, 'utf-8').includes('RETROGBFULL_E2E_COMPILE_ERROR')) {",
      "    console.error('src/CustomActors/BrokenActor.c:1: error: expected expression');",
      '    process.exit(2);',
      '  }',
      '}',
      '',
      "mkdirSync(join(process.cwd(), 'obj'), { recursive: true });",
      "writeFileSync(join(process.cwd(), 'obj', `${basename(process.cwd())}.gb`), 'fake rom\\n', 'utf-8');",
      "console.log('Build complete.');",
      ''
    ].join('\n'),
    'utf-8'
  )

  if (process.platform === 'win32') {
    await writeFile(
      join(binPath, 'make.cmd'),
      `@echo off\r\n"${nodeExecutable}" "%~dp0fake-make.js" %*\r\n`,
      'utf-8'
    )
  } else {
    const makeExecutablePath = join(binPath, 'make')
    await writeFile(
      makeExecutablePath,
      `#!/usr/bin/env sh\n"${process.execPath}" "$(dirname "$0")/fake-make.js" "$@"\n`,
      'utf-8'
    )
    await chmod(makeExecutablePath, 0o755)
  }

  return makePath
}

const withoutElectronRunAsNode = (): NodeJS.ProcessEnv => {
  const env = { ...process.env }
  delete env['ELECTRON_RUN_AS_NODE']
  delete env['ELECTRON_RENDERER_URL']
  return env
}

const configureNativeShellForE2e = async (
  electronApp: ElectronApplication,
  workspaceDir: string
): Promise<void> => {
  await electronApp.evaluate(
    async ({ dialog, shell }, selectedDirectory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selectedDirectory]
      })
      shell.showItemInFolder = () => undefined
      shell.openExternal = async () => true
      shell.openPath = async () => ''
    },
    workspaceDir
  )
}

export const test = base.extend<E2eFixtures>({
  workspaceDir: async ({}, use) => {
    const workspaceDir = await mkdtemp(join(tmpdir(), 'retrogbfull-e2e-workspace-'))

    try {
      await use(workspaceDir)
    } finally {
      await rm(workspaceDir, { recursive: true, force: true })
    }
  },
  toolchains: async ({}, use) => {
    const root = await mkdtemp(join(tmpdir(), 'retrogbfull-e2e-toolchains-'))
    const gbdkPath = await createFakeGbdk(root)
    const makePath = await createFakeMake(root)

    try {
      await use({ root, gbdkPath, makePath })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  electronApp: async ({ toolchains, workspaceDir }, use) => {
    const electronApp = await electron.launch({
      args: ['.'],
      cwd: process.cwd(),
      env: {
        ...withoutElectronRunAsNode(),
        RETROGBFULL_BUNDLED_GBDK_PATH: toolchains.gbdkPath,
        RETROGBFULL_BUNDLED_MAKE_PATH: toolchains.makePath
      }
    })

    await configureNativeShellForE2e(electronApp, workspaceDir)

    try {
      await use(electronApp)
    } finally {
      await electronApp.close()
    }
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  }
})

export { expect }

const smileyFrame = [
  0, 0, 3, 3, 3, 3, 0, 0, 0, 3, 1, 1, 1, 1, 3, 0, 3, 1, 3, 1, 1, 3, 1, 3, 3, 1, 1, 1, 1, 1, 1, 3, 3,
  1, 3, 1, 1, 3, 1, 3, 3, 1, 1, 3, 3, 1, 1, 3, 0, 3, 1, 1, 1, 1, 3, 0, 0, 0, 3, 3, 3, 3, 0, 0
]

const actorScriptSource = (scriptName: string, compileError = false): string =>
  [
    'void AINIT(void) BANKED{',
    `    ${scriptName}* self = (${scriptName}*) THIS_ACTOR;`,
    '    init_actor(&self->base);',
    '}',
    '',
    'void AUPDATE(void) BANKED{',
    compileError
      ? '    RETROGBFULL_E2E_COMPILE_ERROR'
      : [
          '    uint8_t keys = joypad();',
          '    if(keys & J_LEFT){',
          '        THIS_ACTOR->x -= 1;',
          '    }',
          '    if(keys & J_RIGHT){',
          '        THIS_ACTOR->x += 1;',
          '    }',
          '    if(keys & J_UP){',
          '        THIS_ACTOR->y -= 1;',
          '    }',
          '    if(keys & J_DOWN){',
          '        THIS_ACTOR->y += 1;',
          '    }'
        ].join('\n'),
    '}',
    ''
  ].join('\n')

const actorScriptHeader = (scriptName: string): string => [
  `#ifndef ${scriptName.toUpperCase()}_H`,
  `#define ${scriptName.toUpperCase()}_H`,
  '#include "Actor/Actor.h"',
  '',
  'typedef struct {',
  '    Actor base;',
  `} ${scriptName};`,
  '',
  `#endif // ${scriptName.toUpperCase()}_H`,
  ''
].join('\n')

const openResourceEditor = async (
  electronApp: ElectronApplication,
  page: Page,
  resourceName: string
): Promise<Page> => {
  await expect(page.getByText(resourceName, { exact: true })).toBeVisible()

  const editorWindowPromise = electronApp.waitForEvent('window')
  await page.getByText(resourceName, { exact: true }).dblclick()
  const editorWindow = await editorWindowPromise

  await editorWindow.waitForLoadState('domcontentloaded')
  return editorWindow
}

const saveEditorWindow = async (editorWindow: Page): Promise<void> => {
  const saveButton = editorWindow.getByRole('button', { name: /^Save\*?$/ }).last()
  await expect(saveButton).toBeEnabled()
  await saveButton.click()
  await expect(editorWindow.getByRole('button', { name: /^Save$/ }).last()).toBeEnabled({
    timeout: 10_000
  })
}

const closeEditorWindow = async (editorWindow: Page): Promise<void> => {
  await editorWindow.close()
}

const saveAndCloseEditorWindow = async (editorWindow: Page): Promise<void> => {
  await saveEditorWindow(editorWindow)
  await closeEditorWindow(editorWindow)
}

const selectPaletteColor = async (editorWindow: Page, colorIndex: number): Promise<void> => {
  await editorWindow.locator(`.palette-swatch[title^="Index ${colorIndex} "]`).click()
}

const getPixelCanvasLayout = async (
  editorWindow: Page,
  testId: string,
  contentWidth: number,
  contentHeight: number
): Promise<{ panX: number; panY: number; scale: number }> => {
  const canvas = editorWindow.getByTestId(testId)
  await expect(canvas).toBeVisible()
  await expect
    .poll(async () => {
      const size = await canvas.evaluate((element) => ({
        width: (element as HTMLCanvasElement).width,
        height: (element as HTMLCanvasElement).height
      }))

      return size.width > 0 && size.height > 0
    })
    .toBe(true)

  const size = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height
  }))
  const rawScale = Math.min((size.width - 40) / contentWidth, (size.height - 40) / contentHeight)
  const scale = Math.max(1, rawScale >= 1 ? Math.floor(rawScale) : rawScale)

  return {
    scale,
    panX: (size.width - contentWidth * scale) / 2,
    panY: (size.height - contentHeight * scale) / 2
  }
}

const clickPixel = async (
  editorWindow: Page,
  testId: string,
  layout: { panX: number; panY: number; scale: number },
  x: number,
  y: number
): Promise<void> => {
  await editorWindow.getByTestId(testId).click({
    position: {
      x: layout.panX + (x + 0.5) * layout.scale,
      y: layout.panY + (y + 0.5) * layout.scale
    }
  })
}

const drawSpriteThroughGui = async (
  electronApp: ElectronApplication,
  page: Page
): Promise<void> => {
  const editorWindow = await openResourceEditor(electronApp, page, 'Smiley')
  const layout = await getPixelCanvasLayout(editorWindow, 'sprite-editor-canvas', 8, 8)

  for (const colorIndex of [3, 1]) {
    await selectPaletteColor(editorWindow, colorIndex)

    for (const [index, pixelColor] of smileyFrame.entries()) {
      if (pixelColor !== colorIndex) {
        continue
      }

      await clickPixel(editorWindow, 'sprite-editor-canvas', layout, index % 8, Math.floor(index / 8))
    }
  }

  await saveAndCloseEditorWindow(editorWindow)
}

const drawTilesetThroughGui = async (
  electronApp: ElectronApplication,
  page: Page
): Promise<void> => {
  const editorWindow = await openResourceEditor(electronApp, page, 'Dark')
  const layout = await getPixelCanvasLayout(editorWindow, 'tileset-editor-canvas', 8, 8)

  await selectPaletteColor(editorWindow, 3)
  await editorWindow.getByRole('button', { name: 'Fill' }).click()
  await clickPixel(editorWindow, 'tileset-editor-canvas', layout, 4, 4)
  await saveAndCloseEditorWindow(editorWindow)
}

const chooseModalOption = async (page: Page, optionName: string): Promise<void> => {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button').filter({ hasText: optionName }).first().click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
}

const configureTilemapThroughGui = async (
  electronApp: ElectronApplication,
  page: Page
): Promise<void> => {
  const editorWindow = await openResourceEditor(electronApp, page, 'DarkRoom')
  await chooseModalOption(editorWindow, 'Dark')
  await expect(editorWindow.getByRole('button', { name: 'Select Tileset' })).toBeVisible()
  await saveAndCloseEditorWindow(editorWindow)
}

const replaceMonacoContent = async (editorWindow: Page, source: string): Promise<void> => {
  await expect(editorWindow.locator('.monaco-editor')).toBeVisible()
  await editorWindow.locator('.monaco-editor').click()
  await editorWindow.keyboard.press('ControlOrMeta+A')
  await editorWindow.keyboard.insertText(source)
}

const editActorScriptThroughGui = async (
  electronApp: ElectronApplication,
  page: Page,
  scriptName: string,
  compileError: boolean
): Promise<void> => {
  const editorWindow = await openResourceEditor(electronApp, page, scriptName)

  await replaceMonacoContent(editorWindow, actorScriptSource(scriptName, compileError))
  await editorWindow.getByRole('button', { name: `${scriptName}.h` }).click()
  await replaceMonacoContent(editorWindow, actorScriptHeader(scriptName))
  await saveAndCloseEditorWindow(editorWindow)
}

const fillSceneActorAxis = async (
  page: Page,
  axis: 'X' | 'Y',
  value: string
): Promise<void> => {
  const inspector = page.getByTestId('project-workspace-scene-inspector')
  const input = inspector
    .locator('.scene-inspector-pane__coords label')
    .filter({ hasText: axis })
    .locator('input')
  await input.fill(value)
  await input.press('Enter')
}

const configureSceneThroughGui = async (
  page: Page,
  scriptName: string,
  includeBackground: boolean
): Promise<void> => {
  await page.getByText('Room', { exact: true }).dblclick()
  await expect(page.getByTestId('project-workspace-scene-sidebar')).toBeVisible()

  if (includeBackground) {
    await page.getByTestId('project-workspace-scene-inspector').getByRole('button', {
      name: 'Select Tilemap'
    }).click()
    await chooseModalOption(page, 'DarkRoom')
  }

  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('menuitem', { name: 'Actor' }).click()

  const actorNameInput = page.getByLabel('Name for Actor')
  await expect(actorNameInput).toBeVisible()
  await actorNameInput.fill('Smiley')
  await actorNameInput.press('Enter')
  await expect(page.getByTestId('project-workspace-scene-sidebar').getByRole('treeitem', {
    name: 'Smiley'
  })).toBeVisible()

  const inspector = page.getByTestId('project-workspace-scene-inspector')

  await inspector.getByRole('button', { name: 'Select Sprite' }).click()
  await chooseModalOption(page, 'Smiley')

  await inspector.getByRole('button', { name: 'Select Actor Script' }).click()
  await chooseModalOption(page, scriptName)

  await fillSceneActorAxis(page, 'X', '32')
  await fillSceneActorAxis(page, 'Y', '40')

  const sceneSaveButton = page
    .getByTestId('project-workspace-scene-sidebar')
    .getByRole('button', { name: /^Save$/ })
  await expect(sceneSaveButton).toBeEnabled()
  await sceneSaveButton.click()
  await expect(page.getByTestId('project-workspace-scene-sidebar')).toContainText('Saved.', {
    timeout: 10_000
  })
}

const createResourceFromMenu = async (
  page: Page,
  menuItemName: string,
  resourceName: string
): Promise<void> => {
  await page.getByRole('menuitem', { name: /^Create$/ }).click()
  await page.getByRole('menuitem', { name: menuItemName, exact: true }).click()

  const renameInput = page.locator('.resource-management-pane__item input').last()
  await expect(renameInput).toBeVisible()
  await renameInput.fill(resourceName)
  await renameInput.press('Enter')
  await expect(page.getByText(resourceName, { exact: true })).toBeVisible()
}

const createActorScriptFromMenu = async (page: Page, scriptName: string): Promise<void> => {
  await page.getByRole('menuitem', { name: /^Create$/ }).click()
  const scriptMenuItem = page.getByRole('menuitem', { name: 'Script', exact: true })
  const actorScriptMenuItem = page.getByRole('menuitem', { name: 'Actor Script', exact: true })

  await scriptMenuItem.hover()

  if (!(await actorScriptMenuItem.isVisible().catch(() => false))) {
    await scriptMenuItem.click()
  }

  await expect(actorScriptMenuItem).toBeVisible()
  await actorScriptMenuItem.click()

  const renameInput = page.locator('.resource-management-pane__item input').last()
  await expect(renameInput).toBeVisible()
  await renameInput.fill(scriptName)
  await renameInput.press('Enter')
  await expect(page.getByText(scriptName, { exact: true })).toBeVisible()
}

const navigateToResourceRoot = async (page: Page): Promise<void> => {
  const pathLabel = page.locator(
    '[data-testid="resource-management-pane"] .resource-management-pane__path'
  )

  for (let depth = 0; depth < 4; depth += 1) {
    const currentPath = (await pathLabel.textContent())?.trim()

    if (currentPath === '/') {
      return
    }

    const backButton = page.getByRole('button', { name: /^Back$/ })

    if (!(await backButton.isVisible().catch(() => false))) {
      return
    }

    await expect(backButton).toBeEnabled()
    await backButton.click()
    await expect.poll(async () => (await pathLabel.textContent())?.trim()).not.toBe(currentPath)
  }

  await expect(pathLabel).toHaveText('/')
}

const setSceneAsStartingScene = async (page: Page, sceneName: string): Promise<void> => {
  await page.getByText(sceneName, { exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Set As Starting Scene' }).click()
  await expect(page.getByText('START', { exact: true })).toBeVisible()
}

export const createProjectThroughLauncher = async (
  electronApp: ElectronApplication,
  launcherWindow: Page,
  workspaceDir: string,
  projectName: string
): Promise<{ projectPath: string; projectWindow: Page }> => {
  const projectPath = join(workspaceDir, projectName)

  await expect(launcherWindow.getByRole('button', { name: 'Create' })).toBeVisible()
  await launcherWindow.getByRole('button', { name: 'Create' }).click()
  await expect(launcherWindow.getByText('New Workspace')).toBeVisible()
  await launcherWindow.getByLabel('Project Name').fill(projectName)

  const projectWindowPromise = electronApp.waitForEvent('window')
  await launcherWindow.getByRole('button', { name: 'Create Project' }).click()
  const projectWindow = await projectWindowPromise

  await projectWindow.waitForLoadState('domcontentloaded')
  await expect(projectWindow.getByText(projectName).first()).toBeVisible()

  return { projectPath, projectWindow }
}

export const createSmileyGameThroughGui = async (
  electronApp: ElectronApplication,
  page: Page,
  variant: ProjectVariant = {}
): Promise<void> => {
  const includeBackground = variant.includeBackground ?? true
  const scriptName = variant.compileError ? 'BrokenActor' : 'SmileyMover'

  await createResourceFromMenu(page, 'Sprite', 'Smiley')
  await createResourceFromMenu(page, 'Tileset', 'Dark')
  await createResourceFromMenu(page, 'Tilemap', 'DarkRoom')
  await createResourceFromMenu(page, 'Scene', 'Room')
  await createActorScriptFromMenu(page, scriptName)
  await editActorScriptThroughGui(electronApp, page, scriptName, Boolean(variant.compileError))
  await navigateToResourceRoot(page)
  await drawSpriteThroughGui(electronApp, page)
  await drawTilesetThroughGui(electronApp, page)
  await configureTilemapThroughGui(electronApp, page)
  await setSceneAsStartingScene(page, 'Room')
  await configureSceneThroughGui(page, scriptName, includeBackground)
}

export const buildAndCompileFromMenu = async (page: Page): Promise<void> => {
  await page.getByRole('menuitem', { name: /^Build$/ }).click()
  await page.getByRole('menuitem', { name: 'Build + Compile' }).click()

  const proceedWithoutSaving = page.getByRole('button', { name: 'Proceed Without Saving' })

  try {
    await proceedWithoutSaving.waitFor({ state: 'visible', timeout: 500 })
    await proceedWithoutSaving.click()
  } catch {
    // Most tests compile cleanly from disk. Open scene-editor tests may surface this prompt.
  }
}

export const workspaceStatus = (page: Page) => page.locator('.project-workspace__status')

export const romExists = async (projectPath: string): Promise<boolean> => {
  return stat(join(projectPath, 'obj', `${basename(projectPath)}.gb`))
    .then(() => true)
    .catch(() => false)
}
