import type { ReactElement } from 'react'
import type { ProjectResourceKind } from '../../../../shared/projectResourceModels'
import type { ProjectScriptKind } from '../../../../shared/projectScripts'
import { getResourceTypeLabel } from './resourceManagementShared'

interface PendingDeleteResource {
  name: string
  resourceType: ProjectResourceKind
  scriptKind?: ProjectScriptKind | null
  warningMessage?: string | null
}

interface PendingBankResource {
  name: string
  currentBank: number
  draftBank: string
}

interface DeleteResourceModalProps {
  resource: PendingDeleteResource
  isInteractionDisabled: boolean
  onCancel: () => void
  onConfirm: () => void
}

interface BankResourceModalProps {
  resource: PendingBankResource
  isInteractionDisabled: boolean
  onCancel: () => void
  onDraftBankChange: (draftBank: string) => void
  onReset: () => void
  onSave: () => void
}

export const DeleteResourceModal = ({
  resource,
  isInteractionDisabled,
  onCancel,
  onConfirm
}: DeleteResourceModalProps): ReactElement => {
  return (
    <div className="resource-management-pane__modal-backdrop">
      <div className="resource-management-pane__modal" role="dialog" aria-modal="true">
        <h2>Delete &quot;{resource.name}&quot;?</h2>
        <p className="resource-management-pane__modal-copy">
          This will remove everything inside that{' '}
          {getResourceTypeLabel(resource.resourceType, resource.scriptKind).toLowerCase()}.
        </p>
        {resource.warningMessage && (
          <p className="resource-management-pane__modal-copy">{resource.warningMessage}</p>
        )}

        <div className="resource-management-pane__modal-actions">
          <button type="button" onClick={onCancel} disabled={isInteractionDisabled}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={isInteractionDisabled}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export const BankResourceModal = ({
  resource,
  isInteractionDisabled,
  onCancel,
  onDraftBankChange,
  onReset,
  onSave
}: BankResourceModalProps): ReactElement => {
  return (
    <div className="resource-management-pane__modal-backdrop">
      <div className="resource-management-pane__modal" role="dialog" aria-modal="true">
        <h2>Set Bank For &quot;{resource.name}&quot;</h2>
        <p className="resource-management-pane__modal-copy">Choose the emitted ROM bank.</p>

        <label
          className="resource-management-pane__modal-copy"
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}
        >
          <span>Bank (0-255)</span>
          <input
            type="number"
            min={0}
            max={255}
            value={resource.draftBank}
            onChange={(event) => {
              onDraftBankChange(event.target.value)
            }}
            disabled={isInteractionDisabled}
          />
        </label>

        <div className="resource-management-pane__modal-actions">
          <button type="button" onClick={onCancel} disabled={isInteractionDisabled}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={isInteractionDisabled || resource.currentBank === 255}
          >
            Reset To 255
          </button>
          <button type="button" onClick={onSave} disabled={isInteractionDisabled}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
