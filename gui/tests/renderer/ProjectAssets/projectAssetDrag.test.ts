import { describe, expect, it } from 'vitest'
import {
  PROJECT_ASSET_DRAG_MIME,
  canDragProjectAsset,
  hasProjectAssetDragPayload,
  readProjectAssetDragPayload,
  writeProjectAssetDragPayload
} from '../../../src/renderer/src/components/ProjectAssets/projectAssetDrag'

const createDataTransfer = () => {
  const store = new Map<string, string>()

  return {
    dataTransfer: {
      effectAllowed: 'none',
      setData: (type: string, value: string) => {
        store.set(type, value)
      },
      getData: (type: string) => store.get(type) ?? '',
      get types() {
        return Array.from(store.keys())
      }
    },
    store
  }
}

describe('projectAssetDrag', () => {
  it('recognizes which resource kinds can be dragged', () => {
    expect(canDragProjectAsset('actor')).toBe(true)
    expect(canDragProjectAsset('tilemap')).toBe(true)
    expect(canDragProjectAsset('window')).toBe(true)
    expect(canDragProjectAsset('scene')).toBe(false)
    expect(canDragProjectAsset(null)).toBe(false)
    expect(canDragProjectAsset(undefined)).toBe(false)
  })

  it('writes, reads, and detects serialized drag payloads', () => {
    const { dataTransfer, store } = createDataTransfer()

    writeProjectAssetDragPayload(dataTransfer as unknown as DataTransfer, {
      kind: 'tilemap',
      path: 'assets/maps/intro.rgbtilemap.json'
    })

    expect(store.get('text/plain')).toBe('assets/maps/intro.rgbtilemap.json')
    expect(dataTransfer.effectAllowed).toBe('copy')
    expect(readProjectAssetDragPayload(dataTransfer)).toEqual({
      kind: 'tilemap',
      path: 'assets/maps/intro.rgbtilemap.json'
    })
    expect(hasProjectAssetDragPayload(dataTransfer)).toBe(true)
    expect(store.get(PROJECT_ASSET_DRAG_MIME)).toContain('"kind":"tilemap"')
  })

  it('rejects malformed or unsupported drag payloads', () => {
    const emptyTransfer = {
      getData: () => '',
      types: []
    }
    expect(readProjectAssetDragPayload(emptyTransfer)).toBeNull()
    expect(hasProjectAssetDragPayload(emptyTransfer)).toBe(false)

    const malformedTransfer = {
      getData: () => '{not-json',
      types: []
    }
    expect(readProjectAssetDragPayload(malformedTransfer)).toBeNull()

    const unsupportedKindTransfer = {
      getData: () => JSON.stringify({ kind: 'sprite', path: 'assets/sprites/hero.json' }),
      types: []
    }
    expect(readProjectAssetDragPayload(unsupportedKindTransfer)).toBeNull()

    const invalidPathTransfer = {
      getData: () => JSON.stringify({ kind: 'actor', path: 42 }),
      types: []
    }
    expect(readProjectAssetDragPayload(invalidPathTransfer)).toBeNull()
  })
})
