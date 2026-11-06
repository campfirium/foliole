import type { EditorAdapter } from './EditorAdapter';

export interface EditorAdapterConnection { current: EditorAdapter | null }
const listeners = new WeakMap<EditorAdapterConnection, Set<() => void>>();

export function setConnectedEditorAdapter(connection: EditorAdapterConnection, adapter: EditorAdapter | null) {
  connection.current = adapter;
  for (const listener of [...(listeners.get(connection) ?? [])]) listener();
}

export function subscribeConnectedEditorAdapter(connection: EditorAdapterConnection, listener: () => void) {
  const current = listeners.get(connection) ?? new Set<() => void>();
  listeners.set(connection, current);
  current.add(listener);
  return () => {
    current.delete(listener);
    if (!current.size && listeners.get(connection) === current) listeners.delete(connection);
  };
}
