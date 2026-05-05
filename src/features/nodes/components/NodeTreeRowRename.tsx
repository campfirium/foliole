import { useEffect, useState } from 'react';

interface RenameState {
  draftTitle: string;
  isRenaming: boolean;
  beginRename: () => void;
  cancelRename: () => void;
  setDraftTitle: (value: string) => void;
  submitRename: () => void;
}

export function useRenameState(
  label: string,
  nodeId: string,
  onRename?: (nodeId: string, title: string) => void
): RenameState {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(label);

  useEffect(() => {
    setDraftTitle(label);
  }, [label]);

  return {
    draftTitle,
    isRenaming,
    beginRename: () => setIsRenaming(Boolean(onRename)),
    cancelRename: () => {
      setDraftTitle(label);
      setIsRenaming(false);
    },
    setDraftTitle,
    submitRename: () => {
      onRename?.(nodeId, draftTitle);
      setIsRenaming(false);
    }
  };
}

interface NodeRenameInputProps {
  draftTitle: string;
  label: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function NodeRenameInput({
  draftTitle,
  label,
  onCancel,
  onChange,
  onSubmit
}: NodeRenameInputProps) {
  return (
    <input
      aria-label={`Rename ${label}`}
      autoFocus
      className="min-w-0 flex-1 rounded border border-border-strong bg-bg-panel px-2 py-1 text-sm outline-none"
      onBlur={onSubmit}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSubmit();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
      value={draftTitle}
    />
  );
}
