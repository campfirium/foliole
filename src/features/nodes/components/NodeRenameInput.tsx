import { useEffect, useRef, type KeyboardEvent } from 'react';

import { onWindowPriorityEscape } from '../../../shared/platform/keyboard';

import type { RenameExitTarget } from './NodeTreeRowRename';

interface NodeRenameInputProps {
  draftTitle: string;
  focusBodyOnTab: boolean;
  label: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: (target: RenameExitTarget) => Promise<boolean>;
}

function useRenameEscape(args: {
  inputRef: { current: HTMLInputElement | null };
  onCancel: () => void;
  skipNextBlurSubmitRef: { current: boolean };
}) {
  useEffect(() => onWindowPriorityEscape(() => {
    if (document.activeElement !== args.inputRef.current) return false;
    args.skipNextBlurSubmitRef.current = true;
    args.onCancel();
  }), [args]);
}

function handleRenameInputKeyDown(args: {
  event: KeyboardEvent<HTMLInputElement>;
  focusBodyOnTab: boolean;
  isComposing: boolean;
  onCancel: () => void;
  skipNextBlurSubmitRef: { current: boolean };
  submit: (target: RenameExitTarget) => void;
}) {
  const { event } = args;
  if (args.isComposing || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
  if (event.key === 'Tab' && args.focusBodyOnTab) {
    event.preventDefault();
    event.stopPropagation();
    args.submit('body');
  } else if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    args.submit('origin');
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    args.skipNextBlurSubmitRef.current = true;
    args.onCancel();
  }
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
  const isComposingRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  useRenameEscape({ inputRef, onCancel, skipNextBlurSubmitRef });

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
      onCompositionEnd={() => { isComposingRef.current = false; }}
      onCompositionStart={() => { isComposingRef.current = true; }}
      onKeyDown={(event) => handleRenameInputKeyDown({
        event, focusBodyOnTab, isComposing: isComposingRef.current, onCancel, skipNextBlurSubmitRef, submit
      })}
      ref={inputRef}
      value={draftTitle}
    />
  );
}
