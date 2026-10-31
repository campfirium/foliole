// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: appDataDir,
  app_cache_dir: path.join(appDataDir, 'cache'), app_config_dir: path.join(appDataDir, 'config'),
  app_log_dir: path.join(appDataDir, 'logs') }) }));
vi.mock('./boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../src/shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => bridge.invoke }));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { drainDirtyNodeSyncVersions } from '../database/nodeSyncVersionDrain.js';
import { upsertVersionedNodeSnapshot } from '../database/nodeVersionedMutations.js';

import { handleNodeMutationCommand } from './storageNodeMutationCommands.js';

// Renderer modules retain their bundler resolution across the host's NodeNext boundary.
const rendererModule = (modulePath: string) => import(modulePath);
const { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } =
  await rendererModule('../../src/store/workspaceStoreNodeActions.test-support.ts');
const { createWorkspaceNodeActions } = await rendererModule('../../src/store/workspaceStoreNodeActions.ts');
const { createWorkspaceEditorOperationHistoryActions } = await rendererModule('../../src/store/workspaceEditorOperationHistory.ts');
const { startEditorAnnotationHistoryMutation } = await rendererModule('../../src/store/workspaceEditorAnnotationHistoryMutation.ts');
const { getEditorOperationSession } = await rendererModule('../../src/features/editor/model/editorOperationHistory.ts');
const { createTextHistoryEntry } = await rendererModule('../../src/features/editor/model/editorOperationHistory.testSupport.ts');
const { createEditorAnnotationCreateEntry } = await rendererModule('../../src/store/workspaceEditorAnnotationOperationEntry.ts');
const { toRendererBoundaryNode } = await rendererModule('../../src/store/workspaceRendererBoundary.ts');
const { resetNodeContentVersionGuardForTests } = await rendererModule('../../src/store/workspaceNodeContentVersionGuard.ts');
const { resetPendingNodeContentRuntimePersistsForTests } = await rendererModule('../../src/store/workspaceStoreContentRuntimePersist.ts');

let root = '';
let harness: ReturnType<typeof createWorkspaceNodeActionsSetStateHarness>;
let id = '';
const read = () => openDatabaseConnection().driver.queryOne('SELECT reveal, deleted_at FROM nodes WHERE id = ?', [id]);
const session = () => getEditorOperationSession(harness.getState().editorOperationHistory, 'node-1');

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-annotation-history-'));
  appDataDir = path.join(root, 'data');
  await initializeDatabase();
  const fixture = createWorkspaceNodeActionsFixture();
  const parent = fixture.nodesById['node-1'];
  const currentVersionId = upsertVersionedNodeSnapshot({ ...parent, nodeId: parent.id, position: 0 });
  fixture.nodesById['node-1'] = { ...parent, currentVersionId };
  harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const actions = createWorkspaceNodeActions(harness.setState, harness.getState);
  const history = createWorkspaceEditorOperationHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...actions, ...history });
  bridge.invoke.mockReset().mockImplementation(async (command, args) => handleNodeMutationCommand(command, args));
  id = await harness.getState().createQANodeFromSelection('node-1', 'Prompt', 'Seed', 'cloze', {
    id: 'cloze', kind: 'cloze', locator: { from: 2, to: 6, originalText: 'Seed' }
  });
  expect(id).toBeTruthy();
  expect(session().undoStack.at(-1)).toMatchObject({ canonical: 'confirmed', historyFacts: [expect.objectContaining({ nodeId: id })] });
});
afterEach(async () => {
  await drainDirtyNodeSyncVersions();
  resetPendingNodeContentRuntimePersistsForTests();
  resetNodeContentVersionGuardForTests();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('allows undo creation after an answer is edited and restored, but rejects a newer answer', async () => {
  const state = harness.getState();
  const originalVersion = state.nodesById[id].currentVersionId;
  await state.updateNodeReveal(id, 'Changed answer');
  await state.updateNodeReveal(id, 'Seed');
  expect(harness.getState().nodesById[id].currentVersionId).not.toBe(originalVersion);
  expect(state.undoEditorOperation()).toBe(true);
  await vi.waitFor(() => expect(read()?.deleted_at).toEqual(expect.any(String)));
  await vi.waitFor(() => expect(session().redoStack).toHaveLength(1));
  expect(harness.getState().redoEditorOperation()).toBe(true);
  await vi.waitFor(() => expect(read()?.deleted_at).toBeNull());
  await vi.waitFor(() => expect(session().undoStack.at(-1)).not.toHaveProperty('applyingMode'));
  await state.updateNodeReveal(id, 'Do not hide this answer');
  state.undoEditorOperation();
  await vi.waitFor(() => expect(session().undoStack.at(-1)).not.toHaveProperty('applyingMode'));
  expect(read()).toMatchObject({ reveal: 'Do not hide this answer', deleted_at: null });
  expect(harness.getState().trashedNodeIds).not.toContain(id);
});

it('captures canonical facts for an evicted annotation and restores them through the same instance', async () => {
  const node = harness.getState().nodesById[id];
  harness.setState({ nodesById: { ...harness.getState().nodesById, [id]: toRendererBoundaryNode(node, false) } });
  harness.getState().deleteEditorAnnotationNodes([id]);
  await vi.waitFor(() => expect(read()?.deleted_at).toEqual(expect.any(String)));
  await vi.waitFor(() => expect(session().undoStack.at(-1)).toMatchObject({ type: 'annotation.delete', canonical: 'confirmed',
    historyFacts: [expect.objectContaining({ nodeId: id })] }));
  harness.getState().undoEditorOperation();
  await vi.waitFor(() => expect(read()?.deleted_at).toBeNull());
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(id));
  closeDatabaseConnection();
  await initializeDatabase();
  expect(read()).toMatchObject({ reveal: 'Seed', deleted_at: null });
});

it('reports a committed delete after a later text step without manufacturing redo', async () => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  bridge.invoke.mockImplementationOnce(async (command, args) => {
    const result = handleNodeMutationCommand(command, args);
    await held;
    return result;
  });
  const committed = vi.fn();
  startEditorAnnotationHistoryMutation({ entry: session().undoStack.at(-1), get: harness.getState,
    set: harness.setState, mode: 'undo', onCommitted: committed });
  await vi.waitFor(() => expect(read()?.deleted_at).toEqual(expect.any(String)));
  harness.getState().pushEditorOperationEntry(createTextHistoryEntry({ beforeContent: '# Seed', afterContent: '# Seed later' }));
  release();
  await vi.waitFor(() => expect(committed).toHaveBeenCalledWith({ mode: 'undo', nodeIds: [id] }));
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(id));
  expect(session().redoStack).toEqual([]);
  expect(session().undoStack.at(-1)).toMatchObject({ type: 'text.edit' });
});

