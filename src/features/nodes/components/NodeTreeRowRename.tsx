import { useEffect, useRef, useState } from 'react';

import { UNTITLED_NODE_TITLE } from '../model/deriveNodeTitle';

import { registerActiveNodeRenameCommit } from './nodeRenameCommitCapability';

const NODE_RENAME_REQUEST_EVENT = 'foliole:node-rename-request';

interface NodeRenameRequestDetail {
  focusBody?: () => void;
  nodeId: string;
  restoreOrigin?: () => void;
}

type RenameExitTarget = 'body' | 'none' | 'origin';
type NodeRenameHandler = (nodeId: string, title: string) => boolean | void | Promise<boolean | void>;

interface RenameState {
  draftTitle: string;
  focusBodyOnTab: boolean;
  isRenaming: boolean;
  beginRename: () => void;
  cancelRename: () => void;
  setDraftTitle: (value: string) => void;
  submitRename: (target: RenameExitTarget) => Promise<boolean>;
}

function scheduleFocus(action: (() => void) | undefined) {
  if (action) window.requestAnimationFrame(action);
}

function resolveExitFocus(detail: NodeRenameRequestDetail, target: RenameExitTarget) {
  if (target === 'body') return detail.focusBody;
  if (target === 'origin') return detail.restoreOrigin;
  return undefined;
}

function createSubmitRename(args: {
  cancellationRef: { current: boolean };
  draftTitle: string;
  focusSessionRef: { current: NodeRenameRequestDetail };
  label: string;
  nodeId: string;
  onRename: NodeRenameHandler | undefined;
  setIsRenaming: (value: boolean) => void;
  submissionRef: { current: Promise<boolean> | null };
}) {
  return (target: RenameExitTarget) => {
    if (args.cancellationRef.current) return Promise.resolve(true);
    if (args.submissionRef.current) return args.submissionRef.current;
    const submission = (async () => {
      const normalizedTitle = args.draftTitle.trim() || UNTITLED_NODE_TITLE;
      let succeeded = normalizedTitle === args.label;
      if (!succeeded && args.onRename) {
        try {
          succeeded = await args.onRename(args.nodeId, args.draftTitle) !== false;
        } catch {
          succeeded = false;
        }
      }
      if (!succeeded) {
        args.submissionRef.current = null;
        return false;
      }
      args.setIsRenaming(false);
      scheduleFocus(resolveExitFocus(args.focusSessionRef.current, target));
      return true;
    })();
    args.submissionRef.current = submission;
    return submission;
  };
}

export function useRenameState(
  label: string,
  nodeId: string,
  onRename?: NodeRenameHandler
): RenameState {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(label);
  const cancellationRef = useRef(false);
  const focusSessionRef = useRef<NodeRenameRequestDetail>({ nodeId });
  const submissionRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    const handleRenameRequest = (event: Event) => {
      const detail = (event as CustomEvent<NodeRenameRequestDetail>).detail;
      if (detail?.nodeId === nodeId && onRename) {
        focusSessionRef.current = detail;
        cancellationRef.current = false;
        submissionRef.current = null;
        setDraftTitle(label);
        setIsRenaming(true);
      }
    };
    window.addEventListener(NODE_RENAME_REQUEST_EVENT, handleRenameRequest);
    return () => window.removeEventListener(NODE_RENAME_REQUEST_EVENT, handleRenameRequest);
  }, [nodeId, onRename]);

  useEffect(() => {
    setDraftTitle(label);
  }, [label]);

  const submitRename = createSubmitRename({
    cancellationRef, draftTitle, focusSessionRef, label, nodeId, onRename, setIsRenaming, submissionRef
  });

  useEffect(() => {
    if (!isRenaming) return undefined;
    return registerActiveNodeRenameCommit(() => submitRename('none'));
  }, [isRenaming, submitRename]);

  return {
    draftTitle,
    focusBodyOnTab: Boolean(focusSessionRef.current.focusBody),
    isRenaming,
    beginRename: () => {
      focusSessionRef.current = { nodeId };
      cancellationRef.current = false;
      submissionRef.current = null;
      setIsRenaming(Boolean(onRename));
    },
    cancelRename: () => {
      if (submissionRef.current) return;
      cancellationRef.current = true;
      setDraftTitle(label);
      setIsRenaming(false);
      scheduleFocus(focusSessionRef.current.restoreOrigin);
    },
    setDraftTitle,
    submitRename
  };
}

export function requestNodeRename(nodeId: string | null | undefined, focusBody?: () => void) {
  if (!nodeId) {
    return false;
  }
  const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const restoreOrigin = origin?.closest('.prompt-editor-host') && focusBody
    ? focusBody
    : origin ? () => origin.focus() : undefined;
  window.dispatchEvent(new CustomEvent<NodeRenameRequestDetail>(NODE_RENAME_REQUEST_EVENT, {
    detail: { nodeId, ...(focusBody ? { focusBody } : {}), ...(restoreOrigin ? { restoreOrigin } : {}) }
  }));
  return true;
}

interface NodeRenameInputProps {
  draftTitle: string;
  focusBodyOnTab: boolean;
  label: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: (target: RenameExitTarget) => Promise<boolean>;
}

export function NodeRenameInput({
  draftTitle,
  focusBodyOnTab,
  label,
  onCancel,
  onChange,
  onSubmit
}: NodeRenameInputProps) {
  const skipNextBlurSubmitRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = (target: RenameExitTarget) => {
    void onSubmit(target).then((succeeded) => {
      if (!succeeded) inputRef.current?.focus();
    });
  };

  return (
    <input
      aria-label={`Rename ${label}`}
      autoFocus
      className="box-border min-w-0 max-w-full flex-1 rounded-sm border border-border/35 bg-[var(--app-surface-control-bg)] px-1.5 py-0 text-foreground [font-size:var(--navigation-title-font-size)] [height:var(--navigation-title-line-height)] [line-height:var(--navigation-title-line-height)] focus:border-border/70 focus:bg-[var(--app-surface-control-hover-bg)] focus-visible:outline-none"
      onBlur={() => {
        if (skipNextBlurSubmitRef.current) {
          skipNextBlurSubmitRef.current = false;
          return;
        }
        submit('none');
      }}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Tab' && focusBodyOnTab) {
          event.preventDefault();
          event.stopPropagation();
          submit('body');
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          submit('origin');
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          skipNextBlurSubmitRef.current = true;
          onCancel();
        }
      }}
      ref={inputRef}
      value={draftTitle}
    />
  );
}
