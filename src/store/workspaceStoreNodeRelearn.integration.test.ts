// @vitest-environment jsdom
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { closeDatabaseConnection, runWithDatabaseConnectionMaintenance, runWithDatabaseConnectionOwner } from '../../electron/database/connection.js';
import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.js';
import { closeLibraries, createPeer, joinPeers, startLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport.js';
import { syncRequestLibrary } from '../../electron/database/syncRequestLibrary.testSupport.js';
import { handleNodeMutationCommand } from '../../electron/ipc/storageNodeMutationCommands.js';
import { handleReadingAndReviewCommand, handleWorkspaceReadCommand } from '../../electron/ipc/storageReadCommands.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { applyReviewGrade } from '../../lib/core/database/reviewMutations.js';
import { resolveLibraryPaths } from '../../lib/platform/libraryPaths.js';
import type { Node } from '../features/nodes/model/nodeTypes';
import { waitForWorkspaceRuntimeWrites } from '../shared/platform/runtimeInvoke';
import { readPendingRelearnNodes, resetPendingDurableMutationsForTests } from '../shared/platform/workspacePendingDurableMutations';
import { replayPendingWorkspaceDurableMutations } from '../shared/platform/workspaceRuntimeDurableRepository';
import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeNodeRepository';

import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';
import { createRelearnNodeAction } from './workspaceStoreNodeRelearnAction';


const at = '2026-10-25T00:00:00.000Z';
const before = '2026-10-01T00:00:00.000Z';
const profile = { due: '2026-10-30T00:00:00.000Z', lastReviewAt: before,
  state: 2 as const, stability: 7, difficulty: 4, elapsedDays: 0, scheduledDays: 29, reps: 1, lapses: 0 };

function seedRelearn(source: Peer, kind: 'item' | 'topic', shelved: boolean) {
  const initial = createWorkspaceNodeActionsFixture();
  const base = initial.nodesById['node-1']!;
  const node: Node = { ...base, kind, reveal: kind === 'item' ? 'Answer' : null,
    hasReveal: kind === 'item', shelvedAt: shelved ? before : null, updatedAt: before,
    review: kind === 'item' ? profile : null,
    reading: kind === 'topic' ? { intervalDurationMs: 86400000, intervalGrowthFactor: 1.3,
      lastHandledAt: before, nextAt: profile.due, priority: 0, readingPosition: 0,
      repetitionCount: 1, state: 'dismissed' } : null };
  upsertNodeSnapshot(source.driver, { ...createWorkspaceRuntimeNodeSnapshot(node), hostName: source.name });
  if (kind === 'item') {
    const card = { due: profile.due, last_review: before, state: profile.state, stability: 7,
      difficulty: 4, elapsed_days: 0, scheduled_days: 29, reps: 1, lapses: 0 };
    let n = 0;
    applyReviewGrade(source.driver, { nodeId: node.id, grade: 3, reviewedAt: before,
      schedulerVersion: 'test', cardBefore: card, cardAfter: card },
    { hostName: source.name, createId: () => `original-${n++}` });
  }
  flushNodeSyncVersionWithDriver(source.driver, node.id, source.name, before);
  const harness = createWorkspaceNodeActionsSetStateHarness({ ...initial,
    nodesById: { ...initial.nodesById, [node.id]: node } });
  return { ...harness, node, relearn: createRelearnNodeAction(harness.setState) };
}

function persistedRelearn(source: Peer) {
  const db = new Database(source.file, { readonly: true, fileMustExist: true });
  try {
    return {
      node: db.prepare('SELECT shelved_at, updated_at, content, reveal FROM nodes WHERE id = ?').get('node-1'),
      review: db.prepare('SELECT * FROM node_review WHERE node_id = ?').get('node-1') ?? null,
      reading: db.prepare('SELECT * FROM node_reading WHERE node_id = ?').get('node-1') ?? null,
      logs: db.prepare('SELECT * FROM review_log ORDER BY op_id').all()
    };
  } finally { db.close(); }
}

vi.hoisted(() => vi.resetModules());
const transport = vi.hoisted(() => ({ invoke: vi.fn(), databasePath: '' }));

vi.mock('../../electron/ipc/libraryPathBootstrap.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../electron/ipc/libraryPathBootstrap.js')>();
  return { ...actual, resolveBootstrapLibraryPaths: () => ({ ...resolveLibraryPaths(path.dirname(transport.databasePath), { library_home: path.join(path.dirname(transport.databasePath), 'native-library') }), database_path: transport.databasePath }) };
});
vi.mock('../../electron/sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: async () => undefined }));
vi.mock('../../electron/mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: () => undefined }));
vi.mock('../../electron/ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: () => undefined }));

let source: ReturnType<typeof createPeer>;
let target: ReturnType<typeof createPeer>;
beforeEach(async () => {
  await startLibraries();
  source = createPeer('source');
  target = createPeer('target');
  joinPeers(source, target);
  transport.databasePath = source.file;
  window.electronAPI = { invoke: transport.invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined };
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(path.dirname(source.file), 'native-library'));
  window.localStorage.clear();
  resetPendingDurableMutationsForTests();
  transport.invoke.mockClear();
  transport.invoke.mockImplementation((command: string, args: Record<string, unknown> = {}) =>
    runWithDatabaseConnectionOwner(() => command === 'update_node_content'
      ? handleNodeMutationCommand(command, args) : command === 'load_node_document'
        ? handleWorkspaceReadCommand(command, args) : handleReadingAndReviewCommand(command, args)));
});
afterEach(async () => {
  await waitForWorkspaceRuntimeWrites();
  await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
  vi.restoreAllMocks();
  delete window.electronAPI;
  await closeLibraries();
  vi.unstubAllEnvs();
});

async function settleWrites() {
  await vi.waitFor(() => expect(transport.invoke).toHaveBeenCalled());
  await Promise.allSettled(transport.invoke.mock.results.map(result => result.value));
  await waitForWorkspaceRuntimeWrites();
}

it.each([false, true])('persists item relearn and its reset event with shelved=%s, including sync and reopen', async shelved => {
  const state = seedRelearn(source, 'item', shelved);
  await syncRequestLibrary(source, target);
  expect(state.relearn('node-1', at)).toBe(true);
  await settleWrites();
  const stored = persistedRelearn(source);
  expect(stored.review).toBeNull();
  expect(stored.node).toMatchObject({ shelved_at: null, content: state.node.content, reveal: 'Answer' });
  expect(stored.logs).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'reset', grade: 0 })]));
  expect(stored.logs).toHaveLength(2);
  expect(state.getState().nodesById['node-1']).toMatchObject({ review: null, shelvedAt: null });
  flushNodeSyncVersionWithDriver(source.driver, 'node-1', source.name, at);
  await syncRequestLibrary(source, target);
  await syncRequestLibrary(target, source);
  expect(persistedRelearn(target)).toEqual(stored);
  expect(readPendingRelearnNodes()).toEqual([]);
});