it('commits image parent removal and restoration with the annotation and preserves them after reopening', async () => {
  const region = { id: 'image-region', x: 0.1, y: 0.1, width: 0.3, height: 0.3 };
  const regions = [{ attachmentId: 'image', regions: [region] }];
  const parent = { ...harness.getState().nodesById['node-1'], imageRegions: regions };
  upsertVersionedNodeSnapshot({ ...parent, nodeId: parent.id, position: 0 });
  const image = { ...harness.getState().nodesById[id], id: 'image-child', content: 'Image question', reveal: 'Image answer',
    anchorLink: { id: region.id, kind: 'cloze', locator: { attachmentId: 'image', ...region } } };
  upsertVersionedNodeSnapshot({ ...image, nodeId: image.id, position: 1 });
  const state = harness.getState();
  harness.setState({ nodesById: { ...state.nodesById, [parent.id]: parent, [image.id]: image }, nodeOrder: [...state.nodeOrder, image.id] });
  state.pushEditorOperationEntry(createEditorAnnotationCreateEntry([image], parent.id, harness.getState().nodeOrder));
  state.settleEditorAnnotationCreation({ nodeId: parent.id, annotationNodeIds: [image.id], succeeded: true });
  const readRegions = () => openDatabaseConnection().sqlite.prepare('SELECT image_regions FROM nodes WHERE id = ?').pluck().get(parent.id);
  state.undoEditorOperation();
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).toContain(image.id));
  expect(readRegions()).toBeNull();
  expect(harness.getState().nodesById[parent.id].imageRegions ?? null).toBeNull();
  harness.getState().redoEditorOperation();
  await vi.waitFor(() => expect(harness.getState().trashedNodeIds).not.toContain(image.id));
  expect(JSON.parse(String(readRegions()))).toEqual(regions);
  expect(harness.getState().nodesById[parent.id].imageRegions).toEqual(regions);
  expect(harness.getState().trashedNodeIds).not.toContain(id);
  closeDatabaseConnection();
  await initializeDatabase();
  expect(JSON.parse(String(readRegions()))).toEqual(regions);
});
