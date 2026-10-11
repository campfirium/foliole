import { rmSync } from 'node:fs';
import path from 'node:path';

const prepared = new WeakSet<object>();

/** Invoked before the initialized library is published to sync consumers. */
export function cleanAbandonedRequestSyncFiles(connection: { dbPath: string }) {
  if (prepared.has(connection)) return;
  const directory = path.join(path.dirname(connection.dbPath), '..', 'SyncTransport', 'requests');
  rmSync(directory, { force: true, recursive: true });
  prepared.add(connection);
}
