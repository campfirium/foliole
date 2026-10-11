// @vitest-environment node
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { loadRetainedSyncNodeVersionFact } from '../../lib/core/sync/syncNodeGraph.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { withRequestSyncReadonlySnapshot } from './requestSyncReadonlySnapshot.js';
import { textBranch } from './topicTextState.testSupport.js';

let root = '';
let sqlite: Database.Database | undefined;
afterEach(async () => { sqlite?.close(); sqlite = undefined; if (root) await rm(root, { recursive: true }); });

it.each([false, true])('keeps inventory and body consistent during a concurrent write and releases on cancellation=%s', async cancel => {
  await mkdir('.tmp/artifacts', { recursive: true });
  root = await mkdtemp(path.resolve('.tmp/artifacts/request-sync-snapshot-'));
  const file = path.join(root, 'library.db');
  sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  initializeDatabaseSchema(sqlite);
  const writer = createBetterSqliteDbPort(sqlite);
  const base = textBranch('base', 'Original');
  const head = textBranch('head', 'Changed', base);
  await applyConvergentSyncNodesWithDbPort(writer, [base]);
  const controller = new AbortController();
  let retained: DbPort | undefined;
  const read = withRequestSyncReadonlySnapshot(file, async db => {
    retained = db;
    const before = await readFramedSyncInventoryEntry(db, { objectType: 'node', globalId: 'topic' });
    await applyConvergentSyncNodesWithDbPort(writer, [head]);
    expect(await readFramedSyncInventoryEntry(db, { objectType: 'node', globalId: 'topic' })).toEqual(before);
    expect((await loadRetainedSyncNodeVersionFact(db, 'base'))?.body_text).toBe('Original');
    expect(await db.query("SELECT current_version_id FROM nodes WHERE id = 'topic'"))
      .toEqual([{ current_version_id: 'base' }]);
    if (cancel) controller.abort(new Error('request_cancelled'));
  }, controller.signal);
  if (cancel) await expect(read).rejects.toThrow('request_cancelled');
  else await read;
  expect(retained).toBeDefined();
  await expect(retained?.query('SELECT 1')).rejects.toThrow();
  expect(sqlite.pragma('wal_checkpoint(TRUNCATE)')).toEqual([{ busy: 0, log: 0, checkpointed: 0 }]);
  await withRequestSyncReadonlySnapshot(file, async db => {
    expect(await db.query("SELECT current_version_id FROM nodes WHERE id = 'topic'"))
      .toEqual([{ current_version_id: 'head' }]);
  });
});
