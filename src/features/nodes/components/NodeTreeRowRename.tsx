import { useEffect, useRef, useState } from 'react';

const NODE_RENAME_REQUEST_EVENT = 'foliole:node-rename-request';

interface NodeRenameRequestDetail {
  nodeId: string;
}

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
    const handleRenameRequest = (event: Event) => {
      const detail = (event as CustomEvent<NodeRenameRequestDetail>).detail;
      if (detail?.nodeId === nodeId && onRename) {
        setIsRenaming(true);
      }
    };
    window.addEventListener(NODE_RENAME_REQUEST_EVENT, handleRenameRequest);
    return () => window.removeEventListener(NODE_RENAME_REQUEST_EVENT, handleRenameRequest);
  }, [nodeId, onRename]);

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

export function requestNodeRename(nodeId: string | null | undefined) {
  if (!nodeId) {
    return false;
  }
  window.dispatchEvent(new CustomEvent<NodeRenameRequestDetail>(NODE_RENAME_REQUEST_EVENT, { detail: { nodeId } }));
  return true;
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
  const skipNextBlurSubmitRef = useRef(false);

  return (
    <input
      aria-label={`Rename ${label}`}
      autoFocus
      className="box-border h-5 min-w-0 max-w-full flex-1 rounded-sm border border-border/35 bg-[var(--app-surface-control-bg)] px-1.5 py-0 text-[13px] leading-5 text-foreground focus:border-border/70 focus:bg-[var(--app-surface-control-hover-bg)] focus-visible:outline-none"
      onBlur={() => {
        if (skipNextBlurSubmitRef.current) {
          skipNextBlurSubmitRef.current = false;
          return;
        }
        onSubmit();
      }}
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
          event.stopPropagation();
          skipNextBlurSubmitRef.current = true;
          onCancel();
        }
      }}
      value={draftTitle}
    />
  );
}
