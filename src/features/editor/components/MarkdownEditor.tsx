import { useEffect, useRef } from 'react';

import { clearDebugEditorAdapter, registerDebugEditorAdapter } from '../../../shared/testing/debugBridge';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorAdapter } from '../adapters/EditorAdapter';

interface EditorViewState {
  scrollTop: number;
  selection: {
    from: number;
    to: number;
  };
}

interface MarkdownEditorProps {
  ariaLabel?: string;
  className?: string;
  debugId?: string;
  nodeId: string | null;
  nodeViewState?: EditorViewState;
  value: string;
  onChange: (value: string) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
}

export function MarkdownEditor({
  ariaLabel,
  className,
  debugId,
  nodeId,
  nodeViewState,
  value,
  onChange,
  onReady
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<CodeMirrorEditorAdapter | null>(null);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);

  onChangeRef.current = onChange;
  onReadyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || adapterRef.current) {
      return;
    }

    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: value,
      onChange: (nextValue) => onChangeRef.current(nextValue)
    });

    adapterRef.current = adapter;
    if (debugId) {
      registerDebugEditorAdapter(debugId, adapter);
    }
    onReadyRef.current?.(adapter);
    return () => {
      onReadyRef.current?.(null);
      if (debugId) {
        clearDebugEditorAdapter(debugId);
      }
      adapter.destroy();
      adapterRef.current = null;
    };
  }, [debugId]);

  useEffect(() => {
    adapterRef.current?.setContent(value);
  }, [value]);

  useEffect(() => {
    if (!nodeId || !nodeViewState) {
      return;
    }
    const adapter = adapterRef.current;
    if (!adapter) {
      return;
    }

    adapter.setSelection(nodeViewState.selection);
    adapter.setScrollTop(nodeViewState.scrollTop);
  }, [nodeId, nodeViewState]);

  const hostClassName = className ? `markdown-editor-host ${className}` : 'markdown-editor-host';
  return <div aria-label={ariaLabel} className={hostClassName} ref={hostRef} />;
}
