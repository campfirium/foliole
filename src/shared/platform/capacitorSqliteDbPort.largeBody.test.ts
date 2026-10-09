// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sha256 } from '@noble/hashes/sha2.js';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../../lib/core/database/framedSyncStagingSchema';
import { loadFramedSyncFrozenBody, stageFramedSyncFrozenBody } from '../../../lib/core/sync/framedSyncFrozenBody';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';

it('freezes a full iOS body with bounded JSON and preserves all bytes after reopening SQLite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'foliole-ios-body-'));
  const path = join(directory, 'body.sqlite');
  const database = new Database(path);
  database.exec(FRAMED_SYNC_STAGING_SCHEMA.join(';\n'));
  const native = createFakeCapacitorConnection(database);
  const wireSizes: number[] = [];
  const wire = <T>(value: T): T => {
    const json = JSON.stringify(value);
    wireSizes.push(new TextEncoder().encode(json).byteLength);
    return JSON.parse(json);
  };
  const connection = {
    ...native,
    run: (sql: string, params: unknown[]) => native.run(sql, wire(params)),
    executeSet: (set: Parameters<typeof native.executeSet>[0]) => native.executeSet(wire(set))
  };
  const bytes = new TextEncoder().encode('A'.repeat(1_048_512) + ' 手机编辑🙂');
  const blob = { sha256: sha256(bytes), byteLength: BigInt(bytes.byteLength), role: 1, required: true };
  const db = createCapacitorSqliteDbPort(connection as never, 'ios');
  try {
    await db.transaction((tx) => stageFramedSyncFrozenBody(tx, blob, bytes));
    expect(Math.max(...wireSizes)).toBeLessThanOrEqual(4 * 1024 * 1024);
    database.close();
    const reopened = new Database(path, { readonly: true });
    try {
      const port = createCapacitorSqliteDbPort(createFakeCapacitorConnection(reopened) as never, 'ios');
      expect(await loadFramedSyncFrozenBody(port, blob)).toEqual(bytes);
      expect(reopened.prepare('SELECT typeof(data) AS type, length(data) AS bytes FROM framed_sync_available_blobs').get())
        .toEqual({ type: 'blob', bytes: bytes.byteLength });
    } finally { reopened.close(); }
  } finally {
    if (database.open) database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
