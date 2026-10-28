import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { getEditorOperationSession } from '../features/editor/model/editorOperationHistory';
import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';
import { readCompanionContentSource, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { applyCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistoryReplay';
import { loadCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistoryRepository';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { persistCompanionSelectionAnnotation, deleteCompanionExistingHighlight, addNoteToCompanionExistingHighlight } from './companionSelectionAnnotationActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const node: WorkspaceNodeSnapshot = { id: 'topic', content: 'Original body', kind: 'topic', title: 'Topic',
  isTitleManual: true, hideTitleHeading: false, parentNodeId: null, reveal: null, anchorLink: null,
  reading: null, review: null, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' };
beforeEach(async () => {
  library = await createSearchLibrary(0);
  const record = await toWorkspaceNativeNodeVersion(node, 'remote', 'base');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
});
afterEach(async () => { vi.restoreAllMocks(); await library.close(); });

async function edit(content: string) {
  const source = await readCompanionContentSource('topic');
  return saveCompanionContentEdit({ nodeId: 'topic', content, baseContent: source.content,
    baseVersionId: source.versionId, versionId: crypto.randomUUID(), updatedAt: new Date().toISOString() });
}
const stored = () => library.database.prepare("SELECT content FROM nodes WHERE id='topic'").get();
const session = async () => getEditorOperationSession(await loadCompanionEditHistory(), 'topic');

it('restores persisted content through undo/redo and discards redo after a new edit', async () => {
  await edit('First edit');
  await edit('Second edit');
  expect((await session()).undoStack).toHaveLength(2);
  expect(await applyCompanionEditHistory('topic', 'undo')).toMatchObject({ nodeId: 'topic' });
  expect(stored()).toEqual({ content: 'First edit' });
  expect(await applyCompanionEditHistory('topic', 'undo')).toMatchObject({ nodeId: 'topic' });
  expect(stored()).toEqual({ content: node.content });
  expect(await applyCompanionEditHistory('topic', 'redo')).toMatchObject({ nodeId: 'topic' });
  expect(stored()).toEqual({ content: 'First edit' });
  await edit('Replacement edit');
  expect((await session()).redoStack).toHaveLength(0);
  expect(await applyCompanionEditHistory('topic', 'redo')).toBe(false);
  expect(stored()).toEqual({ content: 'Replacement edit' });
});

it('keeps content and history unchanged when the undo write fails', async () => {
  await edit('Saved');
  const before = await loadCompanionEditHistory();
  vi.spyOn(library.connection, 'commitTransaction').mockRejectedValueOnce(new Error('disk full'));
  await expect(applyCompanionEditHistory('topic', 'undo')).rejects.toThrow();
  expect(stored()).toEqual({ content: 'Saved' });
  expect(await loadCompanionEditHistory()).toEqual(before);
});

it('rejects stale undo after another device changes the body', async () => {
  await edit('Saved');
  const current = await loadCompanionWorkspaceNode('topic');
  const version = await toWorkspaceNativeNodeVersion({ ...current!, content: 'Other device', updatedAt: '2026-10-26T00:00:00Z' }, 'remote');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [version], { enqueueSearchInvalidations: false }));
  await expect(applyCompanionEditHistory('topic', 'undo')).rejects.toThrow('editor_history_content_changed');
  expect(stored()).toEqual({ content: 'Other device' });
  expect((await session()).redoStack).toHaveLength(0);
});

async function annotate(kind: 'highlight' | 'cloze' | 'note' = 'highlight') {
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  return persistCompanionSelectionAnnotation({ deviceId: 'phone', kind, snapshot, note: 'Comment',
    payload: { parentNodeId: 'topic', selectionText: 'Original', anchorId: crypto.randomUUID(), clozeContent: '[...] body',
      entries: [{ locator: { originalText: 'Original', from: 0, to: 8 } }] } });
}

it.each(['highlight', 'cloze', 'note'] as const)('undoes and redoes %s creation without duplicating the annotation', async kind => {
  const created = await annotate(kind);
  expect(created).not.toBeNull();
  const id = created!.nodeId;
  const profile = library.database.prepare('SELECT * FROM node_review WHERE node_id = ?').get(id);
  if (kind === 'cloze') expect(profile).toBeDefined();
  await applyCompanionEditHistory('topic', 'undo');
  expect((await loadCompanionWorkspaceNode(id))!.deletedAt).toBeTruthy();
  await applyCompanionEditHistory('topic', 'redo');
  const restored = (await loadCompanionWorkspaceNode(id))!;
  expect(restored.deletedAt).toBeFalsy();
  expect(library.database.prepare('SELECT * FROM node_review WHERE node_id = ?').get(id)).toEqual(profile);
  expect(library.database.prepare("SELECT count(*) AS count FROM nodes WHERE parent_id='topic'").get()).toEqual({ count: 1 });
});

it('reverses note edits, annotation removal and creation in document order', async () => {
  const created = (await annotate())!;
  const initial = (await loadCompanionWorkspaceNode(created.nodeId))!.content;
  await addNoteToCompanionExistingHighlight({ deviceId: 'phone', nodeId: created.nodeId, originalText: 'Original', note: 'Added note',
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  const noted = (await loadCompanionWorkspaceNode(created.nodeId))!.content;
  await deleteCompanionExistingHighlight({ deviceId: 'phone', nodeId: created.nodeId,
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  await applyCompanionEditHistory('topic', 'undo');
  expect((await loadCompanionWorkspaceNode(created.nodeId))!.content).toBe(noted);
  await applyCompanionEditHistory('topic', 'undo');
  expect((await loadCompanionWorkspaceNode(created.nodeId))!.content).toBe(initial);
  await applyCompanionEditHistory('topic', 'undo');
  expect((await loadCompanionWorkspaceNode(created.nodeId))!.deletedAt).toBeTruthy();
  await applyCompanionEditHistory('topic', 'redo');
  await applyCompanionEditHistory('topic', 'redo');
  await applyCompanionEditHistory('topic', 'redo');
  expect((await loadCompanionWorkspaceNode(created.nodeId))!.deletedAt).toBeTruthy();
});

it('retains separate typing groups recorded by the production editor', async () => {
  const entries = [createTextHistoryEntry({ nodeId: 'topic', beforeContent: node.content, afterContent: 'First', timestamp: 1000 }),
    createTextHistoryEntry({ nodeId: 'topic', beforeContent: 'First', afterContent: 'Second', timestamp: 2000 })];
  await saveCompanionContentEdit({ nodeId: 'topic', content: 'Second', baseContent: node.content,
    baseVersionId: 'base', versionId: crypto.randomUUID(), updatedAt: new Date().toISOString(),
    historyTransactions: [{ entries, field: 'content' }] });
  await applyCompanionEditHistory('topic', 'undo');
  expect(stored()).toEqual({ content: 'First' });
  await applyCompanionEditHistory('topic', 'undo');
  expect(stored()).toEqual({ content: node.content });
});

it('keeps body and answer changes in their actual editing order', async () => {
  const record = await toWorkspaceNativeNodeVersion({ ...node, kind: 'item', reveal: 'Answer', currentVersionId: 'base' }, 'remote');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
  const source = await readCompanionContentSource('topic');
  await saveCompanionContentEdit({ nodeId: 'topic', content: 'Third', reveal: 'Next answer', baseContent: source.content,
    baseVersionId: source.versionId, versionId: crypto.randomUUID(), updatedAt: new Date().toISOString(), historyTransactions: [
      { field: 'content', entries: [createTextHistoryEntry({ beforeContent: node.content, afterContent: 'First', timestamp: 1000 })] },
      { field: 'reveal', entries: [createTextHistoryEntry({ beforeContent: 'Answer', afterContent: 'Next answer', timestamp: 2000 })] },
      { field: 'content', entries: [createTextHistoryEntry({ beforeContent: 'First', afterContent: 'Third', timestamp: 3000 })] }
    ] });
  await applyCompanionEditHistory('topic', 'undo');
  expect(await readCompanionContentSource('topic')).toMatchObject({ content: 'First', reveal: 'Next answer' });
  await applyCompanionEditHistory('topic', 'undo');
  expect(await readCompanionContentSource('topic')).toMatchObject({ content: 'First', reveal: 'Answer' });
  await applyCompanionEditHistory('topic', 'undo');
  expect(await readCompanionContentSource('topic')).toMatchObject({ content: node.content, reveal: 'Answer' });
});

it('restores image descriptions after removing an image and collecting old text bodies', async () => {
  const source = await readCompanionContentSource('topic');
  const image = { storage_key: `${'a'.repeat(64)}.png`, original_name: 'Original.png', role: 'image' as const };
  const content = `![Original](asset://${image.storage_key})`;
  await saveCompanionContentEdit({ nodeId: 'topic', content, baseVersionId: source.versionId,
    baseContent: source.content, versionId: crypto.randomUUID(), updatedAt: new Date().toISOString(), newImageReferences: [image] });
  await edit('Image removed');
  await applyCompanionEditHistory('topic', 'undo');
  expect(await readCompanionContentSource('topic')).toMatchObject({ content, imageReferences: [image] });
});

it('undoes deletion of an existing synced highlight with no earlier local history', async () => {
  const existing = await toWorkspaceNativeNodeVersion({ ...node, id: 'synced-highlight', content: 'Original', parentNodeId: 'topic',
    anchorLink: { id: 'synced-anchor', kind: 'highlight', locator: { from: 0, to: 8, originalText: 'Original' } } }, 'remote');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [existing], { enqueueSearchInvalidations: false }));
  await deleteCompanionExistingHighlight({ deviceId: 'phone', nodeId: 'synced-highlight',
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  await applyCompanionEditHistory('topic', 'undo');
  expect(await loadCompanionWorkspaceNode('synced-highlight')).toMatchObject({ content: 'Original', anchorLink: {
    kind: 'highlight', locator: { from: 0, to: 8, originalText: 'Original' }
  } });
  expect((await loadCompanionWorkspaceNode('synced-highlight'))!.deletedAt).toBeFalsy();
});

it('uses the desktop document-history limit and releases evicted document holds', async () => {
  for (let index = 0; index < 13; index++) {
    const id = `document-${index}`;
    const record = await toWorkspaceNativeNodeVersion({ ...node, id }, 'remote');
    await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
    const source = await readCompanionContentSource(id);
    await saveCompanionContentEdit({ nodeId: id, content: `Edited ${index}`, baseContent: source.content,
      baseVersionId: source.versionId, versionId: crypto.randomUUID(), updatedAt: new Date().toISOString() });
  }
  const history = await loadCompanionEditHistory();
  expect(history.recentNodeIds).toHaveLength(12);
  expect(getEditorOperationSession(history, 'document-0').undoStack).toHaveLength(0);
  expect(await applyCompanionEditHistory('document-12', 'undo')).toMatchObject({ nodeId: 'document-12' });
  expect(library.database.prepare("SELECT count(*) AS count FROM node_version_local_holds WHERE object_id='document-0'").get())
    .toEqual({ count: 0 });
  expect((await readCompanionContentSource('document-0')).content).toBe('Edited 0');
});
