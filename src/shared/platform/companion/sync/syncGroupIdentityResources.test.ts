// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { createEmptyResourceStages } from '../../companionDesktopSyncResourceStages';

const runtime = vi.hoisted(() => ({
  scans: [] as string[], scanPages: ['node-a', null] as Array<string | null>,
  pulls: [] as Array<{ syncedContentBlobHashes: string[]; syncedAttachmentIds: string[];
    remainingAttachmentResourceCount: number; attachmentResourceError: string | null;
    contentBlobError: string | null }>, missing: [] as boolean[]
}));
vi.mock('../../../../../lib/core/sync/syncPackResourceArticles.js', () => ({
  enqueueSyncIdentityResourceScanPage: async (_port: unknown, args: { afterId: string }) => {
    runtime.scans.push(args.afterId);
    return runtime.scanPages.shift();
  }
}));
vi.mock('../../companionContentBlobSync', () => ({
  loadCompanionMissingContentBlobBatch: async () => ({
    blobs: runtime.missing.shift() ? [{ hash: 'missing' }] : [] })
}));
vi.mock('../../companionDesktopSyncResourceStages', async original => ({
  ...await original<typeof import('../../companionDesktopSyncResourceStages')>(),
  pullResourceStages: async () => runtime.pulls.shift()
}));
vi.mock('../../companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: (task: () => Promise<unknown>) => task()
}));
vi.mock('./syncGroupIdentityBlobIntegrity', () => ({
  verifyCompanionSyncIdentityBlobBytes: async () => {}
}));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    runWriter: (task: (port: unknown) => Promise<unknown>) => task({})
  })
}));

import { drainCompanionSyncIdentityResources } from './syncGroupIdentityResources.js';

const args = { endpointUrl: 'http://peer', groupId: 'group', peerId: 'peer' };
function result(hashes: string[], attachmentIds: string[] = []) {
  return { ...createEmptyResourceStages(),
    syncedContentBlobBytes: hashes.length * 1024,
    syncedAttachmentResourceBytes: attachmentIds.length * 2048,
    syncedContentBlobHashes: hashes, syncedAttachmentIds: attachmentIds,
    remainingAttachmentResourceCount: 0, attachmentResourceError: null,
    contentBlobError: null };
}

it('scans unchanged articles and drains multiple bounded content passes', async () => {
  runtime.scans = [];
  runtime.scanPages = ['node-a', null];
  runtime.pulls = [result(['first'], ['attachment']), result(['second'])];
  runtime.missing = [true, false];
  await expect(drainCompanionSyncIdentityResources(args)).resolves.toMatchObject({
    syncedCount: 3, stages: { syncedContentBlobHashes: ['first', 'second'],
      syncedAttachmentIds: ['attachment'], syncedContentBlobBytes: 2048,
      syncedAttachmentResourceBytes: 2048 }
  });
  expect(runtime.scans).toEqual(['', 'node-a']);
});

it('does not treat an unresolved resource pass as complete', async () => {
  runtime.scans = [];
  runtime.scanPages = [null];
  runtime.pulls = [result([])];
  runtime.missing = [true];
  await expect(drainCompanionSyncIdentityResources(args))
    .rejects.toThrow('sync_group_resources_incomplete');
});
