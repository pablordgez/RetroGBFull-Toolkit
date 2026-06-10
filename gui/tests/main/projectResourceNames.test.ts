import { describe, expect, it } from 'vitest'
import { ProjectLauncherError } from '../../src/main/projectLauncher'
import {
  assertFolderName,
  assertUniqueTrackedFileName,
  buildUniqueResourceName,
  buildUniqueTransferredResourceTarget
} from '../../src/main/projectResourceNames'
import { buildStoredResourceRecord } from '../../src/main/projectResourceRecords'
import type { ProjectStoredResourceRecord } from '../../src/main/projectResourceTypes'

const timestamps = {
  createdAt: '2026-01-02T03:04:05.000Z',
  updatedAt: '2026-01-03T03:04:05.000Z'
}

const resources: ProjectStoredResourceRecord[] = [
  buildStoredResourceRecord('folder', 'Sprites', undefined, { id: 'folder-1', ...timestamps }),
  buildStoredResourceRecord('folder', 'Sprites/New Folder', undefined, {
    id: 'folder-2',
    ...timestamps
  }),
  buildStoredResourceRecord('sprite', 'Hero.rgbsprite.json', undefined, {
    id: 'sprite-1',
    ...timestamps
  }),
  buildStoredResourceRecord('sprite', 'Sprites/New Sprite.rgbsprite.json', undefined, {
    id: 'sprite-2',
    ...timestamps
  }),
  buildStoredResourceRecord('script', 'src/Scripts/New_Script.c', 'general', {
    id: 'script-1',
    ...timestamps
  }),
  buildStoredResourceRecord('script', 'src/CustomActors/Enemy_AI.c', 'actor', {
    id: 'script-2',
    ...timestamps
  })
]

describe('projectResourceNames', () => {
  it('validates folder names and global tracked file name uniqueness', () => {
    expect(assertFolderName(' Actors ')).toBe('Actors')
    expect(() => assertFolderName('')).toThrow(ProjectLauncherError)
    expect(() => assertFolderName('Bad/Name')).toThrow(
      'Please enter a valid folder name. Avoid empty names and reserved filename characters.'
    )

    expect(() => assertUniqueTrackedFileName(resources, 'hero')).toThrow(
      'A resource named "hero" already exists elsewhere in the project.'
    )
    expect(() => assertUniqueTrackedFileName(resources, 'hero', ['Hero.rgbsprite.json'])).not.toThrow()
    expect(() => assertUniqueTrackedFileName(resources, 'Sprites')).not.toThrow()
  })

  it('builds unique default names for folders, assets, and scripts', () => {
    expect(buildUniqueResourceName(resources, '', 'folder')).toBe('New Folder')
    expect(buildUniqueResourceName(resources, 'Sprites', 'folder')).toBe('New Folder 2')
    expect(buildUniqueResourceName(resources, '', 'sprite')).toBe('New Sprite 2')
    expect(buildUniqueResourceName(resources, '', 'scene')).toBe('New Scene')
    expect(buildUniqueResourceName(resources, '', 'script')).toBe('New_Script_2')
  })

  it('builds unique transfer targets with local and global conflicts', () => {
    expect(
      buildUniqueTransferredResourceTarget(resources, '', 'folder', 'Sprites/New Folder')
    ).toEqual({
      resourceName: 'New Folder',
      resourcePath: 'New Folder'
    })

    expect(
      buildUniqueTransferredResourceTarget(resources, 'Sprites', 'folder', 'New Folder')
    ).toEqual({
      resourceName: 'New Folder 2',
      resourcePath: 'Sprites/New Folder 2'
    })

    expect(
      buildUniqueTransferredResourceTarget(resources, 'Sprites', 'sprite', 'Hero.rgbsprite.json')
    ).toEqual({
      resourceName: 'Hero 2',
      resourcePath: 'Sprites/Hero 2.rgbsprite.json'
    })

    expect(
      buildUniqueTransferredResourceTarget(resources, '', 'script', 'src/CustomActors/Enemy AI.c')
    ).toEqual({
      resourceName: 'Enemy_AI_2',
      resourcePath: 'Enemy_AI_2.c'
    })

    expect(
      buildUniqueTransferredResourceTarget(resources, 'Sprites', 'sprite', 'Hero.rgbsprite.json', [
        'Hero.rgbsprite.json'
      ])
    ).toEqual({
      resourceName: 'Hero',
      resourcePath: 'Sprites/Hero.rgbsprite.json'
    })
  })
})
