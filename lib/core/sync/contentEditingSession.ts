import type { DbPort } from './dbPort.js';

// Only the live local editing boundary is transient. Version facts remain in SQLite.
const sessions = new WeakMap<object, Map<string, string>>();

function connectionSessions(port: DbPort) {
  const identity = port.connectionIdentity ?? port;
  let state = sessions.get(identity);
  if (!state) { state = new Map(); sessions.set(identity, state); }
  return state;
}

export function beginContentEditingSession(port: DbPort, nodeId: string, sessionId: string) {
  connectionSessions(port).set(nodeId, sessionId);
}

export function hasContentEditingSession(port: DbPort, nodeId: string) {
  return connectionSessions(port).has(nodeId);
}

export function releaseContentEditingSession(port: DbPort, nodeId: string, sessionId: string) {
  const state = connectionSessions(port);
  if (state.get(nodeId) !== sessionId) return false;
  state.delete(nodeId);
  return true;
}
