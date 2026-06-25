interface EditorClosePromptProps {
  assetLabel: string
  isBusy: boolean
  onCloseDecision: (decision: 'save' | 'discard' | 'cancel') => void
}

export const EditorClosePrompt = ({
  assetLabel,
  isBusy,
  onCloseDecision
}: EditorClosePromptProps) => {
  const titleId = 'editor-close-prompt-title'

  return (
    <div className="editor-modal-backdrop">
      <div
        className="editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>Save changes to "{assetLabel}"?</h2>
        <p className="editor-modal-copy">
          Save before closing?
        </p>

        <div className="editor-modal-actions">
          <button type="button" onClick={() => onCloseDecision('cancel')} disabled={isBusy}>
            Cancel
          </button>
          <button type="button" onClick={() => onCloseDecision('discard')} disabled={isBusy}>
            Don&apos;t Save
          </button>
          <button type="button" onClick={() => onCloseDecision('save')} disabled={isBusy}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
