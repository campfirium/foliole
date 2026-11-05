// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false, convertFileSrc: (url: string) => url }, registerPlugin: () => ({
    ...createCompanionNativeSyncStub(), resolveAttachmentResource: native.resolve
  }) };
});

import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { collectImageMatches } from '../../../../features/editor/model/markdownImageMatches';
import { getImageClozeLocator } from '../../../../features/image-cloze/model/imageCloze';
import { loadCompanionWorkspaceSyncState } from '../../companionWorkspaceSync';
import { loadPreparedCompanionArticle } from '../reading/companionArticlePreparation';
import { getCompanionReadingScope, invalidateCompanionReadingScope } from '../reading/companionReadingScope';
import { createSearchLibrary, reopenSearchLibrary } from '../runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../runtime/companionWorkspaceNodeStore';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { editableNode } from './companionContentEditingStable.testSupport';
import { applyCompanionEditHistory } from './companionEditHistoryReplay';
import { createCompanionImageCloze, saveCompanionImageCloze, type CompanionImageClozeRequest } from './companionImageCloze';
import { deleteCompanionImageCloze } from './companionImageClozeDeletion';

const hash = 'a'.repeat(64);
const key = `${hash}.png`;
const content = `Before\n\n![local](asset://${key})\n\nAfter`;
let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; vi.clearAllMocks(); });

async function prepare(kind: 'topic' | 'item' = 'topic') {
  library = await createSearchLibrary(0);
  const node = editableNode({ content, kind, resourceReferences: [{ storage_key: key, original_name: 'Diagram.png', role: 'image' }] });
  const version = await toWorkspaceNativeNodeVersion(node, 'source', 'parent-version');
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, [version], { enqueueSearchInvalidations: false }));
  native.resolve.mockResolvedValue({ status: 'ready', resource_url: 'data:image/png;base64,png' });
  const image = collectImageMatches(0, content)[0]!;
  return { nodeId: 'new-item', parentNodeId: 'topic', expectedContent: content, expectedVersionId: 'parent-version',
    imageRange: { from: image.from, to: image.to }, scope: getCompanionReadingScope(),
    regions: [{ attachmentId: hash, id: 'region-1', answer: '', x: 0.2, y: 0.3, width: 0.3, height: 0.2 }] } satisfies CompanionImageClozeRequest;
}

it('creates an anchored, reviewable Item with the original resource, retries once, and retains it after reopening', async () => {
  const request = await prepare();
  expect(await createCompanionImageCloze(request)).toBe('new-item');
  const saved = await loadCompanionWorkspaceNode('new-item');
  expect(saved).toMatchObject({ kind: 'item', parentNodeId: 'topic', content,
    reveal: `![local](asset://${key})`, resourceReferences: [{ storage_key: key, original_name: 'Diagram.png', role: 'image' }],
    imageRegions: [{ attachmentId: hash, regions: [{ id: 'region-1', x: 0.2, y: 0.3, width: 0.3, height: 0.2 }] }] });
  expect(getImageClozeLocator(saved?.anchorLink)).toMatchObject({ attachmentId: hash, x: 0.2, width: 0.3 });
  expect((await loadCompanionWorkspaceNode('topic'))?.content).toBe(content);
  expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot?.nodesById['new-item']?.review).toBeTruthy();
  expect(await createCompanionImageCloze(request)).toBe('new-item');
  expect(library!.database.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id='new-item'").pluck().get()).toBe(1);
  const reopened = await reopenSearchLibrary(library!.root, '2026-11-05T00:00:00Z');
  expect(await loadCompanionWorkspaceNode('new-item')).toEqual(saved);
  expect(reopened.db.prepare("SELECT sync_dirty FROM sync_object_state WHERE object_type='node' AND object_id='new-item'").pluck().get()).toBe(1);
});

