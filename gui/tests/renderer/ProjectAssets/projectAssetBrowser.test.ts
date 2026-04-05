import { describe, expect, it, vi } from 'vitest'
import { listProjectAssetsByKind } from '../../../src/renderer/src/components/ProjectAssets/projectAssetBrowser'

describe('projectAssetBrowser', () => {
  it('returns an empty list when no project path is provided', async () => {
    await expect(listProjectAssetsByKind('', ['sprite'])).resolves.toEqual([])
    expect(window.api.getProjectResources).not.toHaveBeenCalled()
  })

  it('lists matching assets recursively and sorts them by path', async () => {
    vi.mocked(window.api.getProjectResources).mockImplementation(
      async (_projectPath, currentPath = '') => {
        if (currentPath === '') {
          return {
            projectName: 'Alpha',
            projectPath: '/projects/Alpha',
            currentPath: '',
            parentPath: null,
            items: [
              {
                type: 'folder' as const,
                id: 'sprites',
                name: 'Sprites',
                path: 'Sprites',
                parentPath: null
              },
              {
                type: 'file' as const,
                name: 'UI',
                fileName: 'UI.rgbwindow.json',
                path: 'UI.rgbwindow.json',
                extension: 'json',
                resourceType: 'window' as const
              }
            ]
          }
        }

        if (currentPath === 'Sprites') {
          return {
            projectName: 'Alpha',
            projectPath: '/projects/Alpha',
            currentPath,
            parentPath: '',
            items: [
              {
                type: 'file' as const,
                name: 'Zed',
                fileName: 'Zed.rgbsprite.json',
                path: 'Sprites/Zed.rgbsprite.json',
                extension: 'json',
                resourceType: 'sprite' as const
              },
              {
                type: 'folder' as const,
                id: 'sprites-actors',
                name: 'Actors',
                path: 'Sprites/Actors',
                parentPath: 'Sprites'
              }
            ]
          }
        }

        return {
          projectName: 'Alpha',
          projectPath: '/projects/Alpha',
          currentPath,
          parentPath: 'Sprites',
          items: [
            {
              type: 'file' as const,
              name: 'Hero',
              fileName: 'Hero.rgbsprite.json',
              path: 'Sprites/Actors/Hero.rgbsprite.json',
              extension: 'json',
              resourceType: 'sprite' as const
            },
            {
              type: 'file' as const,
              name: 'Enemy',
              fileName: 'Enemy.rgbactor.json',
              path: 'Sprites/Actors/Enemy.rgbactor.json',
              extension: 'json',
              resourceType: 'actor' as const
            }
          ]
        }
      }
    )

    await expect(listProjectAssetsByKind('/projects/Alpha', ['sprite'])).resolves.toEqual([
      {
        kind: 'sprite',
        name: 'Hero',
        path: 'Sprites/Actors/Hero.rgbsprite.json'
      },
      {
        kind: 'sprite',
        name: 'Zed',
        path: 'Sprites/Zed.rgbsprite.json'
      }
    ])
  })
})
