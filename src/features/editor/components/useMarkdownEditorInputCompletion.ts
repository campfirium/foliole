import { useEffect, useRef } from 'react';

import { afterEditorEventDispatch } from '../model/editorEventCompletion';

import type { MarkdownEditorProps } from './markdownEditorTypes';

export function useMarkdownEditorInputCompletion(props: MarkdownEditorProps) {
  const pending = useRef<{ resolve: () => void } | null>(null);
  const enabled = Boolean(props.onPendingInput);
  useEffect(() => () => {
    pending.current?.resolve();
    pending.current = null;
  }, [enabled, props.nodeId]);
  const start = () => {
    if (!props.onPendingInput || pending.current) return;
    const completion = new Promise<void>(resolve => { pending.current = { resolve }; });
    props.onPendingInput(completion);
  };
  const end = () => {
    const input = pending.current;
    pending.current = null;
    // Let CodeMirror's end-event DOM mutations reach its update listener.
    // Draft delivery and SQLite durability remain separate barriers in the parent.
    if (input) afterEditorEventDispatch(input.resolve);
  };
  return { start, end };
}
