import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { vi } from 'vitest';

import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionMaintenance,
  runWithDatabaseConnectionOwner } from '../../electron/database/connection.js';
import { openDesktopDailyFlow } from '../../electron/database/dailyFlow.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { upsertNodeSnapshot } from '../../electron/database/nodeMutations.js';
import { loadWorkspaceSnapshot } from '../../electron/database/workspaceSnapshot.js';
import { handleDailyFlowCommand } from '../../electron/ipc/dailyFlowCommands.js';
import { handleWorkspaceReadCommand } from '../../electron/ipc/storageReadCommands.js';
import { createLocalReviewSchedulerAdapter } from '../features/review/model/localReviewSchedulerAdapter';
import { waitForWorkspaceRuntimeWrites } from '../shared/platform/runtimeInvoke';
import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeNodeRepository';
import { createWorkspaceReviewActions } from '../store/workspaceStoreReviewActions';
import { createQaNode, createReadingNode, createSetStateHarness, createWorkspaceFixture } from '../store/workspaceStoreReviewActions.test-support';

const guardrailNative = vi.hoisted(() => ({ root: '', invoke: vi.fn() }));
export const guardrailNow = '2026-03-03T00:00:00.000Z';

export function getGuardrailInvoke() { return guardrailNative.invoke; }

vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'durable-guardrail', libraryPath })
}));
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: guardrailNative.root,
  app_cache_dir: path.join(guardrailNative.root, 'cache'),
  app_config_dir: path.join(guardrailNative.root, 'config'),
  app_log_dir: path.join(guardrailNative.root, 'logs')
}) }));
vi.mock('../../electron/sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: async () => undefined }));

export async function startGuardrailDatabase() {
  guardrailNative.root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-durable-guardrail-'));
  initializeDatabase();
  guardrailNative.invoke.mockReset();
  guardrailNative.invoke.mockImplementation((command: string, args: Record<string, unknown> = {}) =>
    runWithDatabaseConnectionOwner(async () => {
      if (command === 'open_daily_flow' || command === 'commit_daily_flow' || command === 'read_daily_flow_view') {
        return handleDailyFlowCommand(command, args);
      }
      const result = handleWorkspaceReadCommand(command, args);
      if (result === undefined) throw new Error(`Unexpected guardrail command: ${command}`);
      return result;
    }));
  window.electronAPI = { invoke: guardrailNative.invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined };
}

export async function stopGuardrailDatabase() {
  await waitForWorkspaceRuntimeWrites();
  await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
  delete window.electronAPI;
  await fs.rm(guardrailNative.root, { recursive: true, force: true });
}

export function createDurableReviewHarness(kind: 'topic' | 'item') {
  const createNode = kind === 'topic' ? createReadingNode : createQaNode;
  const nodes = ['first', 'second'].map(id => createNode(id, guardrailNow));
  for (const node of nodes) upsertNodeSnapshot(createWorkspaceRuntimeNodeSnapshot(node));
  const harness = createSetStateHarness(createWorkspaceFixture(nodes));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, createLocalReviewSchedulerAdapter());
  return { ...harness, actions };
}

export function readGuardrailStorage(nodeId: string) {
  const { sqlite } = openDatabaseConnection();
  return {
    node: loadWorkspaceSnapshot({ includeBody: true })!.nodesById[nodeId]!,
    operations: sqlite.prepare('SELECT op_id FROM daily_flow_operations').all(),
    reviews: sqlite.prepare('SELECT node_id, grade, kind FROM review_log WHERE node_id = ?').all(nodeId)
  };
}

export async function reopenGuardrailFlow() {
  await waitForWorkspaceRuntimeWrites();
  await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
  initializeDatabase();
  return runWithDatabaseConnectionOwner(() => openDesktopDailyFlow({ now: guardrailNow, mode: 'recommended' }));
}
