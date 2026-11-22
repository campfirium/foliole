// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort.js';
import { textBranch } from '../../../../../electron/database/topicTextState.testSupport.js';
import { bootstrapCompanionDatabase } from '../../../../../lib/core/database/companionDatabaseLifecycle.js';
import type { DbPort } from '../../../../../lib/core/sync/dbPort.js';
import { recordCompletedSyncGroupRound } from '../../../../../lib/core/sync/syncGroupCoverageStore.js';
import { RECLAIMABLE_HISTORY_SQL } from '../../../../../lib/core/sync/syncHistoryCollectionSql.js';
import { applyConvergentSyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeConvergence.js';

const library = vi.hoisted(() => ({ generation: '', port: null as DbPort | null }));
vi.mock('./framed/companionRequestSyncDatabaseHost.js', () => ({
  currentCompanionRequestSyncDatabaseHost: async () => ({
    libraryGeneration: library.generation,
    write: (write: (db: DbPort) => Promise<unknown>) => write(library.port!)
  })
}));

const { collectCompanionSyncHistory } = await import('./companionSyncHistoryCollection.js');

const databases: Database.Database[] = [];
const roots: string[] = [];
let scans = 0;
afterEach(() => {
  databases.splice(0).forEach(db => db.close());
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});
beforeEach(() => { scans = 0; });

/** Each opened library is a new generation, as the companion database owner gives it. */
async function openLibrary(generation: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-companion-history-idle-rounds-'));
  roots.push(root);
  const sqlite = new Database(path.join(root, 'main.db'));
  databases.push(sqlite);
  const port = createBetterSqliteDbPort(sqlite);
  await bootstrapCompanionDatabase(port, { allowCreate: true, expectedHostName: 'phone', expectedJournalMode: 'wal', now: '2026-10-06' });
  sqlite.exec(`INSERT INTO sync_groups VALUES ('group-1', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'phone', 'active', 'now');
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group-1', 'desktop', 'desktop-anchor', '/desktop', 'Desktop', 'mac', 'active', 'now', 'now'),
      ('group-1', 'phone', 'phone-anchor', '/phone', 'Phone', 'ios', 'active', 'now', 'now')`);
  const counted: DbPort = new Proxy(port, { get(target, key, receiver) {
    if (key === 'transaction') return <T>(work: (tx: DbPort) => Promise<T>) => target.transaction(tx => work(new Proxy(tx, {
      get(inner, innerKey, innerReceiver) {
        if (innerKey !== 'query') return Reflect.get(inner, innerKey, innerReceiver);
        return (sql: string, params?: unknown[]) => {
          if (sql === RECLAIMABLE_HISTORY_SQL) scans++;
          return inner.query(sql, params as never);
        };
      }
    })));
    return Reflect.get(target, key, receiver);
  } });
  const base = textBranch('base', 'First draft', undefined, '2026-09-01T00:00:00.000Z');
  const head = textBranch('head', 'Final text', base, '2026-09-02T00:00:00.000Z');
  for (const record of [base, head]) await applyConvergentSyncNodesWithDbPort(port, [record]);
  await recordCompletedSyncGroupRound(port, { groupId: 'group-1', localDeviceId: 'phone', peerDeviceId: 'desktop',
    startedAt: '2026-10-20T00:00:00.000Z' });
  library.generation = generation;
  library.port = counted;
  return { sqlite, port };
}

/** An initiated round asks before its exchange and after it; the desktop's member state asks once more. */
async function round() {
  for (let ask = 0; ask < 3; ask++) await collectCompanionSyncHistory('group-1');
}

it('scans history once per moved group line instead of on every idle round', async () => {
  const { sqlite, port } = await openLibrary('/phone/main.db\u0000generation-1');

  await round();
  expect(sqlite.prepare("SELECT version_id FROM node_sync_versions WHERE object_id = 'topic'").pluck().all()).toEqual(['head']);
  expect(scans).toBe(1);

  for (let index = 0; index < 10; index++) await round();
  expect(scans).toBe(1);

  await recordCompletedSyncGroupRound(port, { groupId: 'group-1', localDeviceId: 'phone', peerDeviceId: 'desktop',
    startedAt: '2026-10-21T00:00:00.000Z' });
  await round();
  expect(scans).toBe(2);
});

it('does not carry a drained group line into a reset library at the same path', async () => {
  await openLibrary('/phone/main.db\u0000generation-a');
  await round();
  expect(scans).toBe(1);

  // Same path and group id, same group line, but a newly opened generation with its own history.
  const { sqlite } = await openLibrary('/phone/main.db\u0000generation-b');
  await round();
  expect(scans).toBe(2);
  expect(sqlite.prepare("SELECT version_id FROM node_sync_versions WHERE object_id = 'topic'").pluck().all()).toEqual(['head']);
});
