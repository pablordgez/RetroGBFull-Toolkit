import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type SceneAssetDocument,
  getProjectAssetDisplayName,
  serializeProjectAssetDocument
} from '../../../../shared/projectAssets'
import type { ResourceMutationEvent } from '../Docking/projectResourceEvents'

interface UseSceneWorkspaceSessionOptions {
  projectPath: string
  onError: (message: string) => void
}

interface UseSceneWorkspaceSessionResult {
  activeScenePath: string | null
  activeSceneDocument: SceneAssetDocument | null
  activeSceneLabel: string | null
  isSceneDirty: boolean
  sceneStatusMessage: string | null
  isSceneSaving: boolean
  isSceneLoading: boolean
  isSceneClosePromptOpen: boolean
  openScene: (scenePath: string) => Promise<void>
  updateSceneDocument: (nextDocument: SceneAssetDocument) => void
  saveActiveScene: () => Promise<boolean>
  handleSceneCloseDecision: (decision: 'save' | 'discard' | 'cancel') => Promise<void>
  handleTrackedResourceMutation: (event: ResourceMutationEvent) => void
}

const GENERIC_SCENE_ERRORS = {
  open: 'Something went wrong while opening the scene. Please try again.',
  save: 'Something went wrong while saving the scene.'
} as const

const isSameOrDescendantPath = (resourcePath: string, rootPath: string): boolean => {
  return resourcePath === rootPath || resourcePath.startsWith(`${rootPath}/`)
}

const remapDescendantPath = (
  resourcePath: string,
  previousRootPath: string,
  nextRootPath: string
): string => {
  return resourcePath === previousRootPath
    ? nextRootPath
    : `${nextRootPath}${resourcePath.slice(previousRootPath.length)}`
}

