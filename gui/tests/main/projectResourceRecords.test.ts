import { describe, expect, it } from 'vitest'
import {
  buildResourceFileName,
  buildStoredResourceRecord,
  isBankableAssetKind,
  sortResources
} from '../../src/main/projectResourceRecords'
import type { ProjectStoredResourceRecord } from '../../src/main/projectResourceTypes'

const timestamps = {
  createdAt: '2026-01-02T03:04:05.000Z',
  updatedAt: '2026-01-03T03:04:05.000Z'
}

describe('projectResourceRecords', () => {
  it('builds file names for folders, assets, and scripts', () => {
    expect(buildResourceFileName('folder', 'Actor Folder')).toBe('Actor Folder')
    expect(buildResourceFileName('sprite', 'Hero Idle')).toBe('Hero Idle.rgbsprite.json')
    expect(buildResourceFileName('script', ' 123 enemy ai ')).toBe('resource_123_enemy_ai.c')
  })

  it('identifies resource kinds with bank assignment support', () => {
    expect(isBankableAssetKind('script')).toBe(true)
    expect(isBankableAssetKind('sprite')).toBe(true)
    expect(isBankableAssetKind('scene')).toBe(false)
    expect(isBankableAssetKind('actor')).toBe(false)
  })

  it('builds normalized folder, asset, and script records', () => {
    expect(
      buildStoredResourceRecord('folder', ' Actors / Heroes ', undefined, {
        id: 'folder-1',
        ...timestamps
      })
    ).toEqual({
      type: 'folder',
      id: 'folder-1',
      name: 'Heroes',
      path: 'Actors/Heroes',
      parentPath: 'Actors',
      ...timestamps
    })

    expect(
      buildStoredResourceRecord('sprite', 'Actors/Hero.rgbsprite.json', undefined, {
        id: 'sprite-1',
        bank: 9,
        ...timestamps
      })
    ).toEqual({
      type: 'file',
      id: 'sprite-1',
      name: 'Hero',
      path: 'Actors/Hero.rgbsprite.json',
      parentPath: 'Actors',
      resourceType: 'sprite',
      bank: 9,
      ...timestamps
    })

    expect(
      buildStoredResourceRecord('scene', 'Scenes/Intro.rgbscene.json', undefined, {
        id: 'scene-1',
        bank: 9,
        ...timestamps
      })
    ).toMatchObject({
      type: 'file',
      id: 'scene-1',
      name: 'Intro',
      resourceType: 'scene',
      bank: null
    })

    expect(
      buildStoredResourceRecord('script', 'src/CustomActors/Hero.c', 'actor', {
        id: 'script-1',
        bank: 'bad' as unknown as number,
        ...timestamps
      })
    ).toMatchObject({
      type: 'file',
      id: 'script-1',
      name: 'Hero',
      path: 'src/CustomActors/Hero.c',
      parentPath: 'src/CustomActors',
      resourceType: 'script',
      scriptKind: 'actor'
    })
  })

  it('requires script kind for script records and sorts resources by path then type', () => {
    expect(() => buildStoredResourceRecord('script', 'src/Scripts/Main.c')).toThrow(
      'A script kind is required when creating script resource records.'
    )

    const resources: ProjectStoredResourceRecord[] = [
      buildStoredResourceRecord('sprite', 'B.rgbsprite.json', undefined, { id: 'b', ...timestamps }),
      buildStoredResourceRecord('folder', 'A', undefined, { id: 'a-folder', ...timestamps }),
      buildStoredResourceRecord('sprite', 'A', undefined, { id: 'a-file', ...timestamps })
    ]

    expect(sortResources(resources).map((resource) => [resource.path, resource.type])).toEqual([
      ['A', 'file'],
      ['A', 'folder'],
      ['B.rgbsprite.json', 'file']
    ])
  })
})
