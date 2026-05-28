import type { ReactElement } from 'react'
import {
  getProjectAssetDisplayName,
  type SceneAssetCollisionCallback,
  type SceneAssetCollisionNode
} from '../../../../shared/projectAssets'

interface SceneCollisionCallbackControlsProps {
  collision: SceneAssetCollisionNode
  maxCollisionCallbacks: number
  onSetCollisionCallbacks: (nodeId: string, callbacks: SceneAssetCollisionCallback[]) => void
  onSetCollisionExitCallbacks: (nodeId: string, callbacks: SceneAssetCollisionCallback[]) => void
  onOpenPicker: (mode: 'collision' | 'exit') => void
}

const getPathLabel = (resourcePath: string | null, fallback: string): string => {
  return resourcePath ? getProjectAssetDisplayName(resourcePath.split('/').pop() ?? fallback) : fallback
}

export const SceneCollisionCallbackControls = ({
  collision,
  maxCollisionCallbacks,
  onSetCollisionCallbacks,
  onSetCollisionExitCallbacks,
  onOpenPicker
}: SceneCollisionCallbackControlsProps): ReactElement => {
  const callbacks = collision.callbacks ?? []
  const exitCallbacks = collision.exitCallbacks ?? []
  const hasCallbackLimit = maxCollisionCallbacks > 0

  return (
    <>
      <div className="scene-inspector-pane__field">
        <span>Collision Callbacks</span>
        <strong>
          {callbacks.length} / {maxCollisionCallbacks || 0}
        </strong>
      </div>

      <div className="scene-inspector-pane__callback-list">
        {callbacks.length === 0 && (
          <div className="scene-inspector-pane__hint">No collision callbacks assigned.</div>
        )}

        {callbacks.map((callback, index) => (
          <div
            key={`${callback.scriptPath}:${callback.functionName}`}
            className="scene-inspector-pane__callback-item"
          >
            <div>
              <strong>{callback.functionName}</strong>
              <span>{getPathLabel(callback.scriptPath, 'Script')}</span>
            </div>

            <button
              type="button"
              onClick={() => {
                onSetCollisionCallbacks(
                  collision.id,
                  callbacks.filter((_, callbackIndex) => callbackIndex !== index)
                )
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="scene-inspector-pane__callback-adder">
        <button
          type="button"
          onClick={() => {
            onOpenPicker('collision')
          }}
          disabled={hasCallbackLimit && callbacks.length >= maxCollisionCallbacks}
        >
          Add Callback
        </button>
      </div>

      <div className="scene-inspector-pane__field">
        <span>Collision Exit Callbacks</span>
        <strong>
          {exitCallbacks.length} / {maxCollisionCallbacks || 0}
        </strong>
      </div>

      <div className="scene-inspector-pane__callback-list">
        {exitCallbacks.length === 0 && (
          <div className="scene-inspector-pane__hint">No collision exit callbacks assigned.</div>
        )}

        {exitCallbacks.map((callback, index) => (
          <div
            key={`${callback.scriptPath}:${callback.functionName}`}
            className="scene-inspector-pane__callback-item"
          >
            <div>
              <strong>{callback.functionName}</strong>
              <span>{getPathLabel(callback.scriptPath, 'Script')}</span>
            </div>

            <button
              type="button"
              onClick={() => {
                onSetCollisionExitCallbacks(
                  collision.id,
                  exitCallbacks.filter((_, callbackIndex) => callbackIndex !== index)
                )
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="scene-inspector-pane__callback-adder">
        <button
          type="button"
          onClick={() => {
            onOpenPicker('exit')
          }}
          disabled={hasCallbackLimit && exitCallbacks.length >= maxCollisionCallbacks}
        >
          Add Exit Callback
        </button>
      </div>
    </>
  )
}
