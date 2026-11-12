// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { loadWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot.js';
import { buildReviewQueuePlan } from '../../lib/core/review/queue/reviewQueuePlanner.js';
import { DEFAULT_UNIFIED_PUSH_QUEUE_RULES } from '../../lib/core/review/unifiedPushQueueRules.js';
import { AGENT_CONTROL_LEARNING_IMPORT_KEY } from '../../lib/platform/agentControlLearningImport.js';
import { createSyncGroupDeviceIdentity, devicePathFlavorFromCanonicalLibraryPath } from '../../lib/platform/syncGroupUnifiedContract.js';
import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';
import { flushNodeSyncVersion } from '../database/nodeSyncVersions.js';
import { closeLibraries, createPeer, joinPeers, root, startLibraries } from '../database/syncLibrary.testSupport.js';
import { syncRequestLibrary } from '../database/syncRequestLibrary.testSupport.js';
import { loadAppSettingsState, saveAppSettingsState } from '../ipc/storage.js';

import { closeAgentControlTestServer, startAgentControlTestServer } from './agentControlTestServer.js';

vi.mock('electron', () => ({ app: {}, nativeTheme: {} }));
vi.mock('../nativeAppearance.js', () => ({ applyNativeBaseColorMode: vi.fn() }));
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'),
    app_data_dir: path.join(root, 'desktop'), app_log_dir: path.join(root, 'logs')
  })
}));

let server: Awaited<ReturnType<typeof startAgentControlTestServer>>;
const title = 'Migrated reading';
const body = { kind: 'topic', parent_id: null, title, content: 'Imported Topic body' };
const schedule = { priority: 0, last_handled_at: '2026-10-01T08:00:00+08:00', next_at: '2026-10-24T08:00:00+08:00',
  interval_duration_ms: 1987200000, interval_growth_factor: 1.6, repetition_count: 5 };

beforeEach(async () => {
  await startLibraries();
  initializeDatabase();
  server = await startAgentControlTestServer([], vi.fn());
});

afterEach(async () => {
  await closeAgentControlTestServer(server.server);
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await closeLibraries();
});

async function create(input: Record<string, unknown>, token = 'test-token') {
  const response = await fetch(`${server.endpoint}/agent-control/v1/materials/create`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  return { status: response.status, payload: await response.json() };
}

function enableImport() {
  return saveAppSettingsState({ [AGENT_CONTROL_LEARNING_IMPORT_KEY]: 'true' });
}

function verifyQueue(driver: DatabaseDriver, id: string) {
  const snapshot = loadWorkspaceSnapshot(driver, { includeBody: true })!;
  expect(snapshot.nodesById[id]).toMatchObject({ content: body.content, priority: 0, reading: {
    priority: 0, lastHandledAt: '2026-10-01T00:00:00.000Z', nextAt: '2026-10-24T00:00:00.000Z',
    intervalDurationMs: schedule.interval_duration_ms, intervalGrowthFactor: schedule.interval_growth_factor,
    repetitionCount: schedule.repetition_count, state: 'active'
  } });
  const queue = (now: string) => buildReviewQueuePlan({ nodesById: snapshot.nodesById, nodeOrder: snapshot.nodeOrder,
    now, newDayStartsAtHour: 0, readingDayStartsAtHour: 0, trashedNodeIds: [],
    pushQueueRules: DEFAULT_UNIFIED_PUSH_QUEUE_RULES }).readingQueueNodeIds;
  expect(queue('2026-10-21T01:00:00.000Z')).not.toContain(id);
  expect(queue('2026-10-24T20:00:00.000Z')[0]).toBe(id);
}

function sourcePeer() {
  const { sqlite, driver, dbPath } = openDatabaseConnection();
  const anchor = randomUUID();
  const identity = createSyncGroupDeviceIdentity({ device_anchor: anchor, group_id: 'group', library_path: dbPath,
    path_flavor: devicePathFlavorFromCanonicalLibraryPath(dbPath) });
  return { id: identity.identity_key, name: 'source', anchor, file: dbPath, db: sqlite, driver,
    port: createBetterSqliteDbPort(sqlite) };
}

it('imports via the CLI and preserves the active reading state on reopen and on a sync peer', async () => {
  await enableImport();
  const descriptor = path.join(root, 'agent-control-session.json');
  await writeFile(descriptor, JSON.stringify({ endpoint: server.endpoint, token: 'test-token', capabilities: ['materials.create'] }));
  const result = await runAgentCli(['materials/create', '--descriptor', descriptor, '--kind', 'topic', '--title', title,
    '--content', body.content, '--reading-schedule', JSON.stringify(schedule)]);
  expect(result.status).toBe(0);
  const id = result.output.material.id as string;
  verifyQueue(openDatabaseConnection().driver, id);

  closeDatabaseConnection();
  expect(await loadAppSettingsState()).toMatchObject({ [AGENT_CONTROL_LEARNING_IMPORT_KEY]: 'true' });
  const source = sourcePeer();
  verifyQueue(source.driver, id);
  const target = createPeer('reading-target');
  joinPeers(source, target);
  flushNodeSyncVersion(id, '2026-11-13T00:00:00.000Z');
  await syncRequestLibrary(source, target);
  verifyQueue(target.driver, id);
  expect(target.driver.queryOne('SELECT key FROM settings WHERE key = ?', [AGENT_CONTROL_LEARNING_IMPORT_KEY])).toBeUndefined();
});

it('rejects missing permission, unauthorized requests and invalid schedules without creating a node', async () => {
  const input = { ...body, reading_schedule: schedule };
  expect(await create(input)).toEqual({ status: 403, payload: { error: 'learning_import_disabled' } });
  expect((await create({ ...body, title: 'Ordinary creation' })).status).toBe(200);
  await enableImport();
  expect((await create(input, 'wrong-token')).status).toBe(401);
  for (const invalid of [
    { ...input, reading_schedule: { ...schedule, priority: 10 } },
    { ...input, reading_schedule: { ...schedule, next_at: '2026-10-24' } },
    { ...input, reading_schedule: { ...schedule, interval_growth_factor: 0 } },
    { ...input, kind: 'folder' }
  ]) {
    expect(await create(invalid)).toEqual({ status: 400, payload: { error: 'invalid_request' } });
  }
  await saveAppSettingsState({ [AGENT_CONTROL_LEARNING_IMPORT_KEY]: 'false' });
  expect((await create(input)).status).toBe(403);
  expect(openDatabaseConnection().driver.queryOne('SELECT id FROM nodes WHERE title = ?', [title])).toBeUndefined();
});

it('rolls back a failed reading write with its Topic', async () => {
  await enableImport();
  const { sqlite } = openDatabaseConnection();
  sqlite.exec(`CREATE TRIGGER fail_import BEFORE INSERT ON node_reading
    BEGIN SELECT RAISE(ABORT, 'test_reading_write_failed'); END`);
  expect(await create({ ...body, reading_schedule: schedule })).toEqual({ status: 500, payload: { error: 'internal_error' } });
  expect(sqlite.prepare('SELECT id FROM nodes WHERE title = ?').get(title)).toBeUndefined();
  expect(sqlite.prepare('SELECT node_id FROM node_reading').all()).toEqual([]);
});