it('rolls back a failed create including its history, then retries the same request successfully', async () => {
  const request = await prepare();
  library!.database.exec("CREATE TRIGGER fail_item BEFORE INSERT ON nodes WHEN NEW.id='new-item' BEGIN SELECT RAISE(ABORT,'disk failed'); END");
  await expect(createCompanionImageCloze(request)).rejects.toThrow('disk failed');
  expect(await loadCompanionWorkspaceNode('new-item')).toBeNull();
  library!.database.exec('DROP TRIGGER fail_item');
  expect(await createCompanionImageCloze(request)).toBe('new-item');
  expect(await applyCompanionEditHistory('topic', 'undo')).toBeTruthy();
  expect((await loadCompanionWorkspaceNode('new-item'))?.deletedAt).toBeTruthy();
  expect(await applyCompanionEditHistory('topic', 'redo')).toBeTruthy();
  expect((await loadCompanionWorkspaceNode('new-item'))?.deletedAt).toBeFalsy();
});

it.each(['item', 'changed', 'missing', 'library', 'remote'] as const)('rejects a %s target without creating an Item', async condition => {
  const request = await prepare(condition === 'item' ? 'item' : 'topic');
  if (condition === 'changed') request.expectedVersionId = 'stale';
  if (condition === 'missing') native.resolve.mockResolvedValue({ status: 'missing' });
  if (condition === 'library') invalidateCompanionReadingScope();
  if (condition === 'remote') request.expectedContent = content.replace(`asset://${key}`, 'https://example.com/image.png');
  await expect(createCompanionImageCloze(request)).rejects.toThrow();
  expect(await loadCompanionWorkspaceNode('new-item')).toBeNull();
  expect((await loadCompanionWorkspaceNode('topic'))?.content).toBe(content);
});

it('groups multiple masks in one Item and keeps it unchanged when a second Item is created in the same library', async () => {
  const request = await prepare();
  request.regions.push({ ...request.regions[0]!, id: 'region-2', x: 0.6 });
  await createCompanionImageCloze(request);
  const first = await loadCompanionWorkspaceNode('new-item');
  expect(first?.imageRegions?.[0]?.regions).toHaveLength(2);
  const second = { ...request, nodeId: 'second-item', regions: [{ ...request.regions[0]!, id: 'region-3', y: 0.6 }] };
  await createCompanionImageCloze(second);
  expect(await loadCompanionWorkspaceNode('new-item')).toEqual(first);
  expect(library!.database.prepare("SELECT count(*) FROM nodes WHERE kind='item'").pluck().get()).toBe(2);
  await reopenSearchLibrary(library!.root, '2026-11-05T12:00:00Z');
  expect(await loadCompanionWorkspaceNode('new-item')).toEqual(first);
  expect((await loadCompanionWorkspaceNode('second-item'))?.imageRegions?.[0]?.regions[0]?.id).toBe('region-3');
});

