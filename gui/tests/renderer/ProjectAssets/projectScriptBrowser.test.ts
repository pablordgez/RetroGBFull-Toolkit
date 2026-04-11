import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listProjectScriptsByKind } from '../../../src/renderer/src/components/ProjectAssets/projectScriptBrowser'

describe('projectScriptBrowser', () => {
  beforeEach(() => {
    vi.mocked(window.api.listProjectScriptResources).mockReset()
  })

  it('returns no options when the project path is blank', async () => {
    await expect(listProjectScriptsByKind('', ['general', 'actor'])).resolves.toEqual([])
    expect(window.api.listProjectScriptResources).not.toHaveBeenCalled()
  })

  it('loads, flattens, and sorts scripts across the requested kinds', async () => {
    vi.mocked(window.api.listProjectScriptResources)
      .mockResolvedValueOnce([
        {
          name: 'Hero',
          path: 'src/CustomActors/Hero.c',
          scriptKind: 'actor'
        }
      ])
      .mockResolvedValueOnce([
        {
          name: 'Shared',
          path: 'src/Scripts/Shared.c',
          scriptKind: 'general'
        },
        {
          name: 'Debug',
          path: 'src/Scripts/Debug.c',
          scriptKind: 'general'
        }
      ])

    await expect(listProjectScriptsByKind('/projects/Alpha', ['actor', 'general'])).resolves.toEqual(
      [
        {
          kind: 'actor',
          name: 'Hero',
          path: 'src/CustomActors/Hero.c'
        },
        {
          kind: 'general',
          name: 'Debug',
          path: 'src/Scripts/Debug.c'
        },
        {
          kind: 'general',
          name: 'Shared',
          path: 'src/Scripts/Shared.c'
        }
      ]
    )

    expect(window.api.listProjectScriptResources).toHaveBeenNthCalledWith(
      1,
      '/projects/Alpha',
      'actor'
    )
    expect(window.api.listProjectScriptResources).toHaveBeenNthCalledWith(
      2,
      '/projects/Alpha',
      'general'
    )
  })
})
