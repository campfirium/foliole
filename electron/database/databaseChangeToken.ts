import { openDatabaseConnection } from './connection.js';

const connectionIds = new WeakMap<object, number>();
let nextConnectionId = 0;

/**
 * Changes whenever the library database may hold different rows: this connection wrote anything
 * (triggers included), another connection committed, or the connection itself was replaced.
 */
export function readDatabaseChangeToken() {
  const { sqlite } = openDatabaseConnection();
  let connectionId = connectionIds.get(sqlite);
  if (connectionId === undefined) {
    connectionId = ++nextConnectionId;
    connectionIds.set(sqlite, connectionId);
  }
  const changes = sqlite.prepare('SELECT total_changes()').pluck().get();
  const dataVersion = sqlite.pragma('data_version', { simple: true });
  return `${connectionId}:${String(changes)}:${String(dataVersion)}`;
}
