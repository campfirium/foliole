// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
let acknowledge: (() => void) | undefined;
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'learning-chain', libraryPath })
}));
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: unknown) => {
  if (command === 'load_node_learning') {
    return readWorkspaceNodeLearning(openDatabaseConnection().driver, (args as { nodeIds: string[] }).nodeIds);
  }
  if (command === 'open_daily_flow') return openDesktopDailyFlow(args);
  if (command === 'commit_daily_flow') {
    const result = await commitDesktopDailyFlow(args);
    const pending = acknowledge;
    acknowledge = undefined;
    pending?.();
    return result;
  }
  if (command === 'save_node_open_state') return null;
  throw new Error(`Unexpected learning command: ${command}`);
} }));

import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection';
import { commitDesktopDailyFlow, openDesktopDailyFlow } from '../../electron/database/dailyFlow';
import { initializeDatabase } from '../../electron/database/migrate';
import { upsertNodeSnapshot } from '../../electron/database/nodeMutations';
import { loadWorkspaceSnapshot } from '../../electron/database/workspaceSnapshot';
import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning';
import type { Node } from '../features/nodes/model/nodeTypes';
import { createLocalReviewSchedulerAdapter } from '../features/review/model/localReviewSchedulerAdapter';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { resetWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import { createQaNode, createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';

const at = '2026-10-31T08:00:00.000Z';
const snapshot = () => loadWorkspaceSnapshot({ includeBody: true })!;
type App = Awaited<ReturnType<typeof prepare>>;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-learning-chain-'));
  initializeDatabase();
  acknowledge = undefined;
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});
afterEach(async () => {
  acknowledge = undefined;
  resetWorkspaceHistoryPersistence();
  closeDatabaseConnection();
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

function save(node: Node) {
  upsertNodeSnapshot({ nodeId: node.id, parentNodeId: node.parentNodeId, kind: node.kind,
    title: node.title, content: node.content, reveal: node.reveal ?? null,
    reading: node.reading ?? null, review: node.review ?? null, isTitleManual: true,
    anchorLink: null, position: 0, createdAt: node.createdAt, updatedAt: node.updatedAt });
}

async function prepare() {
  const nodes = Array.from({ length: 6 }, (_, i) => ({ ...createQaNode(`chain-${i}`, at),
    ...(i >= 4 ? { kind: 'topic' as const, review: null, reveal: null } : {}) }));
  const observer = createQaNode('observer', '2027-01-01T08:00:00.000Z');
  nodes.forEach(save);
  save(observer);
  const state = createSetStateHarness(createWorkspaceFixture([...nodes, observer]));
  const actions = createWorkspaceReviewActions(state.setState, state.getState, createLocalReviewSchedulerAdapter());
  const history = createWorkspaceActionHistoryActions(state.setState, state.getState);
  state.setState({ ...actions, ...history });
  await actions.startReviewSession(at);
  return { ...state, actions, history };
}

function editBeforeAcknowledgement(app: App, currentId: string, step: number, expected: Map<string, Node>) {
  acknowledge = () => {
    const latest = snapshot();
    const updates: Record<string, Node> = {};
    for (const id of [currentId, 'observer']) {
      const node: Node = { ...app.getState().nodesById[id]!,
        reading: latest.nodesById[id]!.reading ?? null, review: latest.nodesById[id]!.review ?? null,
        title: `Concurrent ${id} ${step}`,
        content: `Complete ${id} paragraph ${step}.\n\nPreserved second paragraph 中文 ${step}.` };
      save(node);
      updates[id] = { ...app.getState().nodesById[id]!, title: node.title, content: node.content };
      expected.set(id, node);
    }
    if (step === 0) {
      const added = createQaNode('concurrent-new', '2027-02-01T08:00:00.000Z');
      save(added);
      updates[added.id] = added;
      expected.set(added.id, added);
    }
    app.setState(state => ({ nodesById: { ...state.nodesById, ...updates },
      nodeOrder: [...new Set([...state.nodeOrder, ...Object.keys(updates)])] }));
  };
}

function expectDocuments(app: App, expected: Map<string, Node>) {
  const disk = snapshot();
  for (const [id, node] of expected) {
    expect(app.getState().nodesById[id]).toMatchObject({ title: node.title, content: node.content });
    expect(disk.nodesById[id]).toMatchObject({ title: node.title, content: node.content });
  }
}

async function replay(app: App, direction: 'undo' | 'redo', expected: Map<string, Node>) {
  const action = direction === 'undo' ? app.history.undoWorkspaceAction : app.history.redoWorkspaceAction;
  expect(action()).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expectDocuments(app, expected);
}

it('retains concurrent complete documents through four grades, Read, chained history and database reopen', async () => {
  const app = await prepare();
  const expected = new Map<string, Node>();
  const targets: string[] = [];
  for (const [index, action] of ([1, 2, 3, 4, 'read'] as const).entries()) {
    const id = app.getState().reviewSession.currentNodeId!;
    expect(app.getState().nodesById[id]?.kind).toBe(action === 'read' ? 'topic' : 'item');
    targets.push(id);
    editBeforeAcknowledgement(app, id, index, expected);
    if (action === 'read') expect(await app.actions.readReviewTopic(at)).toBe(true);
    else {
      app.actions.revealReviewAnswer();
      expect(await app.actions.gradeReviewCard(action, at)).toBe(true);
    }
    expect(acknowledge).toBeUndefined();
    expect(app.getState().reviewSession.currentNodeId).not.toBe(id);
    expectDocuments(app, expected);
  }
  expect(new Set(targets).size).toBe(5);
  expect(app.getState().appActionHistory.undoStack).toHaveLength(5);
  const saved = app.getState().reviewSession;
  for (let i = 0; i < 5; i++) await replay(app, 'undo', expected);
  const undone = snapshot();
  for (const id of targets.slice(0, 4)) expect(undone.nodesById[id]?.review?.reps ?? 0).toBe(0);
  expect(undone.nodesById[targets[4]!]!.reading ?? null).toBeNull();
  for (let i = 0; i < 5; i++) await replay(app, 'redo', expected);
  const committed = snapshot();
  for (const id of targets.slice(0, 4)) expect(committed.nodesById[id]?.review?.reps).toBe(1);
  expect(committed.nodesById[targets[4]!]!.reading?.repetitionCount).toBe(1);
  closeDatabaseConnection();
  initializeDatabase();
  expectDocuments(app, expected);
  const restored = await openDesktopDailyFlow({ now: at, mode: 'recommended' });
  expect(restored.session.currentNodeId).toBe(saved.currentNodeId);
  expect(restored.session.reviewedItemCount).toBe(saved.reviewedItemCount);
  expect(restored.session.readTopicCount).toBe(saved.readTopicCount);
  for (const id of targets) {
    expect(snapshot().nodesById[id]?.reading).toEqual(committed.nodesById[id]?.reading);
    expect(snapshot().nodesById[id]?.review).toEqual(committed.nodesById[id]?.review);
  }
});
