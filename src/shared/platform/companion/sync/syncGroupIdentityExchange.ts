import { parseSyncIdentityPackPage,
  type SyncIdentityPackPage } from '../../../../../lib/core/sync/syncIdentityPackPage.js';
import { postDesktopJson } from '../../companionDesktopSyncHttp';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

import { downloadAndApplyCompanionSyncIdentityPage } from './pack-apply/companionSyncIdentityDownload';
import { readCompanionIdentityCandidatePage } from './syncGroupIdentityCandidateStore';
import { exchangeCompanionSyncIdentityFactPages } from './syncGroupIdentityFactExchange';

interface ExchangeArgs {
  endpointUrl: string;
  groupId: string;
  hostName: string;
  localPeerId: string;
  localViewId: string;
  peerHostName: string;
  peerId: string;
  remoteViewId: string;
  snapshotPath: string;
}

async function sendLocalPage(args: ExchangeArgs, page: SyncIdentityPackPage) {
  const parsed = parseSyncIdentityPackPage(page);
  const native = await FolioleCompanionSync.buildIdentitySourcePack({
    snapshot_path: args.snapshotPath, page: parsed
  });
  const result = await postDesktopJson<{ applied: boolean; pageId: string; factTail?: unknown }>(args.endpointUrl,
    '/companion/sync-identity-push', { archive_base64url: native.archive_base64url });
  if (result.pageId !== parsed.page_id || typeof result.applied !== 'boolean') {
    throw new Error('sync_identity_push_receipt_invalid');
  }
  return result;
}

async function consume(args: ExchangeArgs, direction: 'source' | 'receiver') {
  let after: { object_type: string; object_id: string } | null = null;
  let previousPageId: string | null = null;
  let pageIndex = 0;
  let appliedPages = 0;
  let appliedObjects = 0;
  let limit = 128;
  for (;;) {
    const next = await readCompanionIdentityCandidatePage({ snapshotPath: args.snapshotPath,
      groupId: args.groupId, sourcePeerId: direction === 'source' ? args.peerId : args.localPeerId,
      targetPeerId: direction === 'source' ? args.localPeerId : args.peerId,
      sourceViewId: direction === 'source' ? args.remoteViewId : args.localViewId,
      pageIndex, previousPageId, after, direction, limit });
    if (next.page.objects.length === 0) break;
    let completedPage = next.page;
    let consumedPages = 1;
    const transfer = (page: SyncIdentityPackPage) => direction === 'source'
      ? downloadAndApplyCompanionSyncIdentityPage({ endpointUrl: args.endpointUrl,
        hostName: args.hostName, page, sourceHostName: args.peerHostName })
      : sendLocalPage(args, page);
    try {
      const result = await transfer(next.page);
      if (result.applied) {
        appliedPages += 1;
        appliedObjects += next.page.objects.length;
      }
    } catch (error) {
      if (limit > 1 && error instanceof Error &&
          error.message.includes('sync_identity_pack_page_over_budget')) {
        limit = Math.max(1, Math.floor(limit / 2));
        continue;
      }
      if (!(error instanceof Error) || !error.message.includes('sync_identity_pack_page_over_budget') ||
          next.page.objects.length !== 1 || next.page.objects[0]?.object_type !== 'node') throw error;
      const facts = await exchangeCompanionSyncIdentityFactPages({ ...args, page: next.page,
        transfer }, direction);
      completedPage = facts.page;
      consumedPages = facts.pageCount;
      appliedPages += facts.appliedPages;
      appliedObjects += 1;
    }
    after = { object_type: next.page.objects.at(-1)!.object_type,
      object_id: next.page.objects.at(-1)!.object_id };
    previousPageId = completedPage.page_id;
    pageIndex += consumedPages;
    if (!next.nextAfter) break;
  }
  return { appliedPages, appliedObjects, pageCount: pageIndex };
}

/** Receive first so facts needed by local uploads are already present. */
export async function exchangeCompanionSyncIdentityCandidates(args: ExchangeArgs) {
  const received = await receiveCompanionSyncIdentityCandidates(args);
  const sent = await sendCompanionSyncIdentityCandidates(args);
  return { received, sent };
}

export function receiveCompanionSyncIdentityCandidates(args: ExchangeArgs) {
  return consume(args, 'source');
}

export function sendCompanionSyncIdentityCandidates(args: ExchangeArgs) {
  return consume(args, 'receiver');
}