export const useSceneWorkspaceSession = ({
  projectPath,
  onError
}: UseSceneWorkspaceSessionOptions): UseSceneWorkspaceSessionResult => {
  const [activeScenePath, setActiveScenePath] = useState<string | null>(null)
  const [activeSceneDocument, setActiveSceneDocument] = useState<SceneAssetDocument | null>(null)
  const [savedSceneSnapshot, setSavedSceneSnapshot] = useState<string | null>(null)
  const [sceneStatusMessage, setSceneStatusMessage] = useState<string | null>(null)
  const [isSceneSaving, setIsSceneSaving] = useState(false)
  const [isSceneLoading, setIsSceneLoading] = useState(false)
  const [pendingScenePath, setPendingScenePath] = useState<string | null>(null)
  const [isSceneClosePromptOpen, setIsSceneClosePromptOpen] = useState(false)

  const activeSceneLabel = useMemo(() => {
    if (!activeScenePath) {
      return null
    }

    return getProjectAssetDisplayName(activeScenePath.split('/').pop() ?? 'Scene')
  }, [activeScenePath])

  const serializedSceneDocument = useMemo(() => {
    return activeSceneDocument ? serializeProjectAssetDocument(activeSceneDocument) : null
  }, [activeSceneDocument])

  const isSceneDirty =
    activeScenePath !== null &&
    activeSceneDocument !== null &&
    savedSceneSnapshot !== null &&
    serializedSceneDocument !== savedSceneSnapshot

  const closeActiveScene = useCallback(() => {
    setActiveScenePath(null)
    setActiveSceneDocument(null)
    setSavedSceneSnapshot(null)
    setSceneStatusMessage(null)
    setPendingScenePath(null)
    setIsSceneClosePromptOpen(false)
  }, [])

  useEffect(() => {
    closeActiveScene()
  }, [closeActiveScene, projectPath])

  const loadScene = useCallback(
    async (scenePath: string) => {
      if (!projectPath) {
        return
      }

      setIsSceneLoading(true)

      try {
        const payload = await window.api.loadProjectAssetFile(projectPath, scenePath)

        if (payload.assetKind !== 'scene') {
          throw new Error(`Expected a scene asset but received a ${payload.assetKind} asset.`)
        }

        const sceneDocument = payload.document as SceneAssetDocument
        setActiveScenePath(scenePath)
        setActiveSceneDocument(sceneDocument)
        setSavedSceneSnapshot(serializeProjectAssetDocument(sceneDocument))
        setSceneStatusMessage(null)
        setPendingScenePath(null)
        setIsSceneClosePromptOpen(false)
      } catch (error) {
        console.error('[project-workspace] load scene failed', error)
        onError(error instanceof Error ? error.message : GENERIC_SCENE_ERRORS.open)
      } finally {
        setIsSceneLoading(false)
      }
    },
    [onError, projectPath]
  )

  const saveActiveScene = useCallback(async (): Promise<boolean> => {
    if (!projectPath || !activeScenePath || !activeSceneDocument) {
      return false
    }

    setIsSceneSaving(true)

    try {
      const payload = await window.api.saveProjectAssetFile(
        projectPath,
        activeScenePath,
        activeSceneDocument
      )

      if (payload.assetKind !== 'scene') {
        throw new Error(`Expected a scene asset but received a ${payload.assetKind} asset.`)
      }

      setSavedSceneSnapshot(serializeProjectAssetDocument(payload.document as SceneAssetDocument))
      setSceneStatusMessage('Saved.')
      return true
    } catch (error) {
      console.error('[project-workspace] save scene failed', error)
      onError(error instanceof Error ? error.message : GENERIC_SCENE_ERRORS.save)
      return false
    } finally {
      setIsSceneSaving(false)
    }
  }, [activeSceneDocument, activeScenePath, onError, projectPath])

  const openScene = useCallback(
    async (scenePath: string) => {
      if (scenePath === activeScenePath) {
        return
      }

      if (activeScenePath && isSceneDirty) {
        setPendingScenePath(scenePath)
        setIsSceneClosePromptOpen(true)
        return
      }

      await loadScene(scenePath)
    },
    [activeScenePath, isSceneDirty, loadScene]
  )

  const updateSceneDocument = useCallback((nextDocument: SceneAssetDocument) => {
    setActiveSceneDocument(nextDocument)
    setSceneStatusMessage(null)
  }, [])

  const handleSceneCloseDecision = useCallback(
    async (decision: 'save' | 'discard' | 'cancel') => {
      if (decision === 'cancel') {
        setIsSceneClosePromptOpen(false)
        setPendingScenePath(null)
        return
      }

      if (decision === 'save') {
        const didSave = await saveActiveScene()

        if (!didSave) {
          return
        }
      }

      setIsSceneClosePromptOpen(false)

      if (pendingScenePath) {
        await loadScene(pendingScenePath)
        return
      }

      closeActiveScene()
    },
    [closeActiveScene, loadScene, pendingScenePath, saveActiveScene]
  )

  const handleTrackedResourceMutation = useCallback(
    (event: ResourceMutationEvent) => {
      if (!activeScenePath) {
        return
      }

      if (
        event.action === 'delete' &&
        isSameOrDescendantPath(activeScenePath, event.resourcePath)
      ) {
        closeActiveScene()
        return
      }

      if (
        (event.action === 'rename' || event.action === 'move') &&
        event.previousResourcePath &&
        isSameOrDescendantPath(activeScenePath, event.previousResourcePath)
      ) {
        setActiveScenePath(
          remapDescendantPath(activeScenePath, event.previousResourcePath, event.resourcePath)
        )
      }
    },
    [activeScenePath, closeActiveScene]
  )

  return {
    activeScenePath,
    activeSceneDocument,
    activeSceneLabel,
    isSceneDirty,
    sceneStatusMessage,
    isSceneSaving,
    isSceneLoading,
    isSceneClosePromptOpen,
    openScene,
    updateSceneDocument,
    saveActiveScene,
    handleSceneCloseDecision,
    handleTrackedResourceMutation
  }
}
