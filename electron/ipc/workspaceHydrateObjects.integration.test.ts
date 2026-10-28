import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));
vi.mock('../../src/shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));
vi.mock('../../src/shared/platform/runtime/editorOperationHistoryRuntimeRepository', () => ({
  scheduleEditorOperationHistorySave: vi.fn()
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { resetSeededWorkspace } from '../database/databaseTestWorkspace.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadReadingProgress, saveReadingProgress } from '../database/readingProgress.js';

import { handleReadingAndReviewCommand, handleWorkspaceReadCommand } from './storageReadCommands.js';

// Load renderer modules across the host's NodeNext compilation boundary.
const rendererModule = (modulePath: string) => import(modulePath);
const { getRuntimeInvoke } = await rendererModule('../../src/shared/platform/runtimeInvoke.ts');
const { loadReadingProgressFromRuntime } = await rendererModule('../../src/shared/platform/workspaceRuntimeRepository.ts');
const { workspacePersistStoreStorage } = await rendererModule('../../src/store/workspacePersistStorage.ts');
const { createInitialWorkspaceState } = await rendererModule('../../src/store/workspaceStore.ts');
const { createWorkspaceStorePersistConfig } = await rendererModule('../../src/store/workspaceStorePersistConfig.ts');

let tempRoot = '';
const key = 'foliole-workspace-v1';
const timestamp = '2026-10-28T00:00:00.000Z';
const invoke = vi.fn(async (command: string, args = {}) => {
  const workspace = handleWorkspaceReadCommand(command, args);
  return workspace !== undefined ? workspace : handleReadingAndReviewCommand(command, args) ?? null;
});

beforeEach(async () => {
  window.localStorage.clear();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-hydrate-objects-'));
  appDataDir = path.join(tempRoot, 'first');
  initializeDatabase();
  resetSeededWorkspace();
  invoke.mockClear();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke as never);
});

afterEach(async () => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function importTopic(body: string) {
  const imported = runPreparedImport(createPreparedDesktopTextImport({
    content: `# Hydrated topic\n\n${body}`, fileName: 'topic.md', filePath: '/tmp/topic.md',
    importedAt: timestamp, kind: 'markdown'
  }));
  const nodeId = imported.nodeId!;
  saveReadingProgress({ activeNodeId: nodeId, updatedAt: timestamp,
    nodeViewStates: [{ nodeId, scrollTop: 18, selectionFrom: 2, selectionTo: 4 }] });
  return nodeId;
}

it('restores SQLite content, reading position and library scope through the object storage and production merge', async () => {
  const nodeId = importTopic('Durable body');
  expect(loadReadingProgress().nodeViewStateById[nodeId]).toMatchObject({ scrollTop: 18 });
  expect(await loadReadingProgressFromRuntime()).toEqual(loadReadingProgress());
  const stringify = vi.spyOn(JSON, 'stringify');
  const value = await workspacePersistStoreStorage.getItem(key);
  expect(value?.state.nodeViewById?.[nodeId]).toMatchObject({ scrollTop: 18 });
  expect(stringify.mock.calls.filter(([input]) => input?.state?.nodesById)).toHaveLength(0);
  const initial = createInitialWorkspaceState();
  const config = createWorkspaceStorePersistConfig(() => undefined);
  const merged = config.merge!(value!.state, initial);
  const legacy = JSON.parse(JSON.stringify(value));
  expect(merged).toEqual(config.merge!(legacy.state, initial));
  expect(merged.activeNodeId).toBe(nodeId);
  expect(merged.nodesById[nodeId]?.content).toContain('Durable body');
  expect(merged.libraryScope).toBe(currentLibraryScope());
  expect(merged.nodeViewById[nodeId]).toMatchObject({ scrollTop: 18, selection: { from: 2, to: 4 } });
  closeDatabaseConnection();
  const reopened = await workspacePersistStoreStorage.getItem(key);
  expect(reopened?.state.nodesById[nodeId]?.content).toBe(merged.nodesById[nodeId]?.content);
  expect(invoke.mock.calls.filter(([command]) => command === 'load_workspace_list_snapshot')).toHaveLength(2);
});

it('releases a failed read and never substitutes stale browser data or a previous library', async () => {
  const firstId = importTopic('First library body');
  const first = await workspacePersistStoreStorage.getItem(key);
  const loadFailure = vi.fn(async (command: string) => {
    if (command === 'load_workspace_list_snapshot') throw new Error('read unavailable');
    return null;
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(loadFailure as never);
  window.localStorage.setItem(key, '{"state":{"activeNodeId":"stale-browser"},"version":0}');
  await expect(workspacePersistStoreStorage.getItem(key)).rejects.toThrow('read unavailable');
  closeDatabaseConnection();
  appDataDir = path.join(tempRoot, 'second');
  initializeDatabase();
  resetSeededWorkspace();
  const secondId = importTopic('Second library body');
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke as never);
  const second = await workspacePersistStoreStorage.getItem(key);
  expect(second?.state.libraryScope).not.toBe(first?.state.libraryScope);
  expect(second?.state.nodesById[firstId]).toBeUndefined();
  expect(second?.state.activeNodeId).toBe(secondId);
  expect(second?.state.nodesById[secondId]?.content).toContain('Second library body');
  expect(first?.state.nodesById[firstId]?.content).toContain('First library body');
});
