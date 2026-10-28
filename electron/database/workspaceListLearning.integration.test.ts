// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'daily-grade', libraryPath })
}));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: root,
  app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs') }) }));
vi.mock('../../src/shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: unknown) => {
  if (command === 'open_daily_flow') return openDesktopDailyFlow(args);
  if (command === 'commit_daily_flow') return commitDesktopDailyFlow(args);
  if (command === 'save_node_open_state') return null;
  throw new Error(`Unexpected command: ${command}`);
} }));

import { closeDatabaseConnection } from './connection.js';
import { commitDesktopDailyFlow, openDesktopDailyFlow } from './dailyFlow.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

// Load renderer modules at runtime across the host's NodeNext compilation boundary.
const rendererModule = (modulePath: string) => import(modulePath);
const { projectWorkspaceListNodesById } = await rendererModule('../../src/features/nodes/model/workspaceListNode.ts');
const { createLocalReviewSchedulerAdapter } = await rendererModule('../../src/features/review/model/localReviewSchedulerAdapter.ts');
const { createWorkspaceActionHistoryActions } = await rendererModule('../../src/store/workspaceActionHistory.ts');
const { createWorkspaceReviewActions } = await rendererModule('../../src/store/workspaceStoreReviewActions.ts');
const { createQaNode, createSetStateHarness, createWorkspaceFixture } =
  await rendererModule('../../src/store/workspaceStoreReviewActions.test-support.ts');

const now = '2026-10-26T08:00:00.000Z';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-daily-grade-'));
  initializeDatabase();
});
afterEach(async () => { vi.restoreAllMocks(); closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); });

async function setup(itemCount = 12, topicCount = 3) {
  const nodes = Array.from({ length: itemCount + topicCount }, (_, i) => ({ ...createQaNode(`node-${i}`, now),
    kind: i < itemCount ? 'item' as const : 'topic' as const,
    ...(i < itemCount ? {} : { review: null, reveal: null }) }));
  for (const node of nodes) upsertNodeSnapshot({ nodeId: node.id, title: node.title, kind: node.kind,
    parentNodeId: null, content: node.content, reveal: node.reveal, review: node.review,
    isTitleManual: true, anchorLink: null, position: 0, createdAt: node.createdAt, updatedAt: node.updatedAt });
  const harness = createSetStateHarness(createWorkspaceFixture(nodes));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, createLocalReviewSchedulerAdapter());
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...actions, ...history });
  await actions.startReviewSession(now);
  return { ...harness, actions, history };
}

it.each(['read', 'later', 'dismiss'] as const)('%s keeps full persisted facts while refreshing list summaries and history', async action => {
  const app = await setup(0, 3);
  const initial = app.getState();
  const id = initial.reviewSession.currentNodeId!;
  expect(id).toBeTruthy();
  const before = initial.nodesById[id]!.reading;
  const first = projectWorkspaceListNodesById(initial.nodesById);
  const invoke = { read: app.actions.readReviewTopic, later: app.actions.postponeReviewTopic,
    dismiss: app.actions.dismissReviewTopic }[action];
  expect(await invoke(now)).toBe(true);
  const committed = loadWorkspaceSnapshot()!.nodesById[id]!.reading!;
  expect(committed).toBeTruthy();
  if (action === 'dismiss') expect(committed.intervalDurationMs).toBe(0);
  else expect(committed.intervalDurationMs).toBeGreaterThan(0);
  expect(committed.nextAt).toBeTruthy();
  expect(app.getState().nodesById[id]!.reading).toEqual(committed);
  const projected = projectWorkspaceListNodesById(app.getState().nodesById, first);
  expect(projected[id]!.reading).toEqual({ state: committed.state, repetitionCount: committed.repetitionCount });
  const entry = app.getState().appActionHistory.undoStack.at(-1)!;
  expect(app.history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(loadWorkspaceSnapshot()!.nodesById[id]!.reading).toEqual(before ?? null);
  expect(app.history.redoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(loadWorkspaceSnapshot()!.nodesById[id]!.reading).toEqual(committed);
  closeDatabaseConnection();
  initializeDatabase();
  expect(loadWorkspaceSnapshot()!.nodesById[id]!.reading).toEqual(committed);
});
