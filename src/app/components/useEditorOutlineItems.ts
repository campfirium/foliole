import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { subscribeConnectedEditorAdapter, type EditorAdapterConnection } from '../../features/editor/adapters/editorAdapterConnection';

import { mayHaveOutline, resolveDisplayItems, resolveDisplayOutlineItems } from './DocumentOutlineLayerModel';
import { measureWorkspaceDiagnostic } from './workspaceInputLagRenderDiagnostic';

export function useEditorOutlineItems(content: string, connection: EditorAdapterConnection | undefined, nodeId: string | null | undefined) {
  const subscribe = useCallback((listener: () => void) => {
    if (!connection) return () => undefined;
    let unsubscribe = () => {};
    const connect = () => {
      unsubscribe();
      unsubscribe = connection.current?.outline?.subscribe(listener) ?? (() => {});
      listener();
    };
    const disconnect = subscribeConnectedEditorAdapter(connection, connect);
    connect();
    return () => { disconnect(); unsubscribe(); };
  }, [connection]);
  const getSnapshot = useCallback(() => connection?.current?.outline?.getSnapshot() ?? null, [connection]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => measureWorkspaceDiagnostic('workspace-outline-panel-build', { contentLength: content.length }, () => {
    if (connection) return snapshot && snapshot.nodeId === nodeId ? resolveDisplayOutlineItems(snapshot.items) : [];
    return mayHaveOutline(content) ? resolveDisplayItems(content) : [];
  }), [connection, content, nodeId, snapshot]);
}
