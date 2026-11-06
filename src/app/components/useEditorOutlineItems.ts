import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { subscribeConnectedEditorAdapter, type EditorAdapterConnection } from '../../features/editor/adapters/editorAdapterConnection';

import { mayHaveOutline, resolveDisplayItems, resolveDisplayOutlineItems } from './DocumentOutlineLayerModel';
import { measureWorkspaceDiagnostic } from './workspaceInputLagRenderDiagnostic';

export function useEditorOutlineItems(content: string, connection: EditorAdapterConnection | undefined, nodeId: string | null | undefined, enabled = true) {
  const subscribe = useCallback((listener: () => void) => {
    if (!connection || !enabled) return () => undefined;
    let unsubscribe = () => {};
    const connect = () => {
      unsubscribe();
      unsubscribe = connection.current?.outline?.subscribe(listener) ?? (() => {});
      listener();
    };
    const disconnect = subscribeConnectedEditorAdapter(connection, connect);
    connect();
    return () => { disconnect(); unsubscribe(); };
  }, [connection, enabled]);
  const getSnapshot = useCallback(() => enabled ? connection?.current?.outline?.getSnapshot() ?? null : null, [connection, enabled]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => measureWorkspaceDiagnostic('workspace-outline-panel-build', { contentLength: content.length }, () => {
    if (!enabled) return [];
    if (connection) return snapshot && snapshot.nodeId === nodeId ? resolveDisplayOutlineItems(snapshot.items) : [];
    return mayHaveOutline(content) ? resolveDisplayItems(content) : [];
  }), [connection, content, enabled, nodeId, snapshot]);
}
