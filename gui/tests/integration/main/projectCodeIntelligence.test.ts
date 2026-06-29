import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { walkProjectCodeFiles } from '../../../src/main/projectCodeFiles'
import { getProjectCodeSymbolIndex } from '../../../src/main/projectCodeIntelligence'
import { createProjectStructure } from '../../../src/main/projectLauncher'

const tempDirectories: string[] = []

const createTempProject = async (): Promise<string> => {
  const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-intelligence-'))
  tempDirectories.push(workspaceDirectory)
  const project = await createProjectStructure(workspaceDirectory, 'Alpha')
  return project.path
}

describe('project code intelligence integration', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('walks project C and header files recursively while skipping deleted resources', async () => {
    const projectPath = await createTempProject()
    await mkdir(join(projectPath, 'src', 'engine'), { recursive: true })
    await mkdir(join(projectPath, 'src', '.deleted'), { recursive: true })
    await writeFile(join(projectPath, 'src', 'main.c'), 'void main(void) {}\n', 'utf-8')
    await writeFile(join(projectPath, 'src', 'main.h'), '#pragma once\n', 'utf-8')
    await writeFile(join(projectPath, 'src', 'engine', 'scene.C'), 'void scene(void) {}\n', 'utf-8')
    await writeFile(join(projectPath, 'src', 'engine', 'notes.txt'), 'ignore', 'utf-8')
    await writeFile(join(projectPath, 'src', '.deleted', 'hidden.c'), 'ignore', 'utf-8')

    const files = await walkProjectCodeFiles(join(projectPath, 'src'))

    const normalizedFiles = files.map((file) => file.replace(/\\/g, '/')).sort()

    expect(normalizedFiles).toEqual(
      expect.arrayContaining(['engine/scene.C', 'main.c', 'main.h'])
    )
    expect(normalizedFiles).not.toContain('engine/notes.txt')
    expect(normalizedFiles).not.toContain('.deleted/hidden.c')
  })

  it('indexes project source symbols and returns an empty index when the source tree is missing', async () => {
    const projectPath = await createTempProject()
    await mkdir(join(projectPath, 'src', 'engine'), { recursive: true })
    await writeFile(
      join(projectPath, 'src', 'engine', 'types.h'),
      `
        #define HERO_SPEED 2
        typedef unsigned char UBYTE_ALIAS;
        typedef struct HeroState {
          unsigned char health;
          const char *name;
        } HeroState;
        typedef enum HeroMode { HERO_IDLE, HERO_RUN } HeroMode;
        extern HeroState *activeHero;
      `,
      'utf-8'
    )
    await writeFile(
      join(projectPath, 'src', 'main.c'),
      `
        #include "engine/types.h"
        void updateHero(HeroState *hero, unsigned char frame) BANKED {
          return;
        }
      `,
      'utf-8'
    )

    const index = await getProjectCodeSymbolIndex(projectPath)

    expect(index.sourceFilesScanned).toBeGreaterThanOrEqual(2)
    expect(index.macros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'HERO_SPEED', declaredIn: 'src/engine/types.h' })
      ])
    )
    expect(index.typeAliases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'UBYTE_ALIAS', declaredIn: 'src/engine/types.h' })
      ])
    )
    expect(index.structs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'HeroState', declaredIn: 'src/engine/types.h' })
      ])
    )
    expect(index.enums).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'HeroMode', declaredIn: 'src/engine/types.h' })
      ])
    )
    expect(index.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'activeHero', declaredIn: 'src/engine/types.h' })
      ])
    )
    expect(index.functions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'updateHero', declaredIn: 'src/main.c' })
      ])
    )

    const emptyProjectPath = await createTempProject()
    await rm(join(emptyProjectPath, 'src'), { recursive: true, force: true })

    await expect(getProjectCodeSymbolIndex(emptyProjectPath)).resolves.toMatchObject({
      sourceFilesScanned: 0,
      structs: [],
      enums: [],
      functions: [],
      variables: [],
      macros: [],
      typeAliases: []
    })
  })

  it('indexes generated scene and actor factory helpers from registry headers', async () => {
    const projectPath = await createTempProject()

    const index = await getProjectCodeSymbolIndex(projectPath)

    expect(index.functions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'create_actor',
          returnType: { name: 'Actor', pointerDepth: 1 }
        }),
        expect.objectContaining({
          name: 'create_scene',
          returnType: { name: 'Scene', pointerDepth: 1 }
        })
      ])
    )
  })
})
