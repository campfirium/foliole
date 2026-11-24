// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false, convertFileSrc: (url: string) => url }, registerPlugin: () => ({
    ...createCompanionNativeSyncStub(), resolveAttachmentResource: native.resolve
  }) };
});

import { closeLibraries } from '../../../../../electron/database/syncLibrary.testSupport';
import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { loadCurrentSyncNodeRecord } from '../../../../../lib/core/sync/syncNodeGraph';
import { collectImageMatches } from '../../../../features/editor/model/markdownImageMatches';
import { getImageClozeLocator } from '../../../../features/image-cloze/model/imageCloze';
import { connectCompanionPeer } from '../../../../test/companionDailySync.testSupport';
import { getCompanionReadingScope, invalidateCompanionReadingScope } from '../reading/companionReadingScope';
import { createSearchLibrary, reopenSearchLibrary } from '../runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../runtime/companionWorkspaceNodeStore';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { editableNode } from './companionContentEditingStable.testSupport';
import { applyCompanionEditHistory } from './companionEditHistoryReplay';
import { createCompanionImageCloze } from './companionImageCloze';
import { saveCompanionImageRect, type CompanionImageRectRequest } from './companionImageRect';

const hash = 'a'.repeat(64);
const key = `${hash}.png`;
const content = `Before\n\n![Diagram|320](asset://${key})\n\nAfter`;
const focus = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
const crop = { x: 0.05, y: 0.1, width: 0.8, height: 0.7 };
let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; await closeLibraries(); vi.clearAllMocks(); });

async function prepare() {
  library = await createSearchLibrary(0);
  const node = editableNode({ content, resourceReferences: [{ storage_key: key, original_name: 'Diagram.png', role: 'image' }] });
  const version = await toWorkspaceNativeNodeVersion(node, 'source', 'topic-v1');
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, [version], { enqueueSearchInvalidations: false }), { kind: 'business' });
  native.resolve.mockResolvedValue({ status: 'ready', resource_url: 'data:image/png;base64,png' });
}

async function request(kind: CompanionImageRectRequest['kind'], rect: CompanionImageRectRequest['rect']): Promise<CompanionImageRectRequest> {
  const topic = (await loadCompanionWorkspaceNode('topic'))!;
  const image = collectImageMatches(0, topic.content)[0]!;
  return { nodeId: 'topic', expectedContent: topic.content, expectedVersionId: topic.currentVersionId ?? null,
    imageRange: { from: image.from, to: image.to }, kind, rect, scope: getCompanionReadingScope() };
}

it('sets, keeps and clears focus and crop on one image occurrence, undoably, and the desktop reads the same label', async () => {
  await prepare();
  const image = collectImageMatches(0, content)[0]!;
  await createCompanionImageCloze({ nodeId: 'cloze', parentNodeId: 'topic', expectedContent: content, expectedVersionId: 'topic-v1',
    imageRange: { from: image.from, to: image.to }, scope: getCompanionReadingScope(),
    regions: [{ attachmentId: hash, id: 'region-1', answer: '', x: 0.2, y: 0.3, width: 0.3, height: 0.2 }] });
  const peers = await connectCompanionPeer(library!);
  await peers.exchange();

  await saveCompanionImageRect(await request('focus', focus));
  await saveCompanionImageRect(await request('crop', crop));
  const labelled = `Before\n\n![Diagram|320;focus=1000,2000,6000,6000;crop=500,1000,8500,8000](asset://${key})\n\nAfter`;
  const topic = (await loadCompanionWorkspaceNode('topic'))!;
  expect(topic.content).toBe(labelled);
  expect(topic.resourceReferences).toEqual([{ storage_key: key, original_name: 'Diagram.png', role: 'image' }]);
  expect(collectImageMatches(0, labelled)[0]).toMatchObject({ attachmentId: hash, displayWidth: 320, focus, crop });
  const cloze = (await loadCompanionWorkspaceNode('cloze'))!;
  expect(cloze.deletedAt).toBeFalsy();
  expect(getImageClozeLocator(cloze.anchorLink)).toMatchObject({ attachmentId: hash, x: 0.2, y: 0.3 });

  await peers.exchange();
  expect((await loadCurrentSyncNodeRecord(peers.desktop.port, 'topic'))?.body_text).toBe(labelled);

  // Retrying the same request after it was written does nothing; a stale opening is refused.
  const versions = library!.database.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id='topic'").pluck().get();
  await saveCompanionImageRect({ ...(await request('crop', crop)) });
  expect(library!.database.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id='topic'").pluck().get()).toBe(versions);
  await expect(saveCompanionImageRect({ ...(await request('focus', null)), expectedVersionId: 'topic-v1' })).rejects.toThrow('image_rect_source_changed');

  await applyCompanionEditHistory('topic', 'undo');
  expect((await loadCompanionWorkspaceNode('topic'))?.content).toBe(labelled.replace(';crop=500,1000,8500,8000', ''));
  await applyCompanionEditHistory('topic', 'redo');
  expect((await loadCompanionWorkspaceNode('topic'))?.content).toBe(labelled);

  await saveCompanionImageRect(await request('focus', null));
  await saveCompanionImageRect(await request('crop', null));
  expect((await loadCompanionWorkspaceNode('topic'))?.content).toBe(content);
  await peers.exchange();
  expect((await loadCurrentSyncNodeRecord(peers.desktop.port, 'topic'))?.body_text).toBe(content);
  await reopenSearchLibrary(library!.root, '2026-11-25T00:00:00Z');
  expect((await loadCompanionWorkspaceNode('topic'))?.content).toBe(content);
});

it('opens a desktop focus on mobile and clears it, and rejects remote images, invalid rectangles and a changed library', async () => {
  await prepare();
  const peers = await connectCompanionPeer(library!);
  await peers.exchange();
  const desktopContent = content.replace('|320]', '|320;focus=1000,2000,6000,6000]');
  // A version written by the desktop editor arrives with the focus in the image label.
  const current = (await loadCompanionWorkspaceNode('topic'))!;
  const arriving = await toWorkspaceNativeNodeVersion({ ...current, content: desktopContent, updatedAt: '2026-11-24T10:00:00.000Z' }, peers.desktop.name, 'desktop-focus');
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, [arriving], { enqueueSearchInvalidations: false }), { kind: 'business' });
  const opened = await request('focus', null);
  expect(collectImageMatches(0, opened.expectedContent)[0]?.focus).toEqual(focus);
  await saveCompanionImageRect(opened);
  await peers.exchange();
  expect((await loadCurrentSyncNodeRecord(peers.desktop.port, 'topic'))?.body_text).toBe(content);

  const before = (await loadCompanionWorkspaceNode('topic'))!.content;
  const remote = await request('focus', focus);
  remote.expectedContent = before.replace(`asset://${key}`, 'https://example.com/image.png');
  await expect(saveCompanionImageRect(remote)).rejects.toThrow('image_rect_invalid_source');
  await expect(saveCompanionImageRect(await request('crop', { x: 0.5, y: 0.5, width: 0, height: 0.2 }))).rejects.toThrow('image_rect_invalid_rect');
  const stale = await request('crop', crop);
  invalidateCompanionReadingScope();
  await expect(saveCompanionImageRect(stale)).rejects.toThrow('image_rect_library_changed');
  expect((await loadCompanionWorkspaceNode('topic'))?.content).toBe(before);
});
