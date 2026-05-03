import { useCallback, useEffect, useMemo, useState } from 'react'
import { getParsedScriptPropertyDefinitions } from '../../../../shared/projectScriptProperties'
import type {
  ProjectCodeSymbolIndex,
  ProjectScriptCallbackCandidate
} from '../../../../shared/projectCodeWorkspace'
import type { SceneAssetDocument } from '../../../../shared/projectAssets'
import type { ProjectScriptOption } from '../ProjectAssets/projectScriptBrowser'
import { listProjectScriptsByKind } from '../ProjectAssets/projectScriptBrowser'
import type { SceneDocumentEditor } from '../SceneHierarchy/useSceneDocumentEditor'

interface UseSceneWorkspaceScriptDataOptions {
  editor: SceneDocumentEditor
  onStatus: (tone: 'info' | 'error', text: string) => void
  projectPath: string
  scene: SceneAssetDocument | null
}

interface UseSceneWorkspaceScriptDataResult {
  sceneScriptOptions: ProjectScriptOption[]
  actorScriptOptions: ProjectScriptOption[]
  collisionCallbackCandidates: ProjectScriptCallbackCandidate[]
  isCollisionCallbackPickerLoading: boolean
  collisionCallbackPickerErrorMessage: string | null
  maxCollisionCallbacks: number
  refreshSceneScriptData: () => Promise<void>
  sceneScriptPropertyDefinitions: ReturnType<typeof getParsedScriptPropertyDefinitions>
  actorScriptPropertyDefinitions: ReturnType<typeof getParsedScriptPropertyDefinitions>
}

export const useSceneWorkspaceScriptData = ({
  editor,
  onStatus,
  projectPath,
  scene
}: UseSceneWorkspaceScriptDataOptions): UseSceneWorkspaceScriptDataResult => {
  const [projectCodeSymbolIndex, setProjectCodeSymbolIndex] =
    useState<ProjectCodeSymbolIndex | null>(null)
  const [sceneScriptOptions, setSceneScriptOptions] = useState<ProjectScriptOption[]>([])
  const [actorScriptOptions, setActorScriptOptions] = useState<ProjectScriptOption[]>([])
  const [collisionCallbackCandidates, setCollisionCallbackCandidates] = useState<
    ProjectScriptCallbackCandidate[]
  >([])
  const [isCollisionCallbackPickerLoading, setIsCollisionCallbackPickerLoading] = useState(false)
  const [collisionCallbackPickerErrorMessage, setCollisionCallbackPickerErrorMessage] = useState<
    string | null
  >(null)
  const [maxCollisionCallbacks, setMaxCollisionCallbacks] = useState(0)

  const refreshSceneScriptData = useCallback(async (): Promise<void> => {
    if (!projectPath) {
      setSceneScriptOptions([])
      setActorScriptOptions([])
      setCollisionCallbackCandidates([])
      setCollisionCallbackPickerErrorMessage(null)
      setMaxCollisionCallbacks(0)
      return
    }

    setIsCollisionCallbackPickerLoading(true)
    setCollisionCallbackPickerErrorMessage(null)

    try {
      const [
        nextSceneScripts,
        nextActorScripts,
        generalCallbackCandidates,
        actorCallbackCandidates,
        sceneCallbackCandidates,
        nextMaxCallbacks
      ] = await Promise.all([
        listProjectScriptsByKind(projectPath, ['scene']),
        listProjectScriptsByKind(projectPath, ['actor']),
        window.api.listProjectScriptCallbackCandidates(projectPath, 'general'),
        window.api.listProjectScriptCallbackCandidates(projectPath, 'actor'),
        window.api.listProjectScriptCallbackCandidates(projectPath, 'scene'),
        window.api.readMaxCollisionCallbacks(projectPath)
      ])

      const nextCollisionCallbackCandidates = [
        ...generalCallbackCandidates,
        ...actorCallbackCandidates,
        ...sceneCallbackCandidates
      ].sort((left, right) => {
        if (left.scriptPath !== right.scriptPath) {
          return left.scriptPath.localeCompare(right.scriptPath)
        }

        return left.functionName.localeCompare(right.functionName)
      })

      setSceneScriptOptions(nextSceneScripts)
      setActorScriptOptions(nextActorScripts)
      setCollisionCallbackCandidates(nextCollisionCallbackCandidates)
      setMaxCollisionCallbacks(nextMaxCallbacks)
    } catch (error) {
      console.error('[scene-editor] load script data failed', error)
      const message =
        error instanceof Error
          ? error.message
          : 'Something went wrong while loading script resources.'

      setCollisionCallbackPickerErrorMessage(message)
      onStatus('error', message)
    } finally {
      setIsCollisionCallbackPickerLoading(false)
    }
  }, [onStatus, projectPath])

  const refreshProjectCodeSymbolIndex = useCallback(async (): Promise<void> => {
    if (!projectPath) {
      setProjectCodeSymbolIndex(null)
      return
    }

    try {
      const nextSymbolIndex = await window.api.getProjectCodeSymbolIndex(projectPath)
      setProjectCodeSymbolIndex(nextSymbolIndex)
    } catch (error) {
      console.error('[scene-editor] load project code symbol index failed', error)
      setProjectCodeSymbolIndex(null)
      onStatus(
        'error',
        error instanceof Error
          ? error.message
          : 'Something went wrong while loading parsed script properties.'
      )
    }
  }, [onStatus, projectPath])

  useEffect(() => {
    void refreshSceneScriptData()
  }, [refreshSceneScriptData, scene])

  useEffect(() => {
    void refreshProjectCodeSymbolIndex()
  }, [refreshProjectCodeSymbolIndex, scene, editor.scriptPath, editor.selectedActor?.scriptPath])

  useEffect(() => {
    if (!projectPath) {
      return
    }

    return window.api.onProjectScriptSaved((payload) => {
      if (payload.projectPath !== projectPath) {
        return
      }

      void refreshProjectCodeSymbolIndex()
    })
  }, [projectPath, refreshProjectCodeSymbolIndex])

  const sceneScriptPropertyDefinitions = useMemo(
    () => getParsedScriptPropertyDefinitions(editor.scriptPath, projectCodeSymbolIndex),
    [editor.scriptPath, projectCodeSymbolIndex]
  )
  const actorScriptPropertyDefinitions = useMemo(
    () =>
      getParsedScriptPropertyDefinitions(
        editor.selectedActor?.scriptPath ?? null,
        projectCodeSymbolIndex
      ),
    [editor.selectedActor?.scriptPath, projectCodeSymbolIndex]
  )

  return {
    sceneScriptOptions,
    actorScriptOptions,
    collisionCallbackCandidates,
    isCollisionCallbackPickerLoading,
    collisionCallbackPickerErrorMessage,
    maxCollisionCallbacks,
    refreshSceneScriptData,
    sceneScriptPropertyDefinitions,
    actorScriptPropertyDefinitions
  }
}
