import { describe, expect, it } from 'vitest'
import {
  buildProjectResourceView,
  getResourceParentPath,
  getStateStartingScenePath,
  isSameOrDescendantPath,
  normalizeStartingScenePath,
  remapStartingScenePath,
  setStateStartingScenePath
} from '../../src/main/projectResourceView'
import {
  buildStoredResourceRecord,
  sortResources
} from '../../src/main/projectResourceRecords'
import type { ProjectStoredResourceRecord } from '../../src/main/projectResourceTypes'

const timestamps = {
  createdAt: '2026-01-02T03:04:05.000Z',
  updatedAt: '2026-01-03T03:04:05.000Z'
}

describe('projectResourceView', () => {
  it('normalizes starting scenes and parent paths', () => {
    expect(normalizeStartingScenePath(' Scenes\\Intro.rgbscene.json ')).toBe(
      'Scenes/Intro.rgbscene.json'
    )
    expect(normalizeStartingScenePath('Actors/Hero.rgbactor.json')).toBeNull()
    expect(normalizeStartingScenePath(42)).toBeNull()
    expect(getResourceParentPath('Scenes/Intro.rgbscene.json')).toBe('Scenes')
    expect(getResourceParentPath('Intro.rgbscene.json')).toBeNull()
    expect(getResourceParentPath('')).toBeNull()
  })

  it('gets, sets, and remaps starting scene state safely', () => {
    const state = { projectFile: { startingScenePath: 'Scenes/Intro.rgbscene.json' as unknown } }

    expect(getStateStartingScenePath(state)).toBe('Scenes/Intro.rgbscene.json')
    setStateStartingScenePath(state, 'Actors/Hero.rgbactor.json')
    expect(state.projectFile.startingScenePath).toBeNull()
    setStateStartingScenePath(state, 'Scenes/Intro.rgbscene.json')
    expect(state.projectFile.startingScenePath).toBe('Scenes/Intro.rgbscene.json')

    expect(isSameOrDescendantPath('Scenes/Intro.rgbscene.json', 'Scenes')).toBe(true)
    expect(isSameOrDescendantPath('ScenesExtra/Intro.rgbscene.json', 'Scenes')).toBe(false)
    expect(remapStartingScenePath(null, 'Scenes', 'Levels')).toBeNull()
    expect(remapStartingScenePath('Scenes', 'Scenes', 'Levels')).toBe('Levels')
    expect(remapStartingScenePath('Scenes/Intro.rgbscene.json', 'Scenes', 'Levels')).toBe(
      'Levels/Intro.rgbscene.json'
    )
    expect(remapStartingScenePath('Other/Intro.rgbscene.json', 'Scenes', 'Levels')).toBe(
      'Other/Intro.rgbscene.json'
    )
  })

  it('builds a sorted resource view for the current folder', () => {
    const resources: ProjectStoredResourceRecord[] = sortResources([
      buildStoredResourceRecord('sprite', 'Actors/Hero.rgbsprite.json', undefined, {
        id: 'sprite-1',
        bank: 2,
        ...timestamps
      }),
      buildStoredResourceRecord('folder', 'Actors/Nested', undefined, {
        id: 'folder-2',
        ...timestamps
      }),
      buildStoredResourceRecord('folder', 'Actors', undefined, {
        id: 'folder-1',
        ...timestamps
      }),
      buildStoredResourceRecord('script', 'Boot.h', 'general', {
        id: 'script-header',
        bank: 3,
        ...timestamps
      }),
      buildStoredResourceRecord('script', 'Actors/Hero.c', 'actor', {
        id: 'script-1',
        bank: 7,
        ...timestamps
      })
    ])
    const state = {
      projectName: 'Demo',
      projectPath: '/projects/Demo',
      projectFile: { startingScenePath: 'Scenes/Intro.rgbscene.json' }
    }

    expect(buildProjectResourceView(state, resources).items).toEqual([
      {
        type: 'folder',
        id: 'folder-1',
        name: 'Actors',
        path: 'Actors',
        parentPath: null
      },
      {
        type: 'file',
        id: 'script-header',
        name: 'Boot',
        fileName: 'Boot.h',
        path: 'Boot.h',
        parentPath: null,
        extension: 'h',
        resourceType: null,
        bank: 3,
        scriptKind: 'general'
      }
    ])

    expect(buildProjectResourceView(state, resources, 'Actors').items).toEqual([
      {
        type: 'folder',
        id: 'folder-2',
        name: 'Nested',
        path: 'Actors/Nested',
        parentPath: 'Actors'
      },
      {
        type: 'file',
        id: 'script-1',
        name: 'Hero',
        fileName: 'Hero.c',
        path: 'Actors/Hero.c',
        parentPath: 'Actors',
        extension: 'c',
        resourceType: null,
        bank: 7,
        scriptKind: 'actor'
      },
      {
        type: 'file',
        id: 'sprite-1',
        name: 'Hero',
        fileName: 'Hero.rgbsprite.json',
        path: 'Actors/Hero.rgbsprite.json',
        parentPath: 'Actors',
        extension: 'json',
        resourceType: 'sprite',
        bank: 2
      }
    ])
  })
})
