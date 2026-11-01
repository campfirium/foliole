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
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { resetSeededWorkspace } from '../database/databaseTestWorkspace.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertVersionedNodeSnapshot } from '../database/nodeVersionedMutations.js';
import { loadReadingProgress, saveReadingProgress } from '../database/readingProgress.js';
import { loadWorkspaceNodeDocument } from '../database/workspaceNodeDocument.js';

import { handleReadingAndReviewCommand, handleWorkspaceReadCommand } from './storageReadCommands.js';

// Load renderer modules across the host's NodeNext compilation boundary.
const rendererModule = (modulePath: string) => import(modulePath);
const { getRuntimeInvoke } = await rendererModule('../../src/shared/platform/runtimeInvoke.ts');
const { loadReadingProgressFromRuntime } = await rendererModule('../../src/shared/platform/workspaceRuntimeRepository.ts');
const { workspacePersistStoreStorage } = await rendererModule('../../src/store/workspacePersistStorage.ts');
const { refreshWorkspaceSyncProjection } = await rendererModule('../../src/store/workspaceSyncProjectionRefresh.ts');
const { createInitialWorkspaceState, useWorkspaceStore } = await rendererModule('../../src/store/workspaceStore.ts');
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

it('retains SQLite collection projections by reference without serializing the workspace', async () => {
  const content = '---\ncollections:\n  - Research\nauthor: Ada\n---\n# Research article\n\nOriginal body';
  const imported = runPreparedImport(createPreparedDesktopTextImport({
    content, fileName: 'research.md', filePath: '/tmp/research.md', importedAt: timestamp, kind: 'markdown'
  }));
  const nodeId = imported.nodeId!;
  importTopic('Other active article');
  const stringify = vi.spyOn(JSON, 'stringify');
  const value = await workspacePersistStoreStorage.getItem(key);
  const listRead = invoke.mock.calls.findIndex(([command]) => command === 'load_workspace_list_snapshot');
  const snapshot = await invoke.mock.results[listRead]!.value;
  expect(snapshot.nodesById[nodeId]).toMatchObject({ content: '', hasContent: true, collections: ['Research'] });
  expect(value?.state.nodesById[nodeId]?.collections).toBe(snapshot.nodesById[nodeId].collections);
  expect(value?.state.nodesById[nodeId]?.authorText).toBe('Ada');
  expect(stringify.mock.calls.filter(([input]) => input?.state?.nodesById || input?.nodesById)).toHaveLength(0);
  closeDatabaseConnection();
  expect(loadWorkspaceNodeDocument(nodeId)?.content).toBe(content);
});

it('publishes consecutive SQLite body commits in one hydrated store while preserving navigation and original fields', async () => {
  const nodeId = importTopic('Before');
  const value = await workspacePersistStoreStorage.getItem(key);
  const config = createWorkspaceStorePersistConfig(() => undefined);
  useWorkspaceStore.setState(config.merge!(value!.state, createInitialWorkspaceState()));
  const original = useWorkspaceStore.getState().nodesById[nodeId]!;
  const readOriginalFacts = () => openDatabaseConnection().driver.queryOne(
    'SELECT import_source_fingerprint, import_content_fingerprint, resource_references, created_at FROM nodes WHERE id = ?', [nodeId]);
  const originalFacts = readOriginalFacts();
  const scope = currentLibraryScope();
  for (const [body, updatedAt] of [
    ['After', '2026-10-29T00:00:00.000Z'], ['Body 2', '2026-10-30T00:00:00.000Z']
  ] as const) {
    const version = upsertVersionedNodeSnapshot({
      nodeId, kind: 'topic', title: original.title, content: body, reveal: null,
      parentNodeId: original.parentNodeId ?? null, anchorLink: null, position: original.position ?? null,
      isTitleManual: original.isTitleManual, createdAt: original.createdAt, updatedAt
    });
    const document = loadWorkspaceNodeDocument(nodeId)!;
    const projection = handleWorkspaceReadCommand('load_workspace_list_projection', { nodeIds: [nodeId], libraryScope: scope })!;
    expect(projection).toMatchObject({ nodesById: { [nodeId]: { updatedAt: document.updatedAt, currentVersionId: document.currentVersionId } } });
    expect(document.currentVersionId).toBe(version);
    invoke.mockClear();
    await refreshWorkspaceSyncProjection({ kind: 'nodes', nodeIds: [nodeId] }, scope);
    const current = useWorkspaceStore.getState();
    expect(current.activeNodeId).toBe(nodeId);
    expect(current.nodesById[nodeId]).toMatchObject({ content: body, currentVersionId: version,
      createdAt: original.createdAt, title: original.title, parentNodeId: original.parentNodeId });
    expect(readOriginalFacts()).toEqual(originalFacts);
    expect(invoke.mock.calls.filter(([command]) => command === 'load_workspace_list_snapshot')).toHaveLength(0);
    expect(invoke.mock.calls.filter(([command]) => command === 'load_node_document')).toHaveLength(1);
  }
  closeDatabaseConnection();
  expect(loadWorkspaceNodeDocument(nodeId)?.content).toBe('Body 2');
});
