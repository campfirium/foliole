// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'daily-reading-trash', libraryPath })
}));
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: root,
  app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs') }) }));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: unknown) => {
  if (command === 'load_node_learning') {
    const { readWorkspaceNodeLearning } = await import('../../lib/core/database/workspaceNodeLearning');
    return readWorkspaceNodeLearning(openDatabaseConnection().driver, (args as { nodeIds: string[] }).nodeIds);
  }
  if (command === 'open_daily_flow') return openDesktopDailyFlow(args);
  if (command === 'commit_daily_flow') return commitDesktopDailyFlow(args);
  if (command === 'save_node_open_state') return null;
  throw new Error(`Unexpected command: ${command}`);
} }));

import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection';
import { commitDesktopDailyFlow, openDesktopDailyFlow } from '../../electron/database/dailyFlow';
import { initializeDatabase } from '../../electron/database/migrate';
import { upsertNodeSnapshot } from '../../electron/database/nodeMutations';
import { saveNodeReadingState } from '../../electron/database/nodeReadingState';
import { loadWorkspaceSnapshot } from '../../electron/database/workspaceSnapshot';
import { createLocalReviewSchedulerAdapter } from '../features/review/model/localReviewSchedulerAdapter';
import { hydrateCurrentReviewSchedulerSettings, DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../features/settings/model/reviewSchedulerSettings';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import { createQaNode, createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';

const now = '2026-10-26T08:00:00.000Z';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-daily-reading-trash-'));
  initializeDatabase();
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});
afterEach(async () => { vi.restoreAllMocks(); closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); });

async function setupTopics(count: number) {
  const nodes = Array.from({ length: count }, (_, i) => ({ ...createQaNode(`node-${i}`, now),
    kind: 'topic' as const, review: null, reveal: null }));
  for (const node of nodes) upsertNodeSnapshot({ nodeId: node.id, title: node.title, kind: node.kind,
    parentNodeId: null, content: node.content, reveal: node.reveal, review: null,
    isTitleManual: true, anchorLink: null, position: 0, createdAt: node.createdAt, updatedAt: node.updatedAt });
  const harness = createSetStateHarness(createWorkspaceFixture(nodes));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, createLocalReviewSchedulerAdapter());
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...actions, ...history });
  await actions.startReviewSession(now);
  return { ...harness, actions };
}

it('dismisses a sequential topic whose next sibling is in the trash', async () => {
  const app = await setupTopics(3);
  const [first, trashed, third] = (openDatabaseConnection().sqlite
    .prepare('SELECT node_id FROM daily_flow_entries ORDER BY order_key').all() as { node_id: string }[])
    .map(row => row.node_id) as [string, string, string];
  const folder = { ...createQaNode('source', now), kind: 'folder' as const, reading: null, review: null,
    reveal: null, sequentialReadingEnabled: true, manualChildOrder: [first, trashed, third] };
  upsertNodeSnapshot({ nodeId: folder.id, title: folder.title, kind: 'folder', parentNodeId: null,
    content: '', reveal: null, review: null, reading: null, sequentialReadingEnabled: true,
    isTitleManual: true, anchorLink: null, position: 0, createdAt: now, updatedAt: now });
  const locked = { intervalDurationMs: 60000, intervalGrowthFactor: 2, lastHandledAt: now,
    nextAt: now, priority: 10, readingPosition: 0, repetitionCount: 0, state: 'locked' as const };
  const db = openDatabaseConnection().sqlite;
  db.prepare('UPDATE nodes SET parent_id=? WHERE id IN (?,?,?)').run(folder.id, first, trashed, third);
  saveNodeReadingState({ nodeId: trashed, reading: locked, updatedAt: now });
  saveNodeReadingState({ nodeId: third, reading: locked, updatedAt: now });
  db.prepare('UPDATE nodes SET deleted_at=? WHERE id=?').run(now, trashed);
  const nodes = app.getState().nodesById;
  app.setState({ reviewSessionMode: 'reading-only', reviewSessionModeExpiresAt: '2026-10-27T00:00:00.000Z',
    nodeOrder: [...app.getState().nodeOrder, folder.id], trashedNodeIds: [trashed],
    nodesById: { ...nodes, source: folder,
      [first]: { ...nodes[first]!, parentNodeId: folder.id },
      [trashed]: { ...nodes[trashed]!, parentNodeId: folder.id, reading: locked },
      [third]: { ...nodes[third]!, parentNodeId: folder.id, reading: locked } } });
  await app.actions.startReviewSession(now);
  expect(app.getState().reviewSession.currentNodeId).toBe(first);

  expect(await app.actions.dismissReviewTopic(now)).toBe(true);

  const saved = loadWorkspaceSnapshot()!.nodesById;
  expect(saved[first]!.reading!.state).toBe('dismissed');
  expect((db.prepare('SELECT state FROM node_reading WHERE node_id=?').get(trashed) as { state: string }).state)
    .toBe('locked');
  expect(saved[third]!.reading!.state).toBe('active');
  expect(app.getState().reviewSession.currentNodeId).toBe(third);
});
