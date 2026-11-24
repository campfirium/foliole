// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { loadWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot.js';
import { createWorkspaceNodePriorityIndex } from '../../lib/core/nodes/workspaceNodePriorityIndex.js';
import { buildReviewQueuePlan } from '../../lib/core/review/queue/reviewQueuePlanner.js';
import { DEFAULT_UNIFIED_PUSH_QUEUE_RULES } from '../../lib/core/review/unifiedPushQueueRules.js';
import { createSyncGroupDeviceIdentity, devicePathFlavorFromCanonicalLibraryPath } from '../../lib/platform/syncGroupUnifiedContract.js';
import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';
import { saveAgentControlLearningImportPermission } from '../database/agentControlLearningImportPermission.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';
import { flushNodeSyncVersion } from '../database/nodeSyncVersions.js';
import { closeLibraries, createPeer, joinPeers, root, startLibraries } from '../database/syncLibrary.testSupport.js';
import { syncRequestLibrary } from '../database/syncRequestLibrary.testSupport.js';

import { closeAgentControlTestServer, startAgentControlTestServer } from './agentControlTestServer.js';

vi.mock('electron', () => ({ app: {}, nativeTheme: {} }));
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'),
    app_data_dir: path.join(root, 'desktop'), app_log_dir: path.join(root, 'logs') })
}));

let server: Awaited<ReturnType<typeof startAgentControlTestServer>>;
let descriptor: string;
const schedule = { priority: 9, last_handled_at: '2026-10-01T00:00:00Z', next_at: '2026-10-24T00:00:00Z',
  interval_duration_ms: 1987200000, interval_growth_factor: 1.6, repetition_count: 5 };

beforeEach(async () => {
  await startLibraries();
  initializeDatabase();
  server = await startAgentControlTestServer([], vi.fn());
  descriptor = path.join(root, 'agent-control-session.json');
  await writeFile(descriptor, JSON.stringify({ endpoint: server.endpoint, token: 'test-token',
    capabilities: ['materials.create', 'materials.read', 'materials.update'] }));
});

afterEach(async () => {
  await closeAgentControlTestServer(server.server);
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await closeLibraries();
});