it('deletes the selected linked Item and its grouped masks durably, supports retry, undo and redo, and preserves another Item', async () => {
  const request = await prepare();
  request.regions.push({ ...request.regions[0]!, id: 'region-two', x: 0.6 });
  await createCompanionImageCloze(request);
  await createCompanionImageCloze({ ...request, nodeId: 'other', regions: [{ ...request.regions[0]!, id: 'other-region' }] });
  const childVersion = await toWorkspaceNativeNodeVersion(editableNode({ id: 'descendant', parentNodeId: 'new-item', content: 'Keep this child', anchorLink: null }), 'source');
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, [childVersion], { enqueueSearchInvalidations: false }));
  const other = await loadCompanionWorkspaceNode('other');
  const schedules = library!.database.prepare('SELECT * FROM node_review ORDER BY node_id').all();
  expect(schedules.length).toBeGreaterThanOrEqual(2);
  const remove = { ...request, attachmentId: hash, regionId: 'region-two' };
  await deleteCompanionImageCloze(remove);
  expect((await loadCompanionWorkspaceNode('descendant'))?.deletedAt).toBeTruthy();
  expect((await loadCompanionWorkspaceNode('new-item'))?.deletedAt).toBeTruthy();
  expect(await loadCompanionWorkspaceNode('other')).toEqual({ ...other, updatedAt: expect.any(String) });
  expect((await loadCompanionWorkspaceNode('topic'))?.content).toBe(content);
  await deleteCompanionImageCloze(remove);
  await applyCompanionEditHistory('topic', 'undo');
  expect((await loadCompanionWorkspaceNode('new-item'))?.deletedAt).toBeFalsy();
  expect((await loadCompanionWorkspaceNode('descendant'))?.deletedAt).toBeFalsy();
  await applyCompanionEditHistory('topic', 'redo');
  expect((await loadCompanionWorkspaceNode('descendant'))?.deletedAt).toBeTruthy();
  expect((await loadCompanionWorkspaceNode('new-item'))?.deletedAt).toBeTruthy();
  await applyCompanionEditHistory('topic', 'undo');
  const foreign = await toWorkspaceNativeNodeVersion(editableNode({ id: 'foreign-child', parentNodeId: 'new-item', content: 'Added after undo', anchorLink: null }), 'source');
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, [foreign], { enqueueSearchInvalidations: false }));
  await expect(applyCompanionEditHistory('topic', 'redo')).rejects.toThrow('has_children');
  expect((await loadCompanionWorkspaceNode('new-item'))?.deletedAt).toBeFalsy();
  await deleteCompanionImageCloze({ ...remove, expectedVersionId: (await loadCompanionWorkspaceNode('topic'))!.currentVersionId ?? null });
  const afterDelete = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  expect((await loadPreparedCompanionArticle(afterDelete, 'topic', () => true))?.content).toBe(content);
  const reopened = await reopenSearchLibrary(library!.root, '2026-11-05T12:00:00Z');
  expect((await loadCompanionWorkspaceNode('new-item'))?.deletedAt).toBeTruthy();
  const reopenedSnapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  expect((await loadPreparedCompanionArticle(reopenedSnapshot, 'topic', () => true))?.content).toBe(content);
  expect(await loadCompanionWorkspaceNode('other')).toEqual({ ...other, updatedAt: expect.any(String) });
  expect(reopened.db.prepare('SELECT * FROM node_review ORDER BY node_id').all()).toEqual(schedules);
});

it('rolls back a failed deletion, retains history and Item, then retries; rejects a changed parent and library', async () => {
  const request = await prepare();
  await createCompanionImageCloze(request);
  const remove = { ...request, attachmentId: hash, regionId: 'region-1' };
  library!.database.exec("CREATE TRIGGER fail_delete BEFORE UPDATE ON nodes WHEN NEW.id='new-item' AND NEW.deleted_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'disk failed'); END");
  await expect(deleteCompanionImageCloze(remove)).rejects.toThrow('disk failed');
  expect((await loadCompanionWorkspaceNode('new-item'))?.deletedAt).toBeFalsy();
  library!.database.exec('DROP TRIGGER fail_delete');
  await expect(deleteCompanionImageCloze({ ...remove, expectedVersionId: 'stale' })).rejects.toThrow('source_changed');
  await deleteCompanionImageCloze(remove);
  invalidateCompanionReadingScope();
  await expect(async () => deleteCompanionImageCloze(remove)).rejects.toThrow('library_changed');
});

it('edits an existing grouped mask on the original Item and parent, retaining review facts after reopen', async () => {
  const request = await prepare();
  request.regions.push({ ...request.regions[0]!, id: 'region-two', x: 0.6 });
  await createCompanionImageCloze(request);
  const original = (await loadCompanionWorkspaceNode(request.nodeId))!;
  const parent = (await loadCompanionWorkspaceNode('topic'))!;
  const version = await toWorkspaceNativeNodeVersion({ ...parent, imageRegions: original.imageRegions }, 'source', 'parent-regions');
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, [version], { enqueueSearchInvalidations: false }));
  const schedules = library!.database.prepare('SELECT * FROM node_review ORDER BY node_id').all();
  const before = request.regions[0]!;
  const after = { ...before, x: 0.1, y: 0.15, width: 0.4, height: 0.35 };
  const edit = { ...request, expectedVersionId: 'parent-regions', nodeId: 'edit-session', regions: [], edits: [{ before, after }] };
  expect(await saveCompanionImageCloze(edit)).toBeNull();
  const changed = (await loadCompanionWorkspaceNode(request.nodeId))!;
  expect(changed.id).toBe(original.id);
  expect(changed.content).toBe(original.content); expect(changed.reveal).toBe(original.reveal);
  expect(changed.anchorLink?.locator).toMatchObject({ x: 0.1, width: 0.4 });
  expect(changed.imageRegions![0]!.regions).toEqual([expect.objectContaining({ id: before.id, x: 0.1, height: 0.35 }), original.imageRegions![0]!.regions[1]]);
  expect((await loadCompanionWorkspaceNode('topic'))?.imageRegions![0]!.regions[0]).toMatchObject({ id: before.id, x: 0.1, width: 0.4 });
  expect(library!.database.prepare("SELECT count(*) FROM nodes WHERE kind='item'").pluck().get()).toBe(1);
  const count = library!.database.prepare('SELECT count(*) FROM node_sync_versions').pluck().get();
  await saveCompanionImageCloze(edit);
  expect(library!.database.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(count);
  const reopened = await reopenSearchLibrary(library!.root, '2026-11-05T12:00:00Z');
  expect((await loadCompanionWorkspaceNode(request.nodeId))?.imageRegions).toEqual(changed.imageRegions);
  expect(reopened.db.prepare('SELECT * FROM node_review ORDER BY node_id').all()).toEqual(schedules);
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  expect((await loadPreparedCompanionArticle(snapshot, 'topic', () => true))?.content).toBe(content);
});

