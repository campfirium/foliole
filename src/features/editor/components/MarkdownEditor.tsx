import { useEffect, useRef } from 'react';

import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorAdapter } from '../adapters/EditorAdapter';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
}

export function MarkdownEditor({ value, onChange, onReady }: MarkdownEditorProps) {
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
    onReadyRef.current?.(adapter);
    return () => {
      onReadyRef.current?.(null);
      adapter.destroy();
      adapterRef.current = null;
    };
  }, []);

  useEffect(() => {
    adapterRef.current?.setContent(value);
  }, [value]);

  return <div className="markdown-editor-host" ref={hostRef} />;
}
