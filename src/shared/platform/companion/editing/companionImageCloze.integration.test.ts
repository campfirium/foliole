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
import { getCompanionReadingScope, invalidateCompanionReadingScope } from '../reading/companionReadingScope';
import { createSearchLibrary, reopenSearchLibrary } from '../runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../runtime/companionWorkspaceNodeStore';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { editableNode } from './companionContentEditingStable.testSupport';
import { applyCompanionEditHistory } from './companionEditHistoryReplay';
import { createCompanionImageCloze, type CompanionImageClozeRequest } from './companionImageCloze';

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
