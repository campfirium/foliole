// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../src/shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => bridge.invoke }));

import { loadWorkspaceListSnapshot } from '../../lib/core/database/workspaceListSnapshot.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertVersionedNodeSnapshot } from '../database/nodeVersionedMutations.js';
import { loadWorkspaceNodeDocument } from '../database/workspaceNodeDocument.js';

import { handleLocalContentEditCommand } from './storageLocalContentEditCommand.js';

// Load renderer code across the desktop host's NodeNext compilation boundary.
const rendererModule = (modulePath: string) => import(modulePath);
const { createAnswerChangeHandler } = await rendererModule('../../src/app/hooks/appControllerEditorHandlers.ts');
const { createEditorTextReplaySave } = await rendererModule('../../src/features/editor/model/editorTextReplaySave.ts');
const { resetNodeContentVersionGuardForTests } = await rendererModule('../../src/store/workspaceNodeContentVersionGuard.ts');
const { toRendererBoundaryNode } = await rendererModule('../../src/store/workspaceRendererBoundary.ts');
const { createUpdateNodeContentAction } = await rendererModule('../../src/store/workspaceStoreContentActions.ts');
const { drainPendingNodeContentRuntimePersists, resetPendingNodeContentRuntimePersistsForTests } =
  await rendererModule('../../src/store/workspaceStoreContentRuntimePersist.ts');
const { createUpdateNodeRevealAction } = await rendererModule('../../src/store/workspaceStoreRevealAction.ts');
type WorkspaceState = {
  libraryScope: string;
  nodeOrder: string[];
  trashedNodeIds: string[];
  nodesById: Record<string, NonNullable<ReturnType<typeof loadWorkspaceListSnapshot>>['nodesById'][string]
    & { pendingImageReferences?: unknown[] }>;
};

let tempRoot = '';
let state: WorkspaceState;
const set = (patch: Partial<WorkspaceState> | ((current: WorkspaceState) => Partial<WorkspaceState>)) => {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
};
const updateBody = createUpdateNodeContentAction(set);
const updateAnswer = createUpdateNodeRevealAction(set);
const read = () => openDatabaseConnection().sqlite.prepare('SELECT content, reveal FROM nodes WHERE id = ?').get('item');

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-editor-replay-'));
  appDataDir = path.join(tempRoot, 'data');
  await initializeDatabase();
  upsertVersionedNodeSnapshot({
    nodeId: 'item', kind: 'item', title: 'Prompt', content: 'Question', reveal: 'Answer',
    anchorLink: null, parentNodeId: null, position: 0, isTitleManual: true,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z'
  });
  const snapshot = loadWorkspaceListSnapshot(openDatabaseConnection().driver)!;
  state = { libraryScope: 'test', nodeOrder: ['item'], trashedNodeIds: [],
    nodesById: { item: { ...snapshot.nodesById.item!, parentNodeId: null, content: 'Question', hasContent: true,
      reveal: 'Answer', hasReveal: true } } } as unknown as WorkspaceState;
  bridge.invoke.mockReset().mockImplementation(async (command, args) => {
    if (command === 'load_node_document') return loadWorkspaceNodeDocument(args.nodeId);
    if (command !== 'update_node_content_with_anchors') throw new Error(`unexpected command ${command}`);
    return handleLocalContentEditCommand(args, null);
  });
});