it.each([false, true])('preserves topic relearn behavior with shelved=%s without inventing review events', async shelved => {
  const state = seedRelearn(source, 'topic', shelved);
  expect(state.relearn('node-1', at)).toBe(true);
  await settleWrites();
  expect(persistedRelearn(source)).toMatchObject({ node: { shelved_at: null, content: state.node.content },
    reading: null, review: null, logs: [] });
});

it.each(['reset', 'unshelve'])('rolls back the whole shelved item mutation on %s storage failure and replays its pending intent', async failure => {
  const state = seedRelearn(source, 'item', true);
  const before = persistedRelearn(source);
  source.db.exec(failure === 'reset'
    ? "CREATE TRIGGER reject_relearn BEFORE INSERT ON review_log WHEN NEW.kind='reset' BEGIN SELECT RAISE(ABORT, 'storage full'); END"
    : "CREATE TRIGGER reject_relearn BEFORE UPDATE OF shelved_at ON nodes WHEN NEW.shelved_at IS NULL BEGIN SELECT RAISE(ABORT, 'storage full'); END");
  expect(state.relearn('node-1', at)).toBe(true);
  await settleWrites();
  expect(persistedRelearn(source)).toEqual(before);
  expect(readPendingRelearnNodes()).toHaveLength(1);
  source.db.exec('DROP TRIGGER reject_relearn');
  await replayPendingWorkspaceDurableMutations();
  expect(persistedRelearn(source)).toMatchObject({ node: { shelved_at: null }, review: null,
    logs: expect.arrayContaining([expect.objectContaining({ kind: 'reset' })]) });
  expect(persistedRelearn(source).logs).toHaveLength(2);
});

it.each([false, true])('keeps item state when recovery intent cannot be staged with shelved=%s', shelved => {
  const state = seedRelearn(source, 'item', shelved);
  const before = persistedRelearn(source);
  const localBefore = state.getState().nodesById['node-1'];
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage full'); });
  expect(state.relearn('node-1', at)).toBe(false);
  expect(state.getState().nodesById['node-1']).toEqual(localBefore);
  expect(persistedRelearn(source)).toEqual(before);
  expect(transport.invoke).not.toHaveBeenCalled();
});
