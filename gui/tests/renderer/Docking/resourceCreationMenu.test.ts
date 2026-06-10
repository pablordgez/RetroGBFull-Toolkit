import { describe, expect, it, vi } from 'vitest'
import { PROJECT_SCRIPT_LABELS } from '../../../src/shared/projectScripts'
import { buildResourceCreationMenuItems } from '../../../src/renderer/src/components/Docking/resourceCreationMenu'

describe('buildResourceCreationMenuItems', () => {
  it('builds menu items for resources and nested script kinds', () => {
    const onCreateResource = vi.fn()
    const onCreateScriptResource = vi.fn()

    const items = buildResourceCreationMenuItems({
      disabled: false,
      onCreateResource,
      onCreateScriptResource
    })

    expect(items.map((item) => item.id)).toEqual([
      'new-folder',
      'new-sprite',
      'new-tileset',
      'new-tilemap',
      'new-window',
      'new-music',
      'new-scene',
      'new-script'
    ])

    items[0].onSelect?.()
    items[1].onSelect?.()
    items[2].onSelect?.()
    items[3].onSelect?.()
    items[4].onSelect?.()
    items[5].onSelect?.()
    items[6].onSelect?.()

    expect(onCreateResource.mock.calls).toEqual([
      ['folder'],
      ['sprite'],
      ['tileset'],
      ['tilemap'],
      ['window'],
      ['music'],
      ['scene']
    ])

    expect(items[7].label).toBe('Script')
    expect(items[7].children?.map((item) => item.label)).toEqual([
      PROJECT_SCRIPT_LABELS.actor,
      PROJECT_SCRIPT_LABELS.scene,
      PROJECT_SCRIPT_LABELS.general
    ])

    items[7].children?.[0].onSelect?.()
    items[7].children?.[1].onSelect?.()
    items[7].children?.[2].onSelect?.()

    expect(onCreateScriptResource.mock.calls).toEqual([['actor'], ['scene'], ['general']])
  })

  it('propagates the disabled state to every item', () => {
    const items = buildResourceCreationMenuItems({
      disabled: true,
      onCreateResource: () => undefined,
      onCreateScriptResource: () => undefined
    })

    expect(items.every((item) => item.disabled)).toBe(true)
    expect(items[7].children?.every((item) => item.disabled)).toBe(true)
  })
})
