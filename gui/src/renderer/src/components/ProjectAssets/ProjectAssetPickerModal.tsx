import { type ReactElement } from 'react'
import { PROJECT_ASSET_LABELS } from '../../../../shared/projectAssets'
import type { ProjectAssetOption } from './projectAssetBrowser'

interface ProjectAssetPickerModalProps {
  title: string
  description: string
  options: ProjectAssetOption[]
  isLoading: boolean
  errorMessage?: string | null
  emptyMessage: string
  noneLabel?: string | null
  isBusy?: boolean
  onRefresh: () => void
  onClose: () => void
  onSelectNone?: (() => void) | null
  onSelect: (option: ProjectAssetOption) => void
}

export const ProjectAssetPickerModal = ({
  title,
  description,
  options,
  isLoading,
  errorMessage,
  emptyMessage,
  noneLabel,
  isBusy = false,
  onRefresh,
  onClose,
  onSelectNone,
  onSelect
}: ProjectAssetPickerModalProps): ReactElement => {
  return (
    <div className="editor-modal-backdrop">
      <div className="editor-modal" role="dialog" aria-modal="true">
        <h2>{title}</h2>
        <p className="editor-modal-copy">{description}</p>

        {errorMessage && (
          <div className="editor-status" style={{ marginTop: '16px', marginBottom: 0 }}>
            {errorMessage}
          </div>
        )}

        <div className="tilemap-editor__tileset-list" role="list">
          {!isLoading && onSelectNone && (
            <button
              type="button"
              className="tilemap-editor__tileset-option"
              onClick={onSelectNone}
              disabled={isBusy}
            >
              <span>{noneLabel ?? 'None'}</span>
              <span className="tilemap-editor__tileset-path">Clear the current reference.</span>
            </button>
          )}

          {isLoading && (
            <div className="tilemap-editor__tileset-option tilemap-editor__tileset-option--empty">
              Loading assets...
            </div>
          )}

          {!isLoading && options.length === 0 && (
            <div className="tilemap-editor__tileset-option tilemap-editor__tileset-option--empty">
              {emptyMessage}
            </div>
          )}

          {!isLoading &&
            options.map((option) => (
              <button
                key={option.path}
                type="button"
                className="tilemap-editor__tileset-option"
                onClick={() => {
                  onSelect(option)
                }}
                disabled={isBusy}
              >
                <span>
                  {option.name} <small>({PROJECT_ASSET_LABELS[option.kind]})</small>
                </span>
                <span className="tilemap-editor__tileset-path">{option.path}</span>
              </button>
            ))}
        </div>

        <div className="editor-modal-actions">
          <button type="button" onClick={onRefresh} disabled={isLoading || isBusy}>
            Refresh
          </button>
          <button type="button" onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
