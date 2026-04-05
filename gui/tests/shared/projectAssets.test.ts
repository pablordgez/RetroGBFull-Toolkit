import { describe, expect, it } from 'vitest'
import {
  parseProjectAssetDocument,
  serializeProjectAssetDocument,
  type ActorAssetDocument,
  type SceneAssetDocument
} from '../../src/shared/projectAssets'

describe('projectAssets scene parsing', () => {
  it('parses an older scene actor without followCamera', () => {
    const document = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: null,
      windowPath: null,
      nodes: [
        {
          id: 'hero',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: null,
          x: 32,
          y: 48,
          children: []
        }
      ]
    }) as SceneAssetDocument

    expect(document.nodes[0]).toMatchObject({
      type: 'actor',
      followCamera: false
    })
  })

  it('parses and serializes scene collision nodes', () => {
    const document = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: null,
      windowPath: null,
      nodes: [
        {
          id: 'collision-1',
          type: 'collision',
          name: 'Wall',
          isCollapsed: false,
          x: 16,
          y: 32,
          width: 128,
          height: 64,
          isBlocking: true,
          children: []
        }
      ]
    }) as SceneAssetDocument

    expect(document.nodes[0]).toMatchObject({
      type: 'collision',
      width: 128,
      height: 64,
      isBlocking: true
    })
    expect(serializeProjectAssetDocument(document)).toContain('"type": "collision"')
  })

  it('parses actor resources with collision children', () => {
    const document = parseProjectAssetDocument({
      kind: 'actor',
      version: 1,
      root: {
        id: 'hero',
        type: 'actor',
        name: 'Hero',
        isCollapsed: false,
        spritePath: null,
        x: 0,
        y: 0,
        followCamera: false,
        children: [
          {
            id: 'hero-collision',
            type: 'collision',
            name: 'Hitbox',
            isCollapsed: false,
            x: 0,
            y: 0,
            width: 128,
            height: 128,
            isBlocking: true,
            children: []
          }
        ]
      }
    }) as ActorAssetDocument

    expect(document.root.children[0]).toMatchObject({
      type: 'collision',
      isBlocking: true
    })
  })

  it('serializes actor resource paths only in scene documents', () => {
    const sceneDocument = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: null,
      windowPath: null,
      nodes: [
        {
          id: 'hero',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: null,
          resourcePath: 'Actors/Hero.rgbactor.json',
          x: 0,
          y: 0,
          followCamera: false,
          children: []
        }
      ]
    }) as SceneAssetDocument
    const actorDocument = parseProjectAssetDocument({
      kind: 'actor',
      version: 1,
      root: {
        id: 'hero',
        type: 'actor',
        name: 'Hero',
        isCollapsed: false,
        spritePath: null,
        resourcePath: 'Actors/Hero.rgbactor.json',
        x: 0,
        y: 0,
        followCamera: false,
        children: []
      }
    }) as ActorAssetDocument

    expect(serializeProjectAssetDocument(sceneDocument)).toContain('"resourcePath": "Actors/Hero.rgbactor.json"')
    expect(serializeProjectAssetDocument(actorDocument)).not.toContain('"resourcePath"')
  })

  it('normalizes multiple followed actors down to one in a scene document', () => {
    const document = parseProjectAssetDocument({
      kind: 'scene',
      version: 1,
      tilemapPath: null,
      windowPath: null,
      nodes: [
        {
          id: 'hero',
          type: 'actor',
          name: 'Hero',
          isCollapsed: false,
          spritePath: null,
          x: 0,
          y: 0,
          followCamera: true,
          children: []
        },
        {
          id: 'enemy',
          type: 'actor',
          name: 'Enemy',
          isCollapsed: false,
          spritePath: null,
          x: 16,
          y: 0,
          followCamera: true,
          children: []
        }
      ]
    }) as SceneAssetDocument

    expect(document.nodes[0]).toMatchObject({ followCamera: true })
    expect(document.nodes[1]).toMatchObject({ followCamera: false })
  })

  it('rejects malformed collision nodes', () => {
    expect(() =>
      parseProjectAssetDocument({
        kind: 'scene',
        version: 1,
        tilemapPath: null,
        windowPath: null,
        nodes: [
          {
            id: 'bad-collision',
            type: 'collision',
            name: 'Wall',
            isCollapsed: false,
            x: 0,
            y: 0,
            width: 128,
            height: 128,
            isBlocking: true,
            children: [
              {
                id: 'nested',
                type: 'folder',
                name: 'Nested',
                isCollapsed: false,
                children: []
              }
            ]
          }
        ]
      })
    ).toThrow('The scene asset file is invalid.')
  })
})
