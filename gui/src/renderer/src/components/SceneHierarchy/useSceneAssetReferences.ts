import { useEffect, useMemo, useState } from 'react'
import type {
  ProjectAssetKind,
  SpriteAssetDocument,
  TilemapAssetDocument,
  TilesetAssetDocument,
  WindowAssetDocument
} from '../../../../shared/projectAssets'
import {
  areProjectPalettesEqual,
  type SceneSpritePalettes,
  normalizeProjectPalette
} from '../../../../shared/projectPalettes'
import { collectSceneActorNodes } from './sceneHierarchyModel'
import { renderSpriteDocumentPreview } from './sceneRenderUtils'
import type { SceneDocumentEditor } from './useSceneDocumentEditor'

const EMPTY_SCENE_SPRITE_PALETTES: SceneSpritePalettes = [null, null]

interface SceneSpritePreview {
  path: string
  imageUrl: string
  imageUrlsByPalette: [string, string]
  width: number
  height: number
  palette: string[]
}

interface UseSceneAssetReferencesResult {
  tilemapDocument: TilemapAssetDocument | null
  tilemapTilesetDocument: TilesetAssetDocument | null
  windowDocument: WindowAssetDocument | null
  windowTilesetDocument: TilesetAssetDocument | null
  spritePreviews: Record<string, SceneSpritePreview>
  defaultSpritePalettes: SceneSpritePalettes
  defaultBackgroundPalette: string[] | null
  spritePaletteMismatchPaths: string[]
  backgroundPaletteMismatchPaths: string[]
  loadError: string | null
}