afterEach(async () => {
  resetPendingNodeContentRuntimePersistsForTests();
  resetNodeContentVersionGuardForTests();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('keeps later answer and body input through a delayed replay receipt and database reopen', async () => {
  await expect(updateAnswer('item', 'Edited answer')).resolves.toBe(true);
  expect(read()).toEqual({ content: 'Question', reveal: 'Edited answer' });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  bridge.invoke.mockImplementationOnce(async (_command, args) => {
    const result = await handleLocalContentEditCommand(args, null);
    await held;
    return result;
  });
  const save = createEditorTextReplaySave(vi.fn());
  await updateAnswer('item', 'Answer', { historySave: save });
  await vi.waitFor(() => expect(read()).toEqual({ content: 'Question', reveal: 'Answer' }));
  const laterAnswer = updateAnswer('item', 'Answer after undo');
  await updateBody('item', 'Question after undo');
  expect(state.nodesById.item).toMatchObject({ content: 'Question after undo', reveal: 'Answer after undo' });
  release();
  await expect(save.completion).resolves.toBe(true);
  await laterAnswer;
  await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(true);
  expect(state.nodesById.item).toMatchObject({ content: 'Question after undo', reveal: 'Answer after undo' });
  closeDatabaseConnection();
  await initializeDatabase();
  expect(read()).toEqual({ content: 'Question after undo', reveal: 'Answer after undo' });
});

it('retains input after a failed replay and retries its exact version before successor saves', async () => {
  const failures = vi.fn();
  const save = createEditorTextReplaySave(failures);
  bridge.invoke.mockRejectedValueOnce(new Error('save unavailable'));
  await updateBody('item', 'Replayed question', { historySave: save });
  await vi.waitFor(() => expect(save.status).toBe('failed'));
  const firstEdit = bridge.invoke.mock.calls[0]![1].edit;
  await updateBody('item', 'Replayed question with later input');
  expect(state.nodesById.item?.content).toBe('Replayed question with later input');
  expect(read()).toEqual({ content: 'Question', reveal: 'Answer' });
  failures.mock.calls[0]![0]();
  await expect(save.completion).resolves.toBe(true);
  await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(true);
  expect(bridge.invoke.mock.calls[1]![1].edit.versionId).toBe(firstEdit.versionId);
  expect(read()).toEqual({ content: 'Replayed question with later input', reveal: 'Answer' });
});

it('loads the evicted question before saving an answer through the shared version chain', async () => {
  state.nodesById.item = toRendererBoundaryNode(state.nodesById.item!, false);
  expect(state.nodesById.item).toMatchObject({ content: '', reveal: null, hasContent: true, hasReveal: true });
  await expect(updateAnswer('item', 'Answer on unloaded Item')).resolves.toBe(true);
  expect(read()).toEqual({ content: 'Question', reveal: 'Answer on unloaded Item' });
  expect(state.nodesById.item).toMatchObject({ content: 'Question', reveal: 'Answer on unloaded Item' });
});

it('saves an answer image name with its version and preserves it after a body edit', async () => {
  const { importClipboardImageAttachment } = await import('../attachments/importClipboardImageAttachment.js');
  const image = await importClipboardImageAttachment({ nodeId: 'item', mimeType: 'image/png',
    bytesBase64: Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex').toString('base64'),
    originalName: 'Answer source.png' });
  if (image.status !== 'imported') throw new Error('image_prepare_failed');
  const reveal = `![Answer](asset://${image.storage_key})`;
  await expect(updateAnswer('item', reveal, { newImageReferences: [
    { storage_key: image.storage_key, original_name: image.original_name, role: 'image' }
  ] })).resolves.toBe(true);
  await updateBody('item', 'Question edited after answer image');
  await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(true);
  expect(read()).toEqual({ content: 'Question edited after answer image', reveal });
  const references = openDatabaseConnection().sqlite.prepare('SELECT resource_references FROM nodes WHERE id = ?').pluck().get('item');
  expect(JSON.parse(String(references))).toContainEqual({ storage_key: image.storage_key, original_name: 'Answer source.png', role: 'image' });
  expect(state.nodesById.item?.pendingImageReferences ?? []).toEqual([]);
});

it('settles an old-library commit without publishing its late receipt into the new library', async () => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  bridge.invoke.mockImplementationOnce(async (_command, args) => {
    const result = await handleLocalContentEditCommand(args, null);
    await held;
    return result;
  });
  const save = createEditorTextReplaySave(vi.fn());
  await updateBody('item', 'Old library replay', { historySave: save });
  await vi.waitFor(() => expect(read()).toEqual({ content: 'Old library replay', reveal: 'Answer' }));
  set(current => ({ libraryScope: 'other', nodesById: {
    item: { ...current.nodesById.item!, content: 'Other library body', reveal: 'Other answer' }
  } }));
  release();
  await expect(save.completion).resolves.toBe(true);
  expect(state.nodesById.item).toMatchObject({ content: 'Other library body', reveal: 'Other answer' });
  expect(read()).toEqual({ content: 'Old library replay', reveal: 'Answer' });
});

it('saves answer input when the body flush reports that there was no pending draft', async () => {
  const changeAnswer = createAnswerChangeHandler({
    runtime: { flushPendingEditorDraft: () => false, isViewingTrashNode: false },
    ws: { activeNodeId: 'item', updateNodeReveal: updateAnswer }
  });
  changeAnswer('Answer after a settled body');
  await vi.waitFor(() => expect(read()).toEqual({ content: 'Question', reveal: 'Answer after a settled body' }));
});
