// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { recordCompletedSyncGroupRound } from '../../lib/core/sync/syncGroupCoverageStore.js';
import { RECLAIMABLE_HISTORY_SQL } from '../../lib/core/sync/syncHistoryCollectionSql.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

const library = vi.hoisted(() => ({ dbPath: '', port: null as DbPort | null }));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ dbPath: library.dbPath }),
  runWithDatabaseConnectionOwner: (owner: () => unknown) => owner()
}));
vi.mock('./desktopRequestSyncDatabaseHost.js', () => ({
  createDesktopRequestSyncDatabaseHost: () => ({ write: (write: (db: DbPort) => Promise<unknown>) => write(library.port!) })
}));
vi.mock('../diagnostics/mainProcessDiagnostics.js', () => ({ appendMainProcessDiagnosticLog: vi.fn() }));

const { collectDesktopSyncHistory } = await import('./desktopSyncHistoryCollection.js');

const databases: Database.Database[] = [];
const roots: string[] = [];
let scans = 0;
afterEach(() => {
  databases.splice(0).forEach(db => db.close());
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});
beforeEach(() => { scans = 0; });

async function openLibrary() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-history-idle-rounds-'));
  roots.push(root);
  const sqlite = new Database(path.join(root, 'main.db'));
  databases.push(sqlite);
  const port = createBetterSqliteDbPort(sqlite);
  await bootstrapCompanionDatabase(port, { allowCreate: true, expectedHostName: 'desktop', expectedJournalMode: 'wal', now: '2026-10-06' });
  sqlite.exec(`INSERT INTO sync_groups VALUES ('group-1', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'desktop', 'active', 'now');
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
  library.dbPath = path.join(root, 'main.db');
  library.port = counted;
  return { sqlite, port };
}

/** An ordinary peer round asks once before its exchange and once after the closing member state. */
async function round() {
  await collectDesktopSyncHistory('group-1');
  await collectDesktopSyncHistory('group-1');
}

it('scans history once per moved group line instead of twice in every idle round', async () => {
  const { sqlite, port } = await openLibrary();
  const base = textBranch('base', 'First draft', undefined, '2026-09-01T00:00:00.000Z');
  const head = textBranch('head', 'Final text', base, '2026-09-02T00:00:00.000Z');
  for (const record of [base, head]) await applyConvergentSyncNodesWithDbPort(port, [record]);
  await recordCompletedSyncGroupRound(port, { groupId: 'group-1', localDeviceId: 'desktop', peerDeviceId: 'phone',
    startedAt: '2026-10-20T00:00:00.000Z' });

  await round();
  expect(sqlite.prepare("SELECT version_id FROM node_sync_versions WHERE object_id = 'topic'").pluck().all()).toEqual(['head']);
  expect(scans).toBe(1);

  for (let index = 0; index < 10; index++) await round();
  expect(scans).toBe(1);

  await recordCompletedSyncGroupRound(port, { groupId: 'group-1', localDeviceId: 'desktop', peerDeviceId: 'phone',
    startedAt: '2026-10-21T00:00:00.000Z' });
  await round();
  expect(scans).toBe(2);
});