async function post(route: string, body: Record<string, unknown>) {
  const response = await fetch(`${server.endpoint}/agent-control/v1/materials/${route}`, {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json() };
}

async function createTopic(title: string, priority: number | null, parentId: string | null = null) {
  const result = await post('create', { kind: 'topic', parent_id: parentId, title, content: title,
    ...(priority === null ? {} : { reading_schedule: { ...schedule, priority } }) });
  expect(result.status).toBe(200);
  return result.payload.material as { id: string; updated_at: string };
}

function update(id: string, revision: string, priority: string) {
  return runAgentCli(['materials/update', '--descriptor', descriptor, '--id', id,
    '--expected-updated-at', revision, '--priority', priority]);
}

async function read(id: string) {
  const result = await post('read', { id, include_learning: true });
  expect(result.status).toBe(200);
  return result.payload.material;
}

function sourcePeer() {
  const { sqlite, driver, dbPath } = openDatabaseConnection();
  const anchor = randomUUID();
  const identity = createSyncGroupDeviceIdentity({ device_anchor: anchor, group_id: 'group', library_path: dbPath,
    path_flavor: devicePathFlavorFromCanonicalLibraryPath(dbPath) });
  return { id: identity.identity_key, name: 'source', anchor, file: dbPath, db: sqlite, driver,
    port: createBetterSqliteDbPort(sqlite) };
}

function readingOrder(driver: ReturnType<typeof sourcePeer>['driver']) {
  const snapshot = loadWorkspaceSnapshot(driver, { includeBody: true })!;
  return buildReviewQueuePlan({ nodesById: snapshot.nodesById, nodeOrder: snapshot.nodeOrder,
    now: '2026-10-25T00:00:00Z', newDayStartsAtHour: 0, readingDayStartsAtHour: 0, trashedNodeIds: [],
    pushQueueRules: DEFAULT_UNIFIED_PUSH_QUEUE_RULES }).readingQueueNodeIds;
}

it('reprioritizes an imported Topic in the queue and syncs the update without rewriting its schedule', async () => {
  saveAgentControlLearningImportPermission('true');
  const topic = await createTopic('Imported Topic', 9);
  const other = await createTopic('Other Topic', 5);
  const before = await read(topic.id);
  const source = sourcePeer();
  const target = createPeer('priority-target');
  joinPeers(source, target);
  for (const id of [topic.id, other.id]) flushNodeSyncVersion(id, new Date().toISOString());
  await syncRequestLibrary(source, target);
  expect(before.learning.priority).toBe(9);
  expect(readingOrder(source.driver)).toEqual(expect.arrayContaining([other.id, topic.id]));
  expect(readingOrder(target.driver)).toEqual(expect.arrayContaining([other.id, topic.id]));

  const result = await update(topic.id, before.updated_at, '0');
  expect(result).toMatchObject({ status: 0, output: { material: { id: topic.id } } });
  expect(result.output.material.updated_at).not.toBe(before.updated_at);
  expect(await update(topic.id, before.updated_at, '9')).toMatchObject({ status: 1, output: { error: 'conflict' } });
  expect(readingOrder(source.driver)).toEqual([topic.id, other.id]);
  flushNodeSyncVersion(topic.id, new Date().toISOString());
  await syncRequestLibrary(source, target);
  expect(readingOrder(target.driver)).toEqual([topic.id, other.id]);
  expect(loadWorkspaceSnapshot(target.driver, { includeBody: true })?.nodesById[topic.id])
    .toMatchObject({ content: before.content, priority: 0, reading: { priority: 9, repetitionCount: 5 } });

  closeDatabaseConnection();
  expect((await read(topic.id)).learning).toEqual({ ...before.learning, priority: 0 });
  expect(await update(topic.id, result.output.material.updated_at, 'inherit')).toMatchObject({ status: 0 });
  expect((await read(topic.id)).learning).toEqual({ ...before.learning, priority: null });
});

it('gates priority updates and preserves the reviewed Item schedule and history', async () => {
  saveAgentControlLearningImportPermission('true');
  const created = await post('create', { kind: 'item', parent_id: null, content: 'Question', reveal: 'Answer',
    review_schedule: { due: '2027-02-01T00:00:00Z', priority: 2,
      history: [{ reviewed_at: '2026-10-01T00:00:00Z', grade: 3 }] } });
  expect(created.status).toBe(200);
  const { id, updated_at } = created.payload.material;
  const before = await read(id);
  const patch = { id, expected_updated_at: updated_at, title: 'Renamed', priority: 8 };
  saveAgentControlLearningImportPermission('false');
  expect(await post('update', patch)).toEqual({ status: 403, payload: { error: 'learning_import_disabled' } });
  expect(await read(id)).toEqual(before);

  saveAgentControlLearningImportPermission('true');
  for (const priority of [-1, 10, 2.5, '2']) {
    expect((await post('update', { ...patch, priority })).status).toBe(400);
  }
  expect(await read(id)).toEqual(before);
  expect((await post('update', patch)).status).toBe(200);
  expect(await read(id)).toMatchObject({ title: 'Renamed', learning: { ...before.learning, priority: 8 } });
  expect(openDatabaseConnection().driver.queryAll('SELECT grade FROM review_log WHERE node_id = ?', [id]))
    .toEqual([{ grade: 3 }]);

  const inbox = await read(INBOX_NODE_ID);
  expect((await post('update', { id: inbox.id, expected_updated_at: inbox.updated_at, priority: 1 })).status).toBe(400);
});

it('applies a Folder priority only to descendants that inherit priority', async () => {
  saveAgentControlLearningImportPermission('true');
  const created = await post('create', { kind: 'folder', parent_id: null, title: 'Course' });
  expect(created.status).toBe(200);
  const folder = created.payload.material;
  const inherited = await createTopic('Inherited', null, folder.id);
  const explicit = await createTopic('Own priority', 2, folder.id);
  const defaultPriority = DEFAULT_UNIFIED_PUSH_QUEUE_RULES.defaultPriority;
  const priorities = () => createWorkspaceNodePriorityIndex(
    loadWorkspaceSnapshot(openDatabaseConnection().driver, { includeBody: true })!.nodesById, defaultPriority
  );
  expect(priorities().get(inherited.id)).toBe(defaultPriority);

  const changed = await update(folder.id, folder.updated_at, '8');
  expect(changed).toMatchObject({ status: 0 });
  expect((await read(folder.id)).learning).toEqual({ priority: 8 });
  expect(priorities().get(inherited.id)).toBe(8);
  expect(priorities().get(explicit.id)).toBe(2);
  expect((await read(inherited.id)).updated_at).toBe(inherited.updated_at);

  expect(await update(folder.id, changed.output.material.updated_at, 'inherit')).toMatchObject({ status: 0 });
  expect(priorities().get(inherited.id)).toBe(defaultPriority);
});
