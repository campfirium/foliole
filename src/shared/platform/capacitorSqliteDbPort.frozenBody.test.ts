import { sha256 } from '@noble/hashes/sha2.js';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../../lib/core/database/framedSyncStagingSchema';
import { loadFramedSyncFrozenBody, stageFramedSyncFrozenBody } from '../../../lib/core/sync/framedSyncFrozenBody';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';

function fixture() {
  const database = new Database(':memory:');
  database.exec(FRAMED_SYNC_STAGING_SCHEMA.join(';\n'));
  const native = createFakeCapacitorConnection(database);
  const connection = {
    ...native,
    async query(sql: string, params: unknown[]) {
      const result = await native.query(sql, params);
      // The iOS plugin maps SQLite's genuine zero-length BLOB pointer to JSON null.
      return { values: result.values.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) =>
        [key, Array.isArray(value) && value.length === 0 ? null : value]))) };
    }
  };
  const db = createCapacitorSqliteDbPort(connection as never, 'ios');
  const bytes = new Uint8Array();
  const blob = { sha256: sha256(bytes), byteLength: 0n, role: 1, required: true };
  return { database, db, bytes, blob };
}

it('reuses and loads a genuine empty frozen BLOB through the iOS null pointer contract', async () => {
  const host = fixture();
  try {
    await stageFramedSyncFrozenBody(host.db, host.blob, host.bytes);
    await expect(stageFramedSyncFrozenBody(host.db, host.blob, host.bytes)).resolves.toBeUndefined();
    await expect(loadFramedSyncFrozenBody(host.db, host.blob)).resolves.toEqual(host.bytes);
    expect(host.database.prepare('SELECT typeof(data) AS type, length(data) AS bytes FROM framed_sync_available_blobs').get())
      .toEqual({ type: 'blob', bytes: 0 });
  } finally { host.database.close(); }
});

it.each(["data = ''", "data = X'00'", 'byte_length = 1'])('rejects invalid empty frozen storage: %s', async (update) => {
  const host = fixture();
  try {
    await stageFramedSyncFrozenBody(host.db, host.blob, host.bytes);
    host.database.exec(`UPDATE framed_sync_available_blobs SET ${update}`);
    await expect(loadFramedSyncFrozenBody(host.db, host.blob)).rejects.toThrow('framed_sync_published_body_unavailable');
    await expect(stageFramedSyncFrozenBody(host.db, host.blob, host.bytes)).rejects.toThrow('framed_sync_published_body_unavailable');
  } finally { host.database.close(); }
});
