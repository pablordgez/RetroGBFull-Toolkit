import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ProjectResourceItem } from '../../../src/shared/projectResourceModels'
import {
  buildClassName,
  formatFileBadge,
  formatLocationLabel,
  getFriendlyErrorMessage,
  getParentResourcePath,
  getResourceIcon,
  getResourceTypeLabel,
  getTrackedResourceKind,
  isResourceNameConflictMessage,
  isSceneResource,
  supportsBankOverride
} from '../../../src/renderer/src/components/Docking/resourceManagementShared'

const folderResource: ProjectResourceItem = {
  type: 'folder',
  id: 'folder-1',
  name: 'Maps',
  path: 'Maps',
  parentPath: null
}

describe('resourceManagementShared', () => {
  it('formats labels and resolves resource metadata helpers', () => {
    expect(buildClassName()).toBe('resource-management-pane')
    expect(buildClassName('extra')).toBe('resource-management-pane extra')
    expect(formatLocationLabel('')).toBe('/')
    expect(formatLocationLabel('assets/maps')).toBe('/assets/maps')
    expect(getParentResourcePath('assets/maps/intro')).toBe('assets/maps')

    expect(getResourceTypeLabel('folder')).toBe('Folder')
    expect(getResourceTypeLabel('script', 'scene')).toBe('Scene Script')
    expect(getResourceTypeLabel('sprite')).toBe('Sprite')

    expect(formatFileBadge(folderResource)).toBe('FILE')
    expect(formatFileBadge({
      type: 'file',
      id: 'file-1',
      name: 'intro.rgbscene.json',
      fileName: 'intro.rgbscene.json',
      path: 'assets/intro.rgbscene.json',
      parentPath: null,
      extension: 'json',
      resourceType: 'scene'
    })).toBe('JSON')
  })

  it('normalizes errors and resource kind checks', () => {
    expect(getFriendlyErrorMessage('oops', 'Fallback')).toBe('Fallback')
    expect(getFriendlyErrorMessage(new Error('Simple error'), 'Fallback')).toBe('Simple error')
    expect(
      getFriendlyErrorMessage(
        new Error("Error invoking remote method 'save-project': Error: Resource already exists"),
        'Fallback'
      )
    ).toBe('Resource already exists')

    expect(isResourceNameConflictMessage('Resource already exists')).toBe(true)
    expect(isResourceNameConflictMessage('Completely different')).toBe(false)

    expect(getTrackedResourceKind(folderResource)).toBe('folder')
    expect(getTrackedResourceKind({
      type: 'file',
      id: 'script-1',
      name: 'Hero.c',
      fileName: 'Hero.c',
      path: 'src/CustomActors/Hero.c',
      parentPath: null,
      extension: 'c',
      resourceType: null,
      scriptKind: 'actor'
    })).toBe('script')
    expect(getTrackedResourceKind({
      type: 'file',
      id: 'file-2',
      name: 'notes.txt',
      fileName: 'notes.txt',
      path: 'notes.txt',
      parentPath: null,
      extension: 'txt',
      resourceType: null
    })).toBeNull()

    const bankedResource: ProjectResourceItem = {
      type: 'file',
      id: 'scene-1',
      name: 'Intro',
      fileName: 'Intro.rgbscene.json',
      path: 'assets/scenes/Intro.rgbscene.json',
      parentPath: 'assets/scenes',
      extension: 'json',
      resourceType: 'scene',
      bank: 3
    }

    expect(supportsBankOverride(bankedResource)).toBe(true)
    expect(supportsBankOverride(folderResource)).toBe(false)
    expect(isSceneResource(bankedResource)).toBe(true)
    expect(isSceneResource({
      ...bankedResource,
      resourceType: 'sprite'
    })).toBe(false)
  })

  it('returns a matching icon for each tracked resource kind', () => {
    const resources: ProjectResourceItem[] = [
      folderResource,
      {
        type: 'file',
        id: 'actor-1',
        name: 'Hero',
        fileName: 'Hero.rgbactor.json',
        path: 'assets/actors/Hero.rgbactor.json',
        parentPath: null,
        extension: 'json',
        resourceType: 'actor'
      },
      {
        type: 'file',
        id: 'sprite-1',
        name: 'Hero Sprite',
        fileName: 'Hero.rgbsprite.json',
        path: 'assets/sprites/Hero.rgbsprite.json',
        parentPath: null,
        extension: 'json',
        resourceType: 'sprite'
      },
      {
        type: 'file',
        id: 'tileset-1',
        name: 'Main',
        fileName: 'Main.rgbtileset.json',
        path: 'assets/tilesets/Main.rgbtileset.json',
        parentPath: null,
        extension: 'json',
        resourceType: 'tileset'
      },
      {
        type: 'file',
        id: 'tilemap-1',
        name: 'Intro',
        fileName: 'Intro.rgbtilemap.json',
        path: 'assets/tilemaps/Intro.rgbtilemap.json',
        parentPath: null,
        extension: 'json',
        resourceType: 'tilemap'
      },
      {
        type: 'file',
        id: 'window-1',
        name: 'HUD',
        fileName: 'HUD.rgbwindow.json',
        path: 'assets/windows/HUD.rgbwindow.json',
        parentPath: null,
        extension: 'json',
        resourceType: 'window'
      },
      {
        type: 'file',
        id: 'scene-2',
        name: 'Intro Scene',
        fileName: 'Intro.rgbscene.json',
        path: 'assets/scenes/Intro.rgbscene.json',
        parentPath: null,
        extension: 'json',
        resourceType: 'scene'
      },
      {
        type: 'file',
        id: 'music-1',
        name: 'Theme',
        fileName: 'Theme.rgbmusic.json',
        path: 'assets/music/Theme.rgbmusic.json',
        parentPath: null,
        extension: 'json',
        resourceType: 'music'
      },
      {
        type: 'file',
        id: 'misc-1',
        name: 'misc.bin',
        fileName: 'misc.bin',
        path: 'misc.bin',
        parentPath: null,
        extension: 'bin',
        resourceType: null
      }
    ]

    for (const resource of resources) {
      const { container, unmount } = render(getResourceIcon(resource))
      expect(container.querySelector('svg')).toBeTruthy()
      unmount()
    }
  })
})
