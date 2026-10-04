// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { buildSyncIdentityPackPage } from '../../../../../lib/core/sync/syncIdentityPackPage.js';

const runtime = vi.hoisted(() => ({
  downloaded: [] as string[], posted: [] as string[], built: [] as string[]
}));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { buildIdentitySourcePack: async (args: {
    page: { page_id: string } }) => {
    runtime.built.push(args.page.page_id);
    return { archive_base64url: 'archive' };
  } }
}));
vi.mock('../../companionDesktopSyncHttp', () => ({
  postDesktopJson: async (_endpoint: string, _path: string, body: { archive_base64url: string }) => {
    expect(body.archive_base64url).toBe('archive');
    const pageId = runtime.built.at(-1)!;
    runtime.posted.push(pageId);
    return { applied: true, pageId };
  }
}));
vi.mock('./pack-apply/companionSyncIdentityDownload', () => ({
  downloadAndApplyCompanionSyncIdentityPage: async (args: { page: { page_id: string } }) => {
    runtime.downloaded.push(args.page.page_id);
    return { applied: true };
  }
}));
vi.mock('./syncGroupIdentityCandidateStore', () => ({
  readCompanionIdentityCandidatePage: async (args: {
    direction: 'source' | 'receiver'; pageIndex: number; previousPageId: string | null;
    groupId: string; sourcePeerId: string; targetPeerId: string; sourceViewId: string;
  }) => {
    const objects = args.pageIndex === 0 ? [{ object_type: 'node',
      object_id: args.direction, fingerprint: 'a'.repeat(64) }] : [];
    return { page: buildSyncIdentityPackPage({ group_id: args.groupId,
      source_peer_id: args.sourcePeerId, target_peer_id: args.targetPeerId,
      source_view_id: args.sourceViewId, page_index: args.pageIndex,
      previous_page_id: args.previousPageId, objects }), nextAfter: null };
  }
}));

import { exchangeCompanionSyncIdentityCandidates } from './syncGroupIdentityExchange.js';

it('downloads remote facts and uploads local facts with each fixed source identity', async () => {
  runtime.downloaded = [];
  runtime.posted = [];
  runtime.built = [];
  const result = await exchangeCompanionSyncIdentityCandidates({ endpointUrl: 'http://peer',
    groupId: 'group', hostName: 'local', localPeerId: 'local',
    localViewId: '11111111-1111-1111-1111-111111111111', peerHostName: 'remote',
    peerId: 'remote', remoteViewId: '22222222-2222-2222-2222-222222222222',
    snapshotPath: '/tmp/cache/foliole-provider-source-test.db' });
  expect(result).toEqual({ received: { appliedPages: 1, appliedObjects: 1, pageCount: 1 },
    sent: { appliedPages: 1, appliedObjects: 1, pageCount: 1 } });
  expect(runtime.downloaded).toHaveLength(1);
  expect(runtime.posted).toHaveLength(1);
  expect(runtime.downloaded[0]).not.toBe(runtime.posted[0]);
});
