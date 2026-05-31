import { useCallback, useState } from 'react';

import {
  clearEditorInputDiagnostics,
  copyEditorInputDiagnostics,
  getEditorInputDiagnosticRecordCount,
  isEditorInputDiagnosticEnabled,
  startEditorInputDiagnostics,
  stopEditorInputDiagnostics
} from '../../store/workspaceEditorInputDiagnostics';

type CopyState = 'idle' | 'copied' | 'failed';
type EditorInputDiagnosticsPanelGlobal = typeof globalThis & {
  __FOLIOLE_EDITOR_INPUT_DIAG_PANEL?: boolean;
};

function isEditorInputDiagnosticsPanelEnabled() {
  return (globalThis as EditorInputDiagnosticsPanelGlobal).__FOLIOLE_EDITOR_INPUT_DIAG_PANEL === true;
}

export function EditorInputDiagnosticsPanel() {
  const [isRecording, setIsRecording] = useState(isEditorInputDiagnosticEnabled);
  const [recordCount, setRecordCount] = useState(getEditorInputDiagnosticRecordCount);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const refresh = useCallback(() => {
    setIsRecording(isEditorInputDiagnosticEnabled());
    setRecordCount(getEditorInputDiagnosticRecordCount());
  }, []);
  const start = useCallback(() => {
    startEditorInputDiagnostics();
    setCopyState('idle');
    refresh();
  }, [refresh]);
  const stop = useCallback(() => {
    stopEditorInputDiagnostics();
    refresh();
  }, [refresh]);
  const clear = useCallback(() => {
    clearEditorInputDiagnostics();
    setCopyState('idle');
    refresh();
  }, [refresh]);
  const copy = useCallback(async () => {
    try {
      await copyEditorInputDiagnostics();
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    } finally {
      refresh();
    }
  }, [refresh]);

  if (!import.meta.env.DEV || !isEditorInputDiagnosticsPanelEnabled()) {
    return null;
  }

  return (
    <div className="fixed bottom-3 right-3 z-debug flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-2 py-1 text-xs text-foreground shadow-debug">
      <span className="tabular-nums">{isRecording ? 'Recording' : 'Stopped'} · {recordCount}</span>
      <button className="rounded border border-border px-2 py-1 hover:bg-bg-subtle" onClick={start} type="button">
        Start
      </button>
      <button className="rounded border border-border px-2 py-1 hover:bg-bg-subtle" onClick={stop} type="button">
        Stop
      </button>
      <button className="rounded border border-border px-2 py-1 hover:bg-bg-subtle" onClick={copy} type="button">
        {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Failed' : 'Copy'}
      </button>
      <button className="rounded border border-border px-2 py-1 hover:bg-bg-subtle" onClick={clear} type="button">
        Clear
      </button>
    </div>
  );
}