export const useSceneAssetReferences = (
  projectPath: string,
  editor: SceneDocumentEditor
): UseSceneAssetReferencesResult => {
  const [tilemapDocument, setTilemapDocument] = useState<TilemapAssetDocument | null>(null)
  const [tilemapTilesetDocument, setTilemapTilesetDocument] = useState<TilesetAssetDocument | null>(null)
  const [windowDocument, setWindowDocument] = useState<WindowAssetDocument | null>(null)
  const [windowTilesetDocument, setWindowTilesetDocument] = useState<TilesetAssetDocument | null>(null)
  const [spritePreviews, setSpritePreviews] = useState<Record<string, SceneSpritePreview>>({})
  const [defaultSpritePalettes, setDefaultSpritePalettes] = useState<SceneSpritePalettes>([
    null,
    null
  ])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const sceneSpritePalettes = editor.spritePalettes ?? EMPTY_SCENE_SPRITE_PALETTES

  const actorSpritePaths = useMemo(() => {
    return [
      ...new Set(
        collectSceneActorNodes(editor.nodes)
          .map((actor) => actor.spritePath)
          .filter((path): path is string => typeof path === 'string' && path.length > 0)
      )
    ]
  }, [editor.nodes])

  const watchedTilemapTilesetPath = tilemapDocument?.tilesetPath ?? null
  const watchedWindowTilesetPath = windowDocument?.tilesetPath ?? null

  useEffect(() => {
    if (!projectPath) {
      return
    }

    return window.api.onProjectAssetSaved((payload) => {
      const watchedAssetPaths = new Set<string>(actorSpritePaths)

      if (editor.tilemapPath) {
        watchedAssetPaths.add(editor.tilemapPath)
      }

      if (editor.windowPath) {
        watchedAssetPaths.add(editor.windowPath)
      }

      if (watchedTilemapTilesetPath) {
        watchedAssetPaths.add(watchedTilemapTilesetPath)
      }

      if (watchedWindowTilesetPath) {
        watchedAssetPaths.add(watchedWindowTilesetPath)
      }

      const watchedAssetKinds = new Set<ProjectAssetKind>(['tilemap', 'window', 'tileset', 'sprite'])

      if (
        payload.projectPath !== projectPath ||
        !watchedAssetKinds.has(payload.assetKind) ||
        !watchedAssetPaths.has(payload.assetPath)
      ) {
        return
      }

      setReloadVersion((currentVersion) => currentVersion + 1)
    })
  }, [actorSpritePaths, editor.tilemapPath, editor.windowPath, projectPath, watchedTilemapTilesetPath, watchedWindowTilesetPath])

  useEffect(() => {
    if (!projectPath || !editor.tilemapPath) {
      setTilemapDocument(null)
      setTilemapTilesetDocument(null)
      setLoadError(null)
      return
    }

    let isCancelled = false

    const loadTilemapReferences = async (): Promise<void> => {
      try {
        const tilemapPayload = await window.api.loadProjectAssetFile(
          projectPath,
          editor.tilemapPath!
        )

        if (isCancelled) {
          return
        }

        if (tilemapPayload.assetKind !== 'tilemap') {
          throw new Error('The selected scene tilemap is not a tilemap asset.')
        }

        const nextTilemapDocument = tilemapPayload.document as TilemapAssetDocument
        setTilemapDocument(nextTilemapDocument)

        if (!nextTilemapDocument.tilesetPath) {
          setTilemapTilesetDocument(null)
          return
        }

        const tilesetPayload = await window.api.loadProjectAssetFile(
          projectPath,
          nextTilemapDocument.tilesetPath
        )

        if (isCancelled) {
          return
        }

        if (tilesetPayload.assetKind !== 'tileset') {
          throw new Error('The selected scene tilemap references an invalid tileset.')
        }

        setTilemapTilesetDocument(tilesetPayload.document as TilesetAssetDocument)
        setLoadError(null)
      } catch (error) {
        console.error('[scene-editor] load tilemap references failed', error)

        if (isCancelled) {
          return
        }

        setTilemapDocument(null)
        setTilemapTilesetDocument(null)
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Something went wrong while loading the scene tilemap.'
        )
      }
    }

    void loadTilemapReferences()

    return () => {
      isCancelled = true
    }
  }, [editor.tilemapPath, projectPath, reloadVersion])

  useEffect(() => {
    if (!projectPath || !editor.windowPath) {
      setWindowDocument(null)
      setWindowTilesetDocument(null)
      if (!editor.tilemapPath) {
        setLoadError(null)
      }
      return
    }

    let isCancelled = false

    const loadWindowReferences = async (): Promise<void> => {
      try {
        const windowPayload = await window.api.loadProjectAssetFile(projectPath, editor.windowPath!)

        if (isCancelled) {
          return
        }

        if (windowPayload.assetKind !== 'window') {
          throw new Error('The selected scene window is not a window asset.')
        }

        const nextWindowDocument = windowPayload.document as WindowAssetDocument
        setWindowDocument(nextWindowDocument)

        if (!nextWindowDocument.tilesetPath) {
          setWindowTilesetDocument(null)
          return
        }

        const tilesetPayload = await window.api.loadProjectAssetFile(
          projectPath,
          nextWindowDocument.tilesetPath
        )

        if (isCancelled) {
          return
        }

        if (tilesetPayload.assetKind !== 'tileset') {
          throw new Error('The selected scene window references an invalid tileset.')
        }

        setWindowTilesetDocument(tilesetPayload.document as TilesetAssetDocument)
        setLoadError(null)
      } catch (error) {
        console.error('[scene-editor] load window references failed', error)

        if (isCancelled) {
          return
        }

        setWindowDocument(null)
        setWindowTilesetDocument(null)
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Something went wrong while loading the scene window.'
        )
      }
    }

    void loadWindowReferences()

    return () => {
      isCancelled = true
    }
  }, [editor.tilemapPath, editor.windowPath, projectPath, reloadVersion])

  useEffect(() => {
    if (!projectPath || actorSpritePaths.length === 0) {
      setSpritePreviews({})
      setDefaultSpritePalettes([null, null])
      if (!editor.tilemapPath) {
        setLoadError(null)
      }
      return
    }

    let isCancelled = false

    const loadSpritePreviews = async (): Promise<void> => {
      try {
        const nextPreviewEntries = await Promise.all(
          actorSpritePaths.map(async (spritePath) => {
            const payload = await window.api.loadProjectAssetFile(projectPath, spritePath)

            if (payload.assetKind !== 'sprite') {
              throw new Error('A selected actor sprite reference is not a sprite asset.')
            }

            const spriteDocument = payload.document as SpriteAssetDocument
            const palette = normalizeProjectPalette(spriteDocument.palette)
            const palette0 = sceneSpritePalettes[0] ?? palette
            const palette1 = sceneSpritePalettes[1] ?? palette0
            const imageUrlsByPalette: [string, string] = [
              renderSpriteDocumentPreview(spriteDocument, palette0),
              renderSpriteDocumentPreview(spriteDocument, palette1)
            ]
            return [
              spritePath,
              {
                path: spritePath,
                imageUrl: imageUrlsByPalette[0],
                imageUrlsByPalette,
                width: spriteDocument.width,
                height: spriteDocument.height,
                palette
              }
            ] as const
          })
        )

        if (isCancelled) {
          return
        }

        setSpritePreviews(Object.fromEntries(nextPreviewEntries))
        const firstPalette = nextPreviewEntries[0]?.[1].palette ?? null
        const spritePalette1Baseline = sceneSpritePalettes[0] ?? firstPalette
        const secondPalette = spritePalette1Baseline
          ? (nextPreviewEntries.find(
              ([, preview]) =>
                !areProjectPalettesEqual(preview.palette, spritePalette1Baseline)
            )?.[1].palette ?? null)
          : null
        setDefaultSpritePalettes([firstPalette, secondPalette])
      } catch (error) {
        console.error('[scene-editor] load sprite previews failed', error)

        if (isCancelled) {
          return
        }

        setSpritePreviews({})
        setDefaultSpritePalettes([null, null])
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Something went wrong while loading the actor sprite previews.'
        )
      }
    }

    void loadSpritePreviews()

    return () => {
      isCancelled = true
    }
  }, [actorSpritePaths, editor.tilemapPath, projectPath, reloadVersion, sceneSpritePalettes])

  const defaultBackgroundPalette =
    tilemapTilesetDocument ?? windowTilesetDocument
      ? normalizeProjectPalette((tilemapTilesetDocument ?? windowTilesetDocument)!.palette)
      : null
  const spritePaletteMismatchPaths = sceneSpritePalettes[0]
    ? Object.values(spritePreviews)
        .filter(
          (preview) =>
            !areProjectPalettesEqual(preview.palette, sceneSpritePalettes[0]) &&
            !areProjectPalettesEqual(preview.palette, sceneSpritePalettes[1])
        )
        .map((preview) => preview.path)
    : []
  const backgroundPaletteMismatchPaths = editor.backgroundPalette
    ? [
        ...(tilemapTilesetDocument &&
        !areProjectPalettesEqual(tilemapTilesetDocument.palette, editor.backgroundPalette)
          ? [editor.tilemapPath]
          : []),
        ...(windowTilesetDocument &&
        !areProjectPalettesEqual(windowTilesetDocument.palette, editor.backgroundPalette)
          ? [editor.windowPath]
          : [])
      ].filter((path): path is string => typeof path === 'string')
    : []

  return {
    tilemapDocument,
    tilemapTilesetDocument,
    windowDocument,
    windowTilesetDocument,
    spritePreviews,
    defaultSpritePalettes,
    defaultBackgroundPalette,
    spritePaletteMismatchPaths,
    backgroundPaletteMismatchPaths,
    loadError
  }
}
