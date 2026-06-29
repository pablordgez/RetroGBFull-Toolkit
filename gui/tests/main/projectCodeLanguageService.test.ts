import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureProjectDirectory, walkProjectCodeFiles } from '../../src/main/projectCodeFiles'
import { getProjectCodeWorkspaceSnapshot } from '../../src/main/projectCodeLanguageService'
import {
  PROJECT_CODE_WORKSPACE_ROOT,
  PROJECT_CODE_WORKSPACE_STUB_ROOT
} from '../../src/shared/projectCodeWorkspace'

vi.mock('../../src/main/projectCodeFiles', () => ({
  ensureProjectDirectory: vi.fn(),
  walkProjectCodeFiles: vi.fn()
}))

const tempDirectories: string[] = []

describe('projectCodeLanguageService', () => {
  beforeEach(() => {
    vi.mocked(ensureProjectDirectory).mockReset()
    vi.mocked(walkProjectCodeFiles).mockReset()
  })

  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('provides clangd stubs for banked script preambles and text macros', async () => {
    vi.mocked(ensureProjectDirectory).mockResolvedValue('C:/Project')
    vi.mocked(walkProjectCodeFiles).mockRejectedValue(
      Object.assign(new Error('missing directory'), { code: 'ENOENT' })
    )

    const snapshot = await getProjectCodeWorkspaceSnapshot('C:/Project')
    const gbHeader = snapshot.files.find(
      (file) => file.path === `${PROJECT_CODE_WORKSPACE_STUB_ROOT}/gb/gb.h`
    )
    const farPtrHeader = snapshot.files.find(
      (file) => file.path === `${PROJECT_CODE_WORKSPACE_STUB_ROOT}/gbdk/far_ptr.h`
    )

    expect(gbHeader?.content).toContain('#define BANKREF(name) extern const void* name;')
    expect(gbHeader?.content).toContain('#define BANKREF_EXTERN(name) extern const void* name;')
    expect(gbHeader?.content).toContain('extern uint8_t _current_bank;')
    expect(farPtrHeader?.content).toContain('#include <gb/gb.h>')
  })

  it('includes registry factory declarations in the clangd workspace snapshot', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'retrogb-code-workspace-'))
    tempDirectories.push(projectPath)
    await mkdir(join(projectPath, 'src', 'Actor'), { recursive: true })
    await mkdir(join(projectPath, 'src', 'Scene'), { recursive: true })
    await writeFile(
      join(projectPath, 'src', 'Actor', 'ActorRegistry.h'),
      [
        'typedef enum { NUM_ACTORS = 1 } ActorType;',
        'struct Actor;',
        'struct Actor* create_actor(ActorType type) BANKED;',
        ''
      ].join('\n'),
      'utf-8'
    )
    await writeFile(
      join(projectPath, 'src', 'Scene', 'SceneRegistry.h'),
      [
        'typedef enum { NUM_SCENES = 1 } SceneType;',
        'struct Scene;',
        'struct Scene* create_scene(SceneType type) BANKED;',
        ''
      ].join('\n'),
      'utf-8'
    )
    vi.mocked(ensureProjectDirectory).mockResolvedValue(projectPath)
    vi.mocked(walkProjectCodeFiles)
      .mockResolvedValueOnce(['Actor/ActorRegistry.h', 'Scene/SceneRegistry.h'])
      .mockRejectedValueOnce(Object.assign(new Error('missing directory'), { code: 'ENOENT' }))

    const snapshot = await getProjectCodeWorkspaceSnapshot(projectPath)

    expect(snapshot.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: `${PROJECT_CODE_WORKSPACE_ROOT}/src/Actor/ActorRegistry.h`,
          content: expect.stringContaining('create_actor')
        }),
        expect.objectContaining({
          path: `${PROJECT_CODE_WORKSPACE_ROOT}/src/Scene/SceneRegistry.h`,
          content: expect.stringContaining('create_scene')
        })
      ])
    )
  })
})
