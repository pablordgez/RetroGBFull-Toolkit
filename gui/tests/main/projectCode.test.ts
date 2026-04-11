import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectStructure } from '../../src/main/projectLauncher'
import { listProjectScriptCallbackCandidates, loadProjectScriptResource, saveProjectScriptResource } from '../../src/main/projectCode'
import { createProjectScriptResource, listProjectScriptResources } from '../../src/main/projectResources'

const tempDirectories: string[] = []

describe('projectCode collision callback helpers', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('collects compatible callbacks from general, actor, and scene scripts while excluding reserved entry points', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'retrogb-code-'))
    tempDirectories.push(workspaceDirectory)
    const project = await createProjectStructure(workspaceDirectory, 'MyProject')

    const generalScript = await createProjectScriptResource(project.path, 'general', 'Shared')
    const actorScript = await createProjectScriptResource(project.path, 'actor', 'Hero')
    const sceneScript = await createProjectScriptResource(project.path, 'scene', 'Room')

    const loadedGeneral = await loadProjectScriptResource(project.path, generalScript.resourcePath, 'general')
    const loadedActor = await loadProjectScriptResource(project.path, actorScript.resourcePath, 'actor')
    const loadedScene = await loadProjectScriptResource(project.path, sceneScript.resourcePath, 'scene')

    await saveProjectScriptResource(
      project.path,
      generalScript.resourcePath,
      'general',
      'void OnSharedCollision(void){\n}\n\nstatic void HiddenShared(void){\n}\n\nvoid SharedNeedsArgs(uint8_t value){\n    value = value;\n}\n',
      loadedGeneral.headerContent
    )
    await saveProjectScriptResource(
      project.path,
      actorScript.resourcePath,
      'actor',
      'void AINIT(void){\n}\n\nvoid AUPDATE(void){\n}\n\nvoid OnHeroCollision(void){\n}\n',
      loadedActor.headerContent
    )
    await saveProjectScriptResource(
      project.path,
      sceneScript.resourcePath,
      'scene',
      'void SINIT(void) BANKED{\n}\n\nvoid SUPDATE(void){\n}\n\nvoid OnRoomCollision(void){\n}\n',
      loadedScene.headerContent
    )

    const scripts = await listProjectScriptResources(project.path)
    const candidates = await listProjectScriptCallbackCandidates(project.path, scripts)

    expect(candidates).toEqual(
      expect.arrayContaining([
        {
          scriptPath: generalScript.resourcePath,
          scriptKind: 'general',
          scriptName: 'Shared',
          functionName: 'OnSharedCollision'
        },
        {
          scriptPath: actorScript.resourcePath,
          scriptKind: 'actor',
          scriptName: 'Hero',
          functionName: 'OnHeroCollision'
        },
        {
          scriptPath: sceneScript.resourcePath,
          scriptKind: 'scene',
          scriptName: 'Room',
          functionName: 'OnRoomCollision'
        }
      ])
    )
    expect(candidates.some((candidate) => candidate.functionName === 'AINIT')).toBe(false)
    expect(candidates.some((candidate) => candidate.functionName === 'AUPDATE')).toBe(false)
    expect(candidates.some((candidate) => candidate.functionName === 'SINIT')).toBe(false)
    expect(candidates.some((candidate) => candidate.functionName === 'SUPDATE')).toBe(false)
    expect(candidates.some((candidate) => candidate.functionName === 'HiddenShared')).toBe(false)
    expect(candidates.some((candidate) => candidate.functionName === 'SharedNeedsArgs')).toBe(false)
  })
})
