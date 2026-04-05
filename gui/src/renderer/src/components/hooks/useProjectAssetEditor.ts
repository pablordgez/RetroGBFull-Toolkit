import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ProjectAssetDocument,
  ProjectAssetKind,
  serializeProjectAssetDocument
} from '../../../../shared/projectAssets'

interface UseProjectAssetEditorOptions<TDocument extends ProjectAssetDocument> {
  expectedKind: ProjectAssetKind
  document: TDocument
  applyDocument: (document: TDocument) => void
}

type CloseDecision = 'save' | 'discard' | 'cancel'

export const useProjectAssetEditor = <TDocument extends ProjectAssetDocument>({
  expectedKind,
  document,
  applyDocument
}: UseProjectAssetEditorOptions<TDocument>) => {
  const [searchParams] = useSearchParams()
  const projectPath = searchParams.get('projectPath') ?? ''
  const assetPath = searchParams.get('assetPath') ?? ''
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isClosePromptOpen, setIsClosePromptOpen] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)

  const serializedDocument = useMemo(() => serializeProjectAssetDocument(document), [document])
  const isAssetBacked = projectPath.length > 0 && assetPath.length > 0
  const isDirty = savedSnapshot !== null && serializedDocument !== savedSnapshot
  const initializedAssetRef = useRef<string | null>(null)

  useEffect(() => {
    let isCancelled = false
    const assetKey = `${expectedKind}:${projectPath}:${assetPath}`

    if (initializedAssetRef.current === assetKey) {
      return
    }

    const loadAsset = async () => {
      if (!isAssetBacked) {
        setSavedSnapshot(serializedDocument)
        setIsLoaded(true)
        initializedAssetRef.current = assetKey
        return
      }

      try {
        const payload = await window.api.loadProjectAssetFile(projectPath, assetPath)

        if (isCancelled) {
          return
        }

        if (payload.assetKind !== expectedKind) {
          throw new Error(`Expected a ${expectedKind} asset but received a ${payload.assetKind} asset.`)
        }

        applyDocument(payload.document as TDocument)
        setSavedSnapshot(serializeProjectAssetDocument(payload.document))
        setStatusMessage(null)
        initializedAssetRef.current = assetKey
      } catch (error) {
        console.error('[project-asset-editor] loadProjectAssetFile failed', error)
        setStatusMessage(
          error instanceof Error
            ? error.message
            : 'Something went wrong while loading the asset. Please try again.'
        )
      } finally {
        if (!isCancelled) {
          setIsLoaded(true)
        }
      }
    }

    void loadAsset()

    return () => {
      isCancelled = true
    }
  }, [applyDocument, assetPath, expectedKind, isAssetBacked, projectPath, serializedDocument])

  const saveAsset = useCallback(async (): Promise<boolean> => {
    if (!isAssetBacked) {
      setSavedSnapshot(serializedDocument)
      setStatusMessage('Saved.')
      return true
    }

    setIsSaving(true)

    try {
      const payload = await window.api.saveProjectAssetFile(projectPath, assetPath, document)
      setSavedSnapshot(serializeProjectAssetDocument(payload.document))
      setStatusMessage('Saved.')
      return true
    } catch (error) {
      console.error('[project-asset-editor] saveProjectAssetFile failed', error)
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong while saving the asset. Please try again.'
      )
      return false
    } finally {
      setIsSaving(false)
    }
  }, [assetPath, document, isAssetBacked, projectPath, serializedDocument])

  useEffect(() => {
    if (!isAssetBacked) {
      return
    }

    return window.api.onEditorCloseRequested(() => {
      if (isDirty) {
        setIsClosePromptOpen(true)
        return
      }

      void window.api.confirmEditorClose()
    })
  }, [isAssetBacked, isDirty])

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return
      }

      if (event.key.toLowerCase() !== 's') {
        return
      }

      event.preventDefault()
      void saveAsset()
    }

    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  }, [saveAsset])

  const handleCloseDecision = useCallback(
    async (decision: CloseDecision) => {
      if (decision === 'cancel') {
        setIsClosePromptOpen(false)
        return
      }

      if (decision === 'save') {
        const didSave = await saveAsset()

        if (!didSave) {
          return
        }
      }

      setIsClosePromptOpen(false)
      await window.api.confirmEditorClose()
    },
    [saveAsset]
  )

  return {
    assetPath,
    isClosePromptOpen,
    isDirty,
    isLoaded,
    isSaving,
    projectPath,
    saveAsset,
    statusMessage,
    setStatusMessage,
    handleCloseDecision
  }
}
