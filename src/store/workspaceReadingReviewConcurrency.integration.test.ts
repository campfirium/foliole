// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'reading-concurrency', libraryPath })
}));
vi.mock('../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: tempRoot, app_cache_dir: path.join(tempRoot, 'cache'),
    app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs') })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { upsertNodeSnapshot } from '../../electron/database/nodeMutations.js';
import { saveNodeReadingState } from '../../electron/database/nodeReadingState.js';
import { loadWorkspaceSnapshot } from '../../electron/database/workspaceSnapshot.js';
import type { Node } from '../features/nodes/model/nodeTypes';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { installWorkspaceHistoryPersistence, resetWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import type { WorkspaceReviewPersistenceAdapter } from './workspaceReviewPersistence';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import { createReadingNode, createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';

const now = '2026-03-03T00:00:00.000Z';
const due = '2026-03-02T00:00:00.000Z';

function saveNode(node: Node) {
  upsertNodeSnapshot({ nodeId: node.id, parentNodeId: node.parentNodeId, kind: node.kind,
    title: node.title, isTitleManual: true, content: node.content, reveal: null, anchorLink: null,
    position: 0, reading: node.reading ?? null, sequentialReadingEnabled: node.sequentialReadingEnabled ?? null,
    createdAt: node.createdAt, updatedAt: node.updatedAt });
}

function prepare(sequential = false) {
  const nodes = [createReadingNode('first', due), createReadingNode('other', now)];
  if (sequential) {
    nodes[0]!.parentNodeId = 'source';
    nodes[1]!.parentNodeId = 'source';
    nodes[1]!.reading!.state = 'locked';
    nodes.push({ ...createReadingNode('source', now), kind: 'folder', content: '',
      reading: null, sequentialReadingEnabled: true });
  }
  if (sequential) saveNode(nodes.at(-1)!);
  nodes.filter(node => node.kind !== 'folder').forEach(saveNode);
  const harness = createSetStateHarness(createWorkspaceFixture(nodes));
  let release = () => {};
  const acknowledged = new Promise<void>(resolve => { release = resolve; });
  const persistence: WorkspaceReviewPersistenceAdapter = {
    persistReviewGrade: async () => false,
    persistReadingNodes: async (changed, updatedAt, completedReviewDay) => {
      for (const [index, node] of changed.entries()) {
        saveNodeReadingState({ nodeId: node.id, reading: node.reading ?? null,
          updatedAt: updatedAt ?? now, ...(index === 0 && completedReviewDay ? { completedReviewDay } : {}) });
      }
      await acknowledged;
      return true;
    }
  };
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, undefined, persistence);
  actions.startReviewSession(now);
  return { ...harness, actions, release };
}

function reopen() {
  closeDatabaseConnection();
  initializeDatabase();
  return loadWorkspaceSnapshot({ includeBody: true })!;
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-reading-concurrency-'));
  initializeDatabase();
});

afterEach(async () => {
  resetWorkspaceHistoryPersistence();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('undoes and redoes a committed Read through SQLite without reverting concurrent content', async () => {
  const harness = prepare();
  const before = harness.getState();
  const currentId = before.reviewSession.currentNodeId!;
  installWorkspaceHistoryPersistence({ persistNodeSnapshots: async () => false,
    persistReviewSnapshot: async () => false, persistShelveSnapshots: async () => false,
    persistReadingSnapshots: async (nodes, updatedAt) => {
      for (const node of nodes) saveNodeReadingState({ nodeId: node.id, reading: node.reading ?? null, updatedAt });
      return true;
    } });
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  const pending = harness.actions.readReviewTopic(now);
  const current = { ...before.nodesById[currentId]!, title: 'Edited during save' };
  saveNode({ ...current, reading: loadWorkspaceSnapshot()!.nodesById[currentId]!.reading });
  harness.setState({ nodesById: { ...before.nodesById, [currentId]: current } });
  harness.release();
  await expect(pending).resolves.toBe(true);
  const committedReading = harness.getState().nodesById[currentId]!.reading;
  expect(history.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.redoStack).toHaveLength(1));
  expect(reopen().nodesById[currentId]).toMatchObject({ title: current.title, reading: current.reading! });
  expect(history.redoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(harness.getState().appActionHistory.undoStack).toHaveLength(1));
  expect(harness.getState().nodesById[currentId]).toMatchObject({ title: current.title, reading: committedReading! });
  expect(reopen().nodesById[currentId]).toMatchObject({ title: current.title, reading: committedReading! });
});

it('keeps unrelated changes, new nodes and current content when Read is acknowledged', async () => {
  const harness = prepare();
  const currentId = harness.getState().reviewSession.currentNodeId!;
  const otherId = currentId === 'first' ? 'other' : 'first';
  const pending = harness.actions.readReviewTopic(now);
  const state = harness.getState();
  const other = { ...state.nodesById[otherId]!, title: 'Changed while saving', content: 'New unrelated body' };
  const current = { ...state.nodesById[currentId]!, title: 'Current new title', content: 'Current new body' };
  const added = createReadingNode('added', '2026-03-10T00:00:00.000Z');
  // Persist content edits against the already committed reading, as the runtime does.
  saveNode({ ...current, reading: loadWorkspaceSnapshot()!.nodesById[currentId]!.reading });
  saveNode(other);
  saveNode(added);
  harness.setState({ nodesById: { ...state.nodesById, [currentId]: current, [otherId]: other, added },
    nodeOrder: [...state.nodeOrder, added.id] });
  harness.release();
  await expect(pending).resolves.toBe(true);
  const after = harness.getState();
  expect(after.nodesById[otherId]).toEqual(other);
  expect(after.nodesById.added).toEqual(added);
  expect(after.nodesById[currentId]).toMatchObject({ title: current.title, content: current.content,
    reading: { repetitionCount: 2, lastHandledAt: now } });
  expect(after.reviewSession.readTopicCount).toBe(1);
  expect(after.appActionHistory.undoStack).toHaveLength(1);
  const disk = reopen();
  for (const id of [currentId, otherId, added.id]) {
    expect(disk.nodesById[id]).toMatchObject({ title: after.nodesById[id]!.title,
      content: after.nodesById[id]!.content, reading: after.nodesById[id]!.reading });
  }
});

it('does not install a stale Read or history over a newer target reading', async () => {
  const harness = prepare();
  const before = harness.getState();
  const currentId = before.reviewSession.currentNodeId!;
  const pending = harness.actions.readReviewTopic(now);
  const current = before.nodesById[currentId]!;
  const newer = { ...current, reading: { ...current.reading!, repetitionCount: 7, nextAt: '2026-03-20T00:00:00.000Z' } };
  saveNode(newer);
  harness.setState({ nodesById: { ...before.nodesById, [currentId]: newer } });
  harness.release();
  await expect(pending).resolves.toBe(false);
  expect(harness.getState().nodesById[currentId]).toEqual(newer);
  expect(harness.getState().reviewSession).toEqual(before.reviewSession);
  expect(harness.getState().appActionHistory.undoStack).toHaveLength(0);
  expect(reopen().nodesById[currentId]!.reading).toEqual(newer.reading);
});

it('leaves reading, progress and history unchanged when SQLite rejects the save, then retries once', async () => {
  const harness = prepare();
  const before = harness.getState();
  const currentId = before.reviewSession.currentNodeId!;
  openDatabaseConnection().sqlite.exec(`CREATE TEMP TRIGGER reject_read BEFORE INSERT ON node_reading
    BEGIN SELECT RAISE(ABORT, 'reading_save_failure'); END`);
  await expect(harness.actions.readReviewTopic(now)).resolves.toBe(false);
  expect(harness.getState().nodesById).toEqual(before.nodesById);
  expect(harness.getState().reviewSession).toEqual(before.reviewSession);
  expect(harness.getState().appActionHistory.undoStack).toHaveLength(0);
  expect(loadWorkspaceSnapshot()!.nodesById[currentId]!.reading).toEqual(before.nodesById[currentId]!.reading);
  openDatabaseConnection().sqlite.exec('DROP TRIGGER reject_read');
  harness.release();
  await expect(harness.actions.readReviewTopic(now)).resolves.toBe(true);
  expect(harness.getState().reviewSession.readTopicCount).toBe(1);
  expect(reopen().nodesById[currentId]!.reading!.repetitionCount).toBe(2);
});

it.each([false, true])('preserves the related topic during sequential release (reading conflict: %s)', async (conflict) => {
  const harness = prepare(true);
  const before = harness.getState();
  expect(before.reviewSession.currentNodeId).toBe('first');
  const pending = harness.actions.readReviewTopic(now, { releaseSequentialReading: true });
  const other = { ...before.nodesById.other!, title: 'Updated next topic', content: 'Updated next body',
    ...(conflict ? { reading: { ...before.nodesById.other!.reading!, nextAt: '2026-04-01T00:00:00.000Z' } } : {}) };
  const committedReading = loadWorkspaceSnapshot()!.nodesById.other!.reading;
  expect(committedReading?.state).toBe('active');
  saveNode({ ...other, reading: (conflict ? other.reading : committedReading) ?? null });
  harness.setState({ nodesById: { ...before.nodesById, other } });
  harness.release();
  await expect(pending).resolves.toBe(!conflict);
  const after = harness.getState();
  expect(after.nodesById.other).toMatchObject({ title: other.title, content: other.content,
    reading: conflict ? other.reading! : committedReading! });
  expect(after.appActionHistory.undoStack).toHaveLength(conflict ? 0 : 1);
  if (conflict) expect(after.reviewSession).toEqual(before.reviewSession);
  expect(reopen().nodesById.other).toMatchObject({ title: other.title, content: other.content,
    reading: conflict ? other.reading! : committedReading! });
});
