// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { buildSyncIdentityPackPage, type SyncIdentityPackPage } from '../../../lib/core/sync/syncIdentityPackPage';

const runtime = vi.hoisted(() => ({ read: vi.fn(), transfer: vi.fn(), build: vi.fn(), post: vi.fn() }));
vi.mock('./companion/sync/syncGroupIdentityCandidateStore', () => ({
  readCompanionIdentityCandidatePage: runtime.read
}));
vi.mock('./companion/sync/pack-apply/companionSyncIdentityDownload', () => ({
  downloadAndApplyCompanionSyncIdentityPage: runtime.transfer
}));
vi.mock('./companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { buildIdentitySourcePack: runtime.build }
}));
vi.mock('./companionDesktopSyncHttp', () => ({ postDesktopJson: runtime.post }));

import { receiveCompanionSyncIdentityCandidates, sendCompanionSyncIdentityCandidates } from './companion/sync/syncGroupIdentityExchange';

const args = { endpointUrl: 'http://peer', groupId: 'group', hostName: 'Phone',
  localPeerId: 'phone', peerId: 'desktop', peerHostName: 'Desktop',
  localViewId: '11111111-1111-1111-1111-111111111111',
  remoteViewId: '22222222-2222-2222-2222-222222222222', snapshotPath: '/fixed-view.db' };
const objects = Array.from({ length: 270 }, (_, index) => ({
  object_type: 'node' as const, object_id: String(index).padStart(4, '0'), fingerprint: 'a'.repeat(64)
}));

type ReadArgs = Parameters<typeof import('./companion/sync/syncGroupIdentityCandidateStore').readCompanionIdentityCandidatePage>[0];
function readPage(input: ReadArgs) {
  const remaining = objects.filter(object => !input.after || object.object_id > input.after.object_id);
  const selected = remaining.slice(0, input.limit);
  return { page: buildSyncIdentityPackPage({ group_id: input.groupId,
    source_peer_id: input.sourcePeerId, target_peer_id: input.targetPeerId,
    source_view_id: input.sourceViewId, page_index: input.pageIndex,
    previous_page_id: input.previousPageId, objects: selected }),
  nextAfter: remaining.length > selected.length ? selected.at(-1) : null };
}

beforeEach(() => {
  vi.resetAllMocks();
  runtime.read.mockImplementation(readPage);
  runtime.transfer.mockResolvedValue({ applied: true });
  runtime.build.mockImplementation(async ({ page }: { page: SyncIdentityPackPage }) => ({ archive_base64url: page.page_id }));
  runtime.post.mockImplementation(async (_endpoint, _path, body: { archive_base64url: string }) => ({ applied: true, pageId: body.archive_base64url }));
});

it('receives all bounded identity pages from one fixed source with a linked page chain', async () => {
  await expect(receiveCompanionSyncIdentityCandidates(args)).resolves.toEqual({
    appliedObjects: 270, appliedPages: 3, pageCount: 3
  });
  const pages = runtime.transfer.mock.calls.map(([request]) => request.page as SyncIdentityPackPage);
  expect(pages.map(page => page.objects.length)).toEqual([128, 128, 14]);
  expect(pages.flatMap(page => page.objects)).toEqual(objects);
  expect(pages.map(page => page.source_view_id)).toEqual(Array(3).fill(args.remoteViewId));
  expect(pages.map(page => page.previous_page_id)).toEqual([null, pages[0]!.page_id, pages[1]!.page_id]);
  expect(runtime.read.mock.calls.every(([request]) => request.snapshotPath === args.snapshotPath)).toBe(true);
});

it('counts duplicate committed pages without claiming they were applied again', async () => {
  runtime.transfer.mockResolvedValue({ applied: false });
  await expect(receiveCompanionSyncIdentityCandidates(args)).resolves.toEqual({
    appliedObjects: 0, appliedPages: 0, pageCount: 3
  });
});

it('reduces an oversized batch without skipping its first identities', async () => {
  runtime.transfer.mockRejectedValueOnce(new Error('sync_identity_pack_page_over_budget'));
  await expect(receiveCompanionSyncIdentityCandidates(args)).resolves.toMatchObject({ appliedObjects: 270 });
  const pages = runtime.transfer.mock.calls.slice(1).map(([request]) => request.page as SyncIdentityPackPage);
  expect(pages.every(page => page.objects.length <= 64)).toBe(true);
  expect(pages.flatMap(page => page.objects)).toEqual(objects);
  expect(pages[0]!.page_index).toBe(0);
  expect(pages[0]!.previous_page_id).toBeNull();
});

it('stops a failed receive without requesting the next page', async () => {
  runtime.transfer.mockRejectedValueOnce(new Error('connection_lost'));
  await expect(receiveCompanionSyncIdentityCandidates(args)).rejects.toThrow('connection_lost');
  expect(runtime.read).toHaveBeenCalledOnce();
});

it('rejects a receipt for another page before advancing the upload', async () => {
  runtime.post.mockResolvedValueOnce({ applied: true, pageId: 'b'.repeat(64) });
  await expect(sendCompanionSyncIdentityCandidates(args)).rejects.toThrow('sync_identity_push_receipt_invalid');
  expect(runtime.read).toHaveBeenCalledOnce();
});