it('rolls back geometry edits when creating a new mask in the same confirmation fails, then retries atomically', async () => {
  const request = await prepare();
  await createCompanionImageCloze(request);
  const original = (await loadCompanionWorkspaceNode(request.nodeId))!;
  const before = request.regions[0]!;
  const save = { ...request, nodeId: 'combined-save', regions: [{ ...before, id: 'new-region', x: 0.6 }], edits: [{ before, after: { ...before, x: 0.1 } }] };
  library!.database.exec("CREATE TRIGGER fail_combined BEFORE INSERT ON nodes WHEN NEW.id='combined-save' BEGIN SELECT RAISE(ABORT,'disk failed'); END");
  await expect(saveCompanionImageCloze(save)).rejects.toThrow('disk failed');
  expect((await loadCompanionWorkspaceNode(request.nodeId))?.imageRegions).toEqual(original.imageRegions);
  expect(await loadCompanionWorkspaceNode('combined-save')).toBeNull();
  library!.database.exec('DROP TRIGGER fail_combined');
  await saveCompanionImageCloze(save);
  expect((await loadCompanionWorkspaceNode(request.nodeId))?.imageRegions![0]!.regions[0]?.x).toBe(0.1);
  expect(await loadCompanionWorkspaceNode('combined-save')).toBeTruthy();
});

it('refuses stale existing-mask edits and invalid geometry without overwriting the current Item', async () => {
  const request = await prepare();
  await createCompanionImageCloze(request);
  const before = request.regions[0]!;
  const edit = { ...request, regions: [], edits: [{ before, after: { ...before, x: 0.1 } }] };
  await saveCompanionImageCloze(edit);
  await expect(saveCompanionImageCloze({ ...edit, edits: [{ before, after: { ...before, x: 0.5 } }] })).rejects.toThrow('region_changed');
  await expect(saveCompanionImageCloze({ ...edit, edits: [{ before, after: { ...before, width: 2 } }] })).rejects.toThrow('invalid_source');
  expect((await loadCompanionWorkspaceNode(request.nodeId))?.imageRegions![0]!.regions[0]!.x).toBe(0.1);
});

it('changes a secondary grouped mask without moving the primary answer anchor or its sibling mask', async () => {
  const request = await prepare();
  const second = { ...request.regions[0]!, id: 'second', x: 0.6 };
  request.regions.push(second);
  await createCompanionImageCloze(request);
  const original = (await loadCompanionWorkspaceNode(request.nodeId))!;
  await saveCompanionImageCloze({ ...request, regions: [], edits: [{ before: second, after: { ...second, x: 0.5, width: 0.2 } }] });
  const changed = (await loadCompanionWorkspaceNode(request.nodeId))!;
  expect(changed.anchorLink).toEqual(original.anchorLink);
  expect(changed.imageRegions![0]!.regions).toEqual([original.imageRegions![0]!.regions[0], expect.objectContaining({ id: 'second', x: 0.5, width: 0.2 })]);
});
