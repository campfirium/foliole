// @vitest-environment node
import { expect, it } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { collectNodeVersionChainWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { port, proveBase, setupVersionCollectionFixture, sqlite } from './nodeVersionPayloadCollector.testSupport.js';
import { observeReads } from './syncNodeVerifiedTopicConflict.testSupport.js';

setupVersionCollectionFixture();

it.each(['driver', 'port'] as const)('retires historical body copies and all release candidates through bounded %s reads', async (mode) => {
  const driver = createBetterSqlite3Driver(sqlite);
  const body = '\uFEFF' + '🙂雪\u0000'.repeat(400000);
  const snapshotBody = 'Original snapshot\n'.repeat(150000);
  const hashes = [body, 'Alternative', 'Explicit manifest', snapshotBody]
    .map((text) => upsertTextBodyBlob(driver, text, 'now'));
  const snapshot = { id: 'node', content: snapshotBody, body_blob_hash: hashes[2],
    text_alternatives: [{ body_blob_hash: hashes[1] }] };
  sqlite.prepare('UPDATE node_sync_versions SET body_text = ?, snapshot_json = ? WHERE version_id = ?')
    .run(body, JSON.stringify(snapshot), 'B');
  proveBase('A');
  const sizes: number[] = [];
  const inspect = <T extends DatabaseRow>(rows: T[]) => {
    for (const row of rows) for (const value of Object.values(row)) {
      const size = typeof value === 'string' ? Buffer.byteLength(value)
        : value instanceof Uint8Array ? value.byteLength : 0;
      expect(size).toBeLessThanOrEqual(512 * 1024);
      if (value instanceof Uint8Array) sizes.push(size);
    }
    return rows;
  };
  const boundedDriver: DatabaseDriver = { ...driver,
    queryOne: <T extends DatabaseRow>(sql: string, params?: Parameters<DatabaseDriver['queryOne']>[1]) => {
      const row = driver.queryOne<T>(sql, params);
      return row ? inspect([row])[0] : undefined;
    },
    queryAll: <T extends DatabaseRow>(sql: string, params?: Parameters<DatabaseDriver['queryAll']>[1]) =>
      inspect(driver.queryAll<T>(sql, params)),
    transaction: (run) => driver.transaction(() => run(boundedDriver))
  };
  if (mode === 'driver') collectNodeVersionChainWithDriver(boundedDriver, 'node');
  else {
    const reads = observeReads(port);
    expect(await collectNodeVersionPayloads(reads.port, 'node')).toEqual({ released: 3, skipped: null });
    sizes.push(...reads.sizes);
  }
  expect(sizes.length).toBeGreaterThan(6);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(512 * 1024);
  for (const hash of hashes) {
    expect(sqlite.prepare('SELECT hash FROM content_blob_data WHERE hash = ?').get(hash)).toBeUndefined();
  }
  expect(sqlite.prepare('SELECT body_text, snapshot_json FROM node_sync_versions WHERE version_id = ?').get('B'))
    .toEqual({ body_text: null, snapshot_json: JSON.stringify({ ...snapshot, content: null, body_blob_hash: null }) });
  expect(sqlite.prepare('SELECT parent_version_id FROM node_sync_versions WHERE version_id = ?').get('B'))
    .toEqual({ parent_version_id: 'A' });
});
