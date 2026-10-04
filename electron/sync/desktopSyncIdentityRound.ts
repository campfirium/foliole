import os from 'node:os';

import { completeSyncIdentityExchange } from '../../lib/core/sync/syncIdentityExchangeCompletion.js';
import { recordSyncIdentityPeerBaseline } from '../../lib/core/sync/syncIdentityPeerBaseline.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { drainDesktopSyncIdentityResources } from './desktopSyncGroupResourceArticleDrain.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { readDesktopSyncIdentityCandidatePage } from './desktopSyncIdentityCandidatePages.js';
import { exchangeDesktopSyncIdentityFactPages } from './desktopSyncIdentityFactExchange.js';
import { downloadAndApplyDesktopSyncIdentityPage,
  type DesktopIdentityPackPeer } from './desktopSyncIdentityPack.js';
import { probeDesktopSyncIdentities } from './desktopSyncIdentityProbe.js';
import { uploadDesktopSyncIdentityPage } from './desktopSyncIdentityPush.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export interface DesktopIdentityCandidateRound {
  candidatePath: string;
  localViewId?: string;
  localViewPath?: string;
  sourceViewId: string;
}

/** Complete one bilateral identity/fact exchange, then check current resource bytes. */
export async function runDesktopSyncIdentityRound(peer: DesktopSyncGroupPeer) {
  const local = await runWithDatabaseConnectionOwner(async () => {
    const key = loadDesktopWorkgroupKey(peer.group_id);
    if (!key) throw new Error('sync_group_workgroup_key_missing');
    const database = openDatabaseConnection().sqlite;
    return { database, secret: key.group_key };
  });
  const probeArgs = {
    endpointUrl: peer.endpoint_url, groupId: peer.group_id,
    localDatabase: local.database, localDeviceId: peer.local_device_id,
    outputRoot: os.tmpdir(), secret: local.secret
  };
  const candidate = await probeDesktopSyncIdentities(probeArgs);
  let outbound: Awaited<ReturnType<typeof probeDesktopSyncIdentities>> | undefined;
  let verification: Awaited<ReturnType<typeof probeDesktopSyncIdentities>> | undefined;
  try {
    const firstReceived = await receiveDesktopSyncIdentityCandidatePages({ candidate, peer });
    const receivedPages = firstReceived.appliedPages;
    outbound = receivedPages > 0 ? await probeDesktopSyncIdentities(probeArgs) : candidate;
    const sent = await sendDesktopSyncIdentityCandidatePages({ candidate: outbound, peer });
    await drainDesktopSyncIdentityResources(peer);
    if (sent.appliedPages > 0) verification = await probeDesktopSyncIdentities(probeArgs);
    const completion = await completeDesktopIdentityRound({
      initial: verification ?? outbound, initialCount: verification?.count ?? 0,
      probeArgs, peer, received: firstReceived, sent });
    const checked = completion.checked;
    if (checked !== (verification ?? outbound)) {
      await verification?.cleanup();
      verification = checked;
      await drainDesktopSyncIdentityResources(peer);
    }
    await runWithDatabaseConnectionOwner(() =>
      recordSyncIdentityPeerBaseline(createBetterSqliteDbPort(openDatabaseConnection().sqlite), {
        groupId: peer.group_id, localDeviceId: peer.local_device_id,
        peerDeviceId: peer.peer_device_id, localEpoch: checked.localEpoch,
        peerEpoch: checked.sourceEpoch, localWatermark: checked.localWatermark,
        peerWatermark: checked.sourceWatermark, localViewId: checked.localViewId,
        peerViewId: checked.sourceViewId,
        localProofRoot: checked.localProofRoot, peerProofRoot: checked.peerProofRoot
      }));
    return { received: firstReceived, sent,
      candidateCount: candidate.count + (outbound !== candidate ? outbound.count : 0) +
        completion.candidateCount,
      timeCandidateCount: 0, usedTimeCandidates: false,
      verifiedCandidateCount: checked.count };
  } finally {
    await verification?.cleanup();
    if (outbound !== candidate) await outbound?.cleanup();
    await candidate.cleanup();
  }
}

async function completeDesktopIdentityRound(args: {
  initial: Awaited<ReturnType<typeof probeDesktopSyncIdentities>>;
  initialCount: number;
  probeArgs: Parameters<typeof probeDesktopSyncIdentities>[0];
  peer: DesktopSyncGroupPeer;
  received: { appliedPages: number; pageCount: number };
  sent: { appliedPages: number; pageCount: number };
}) {
  let candidateCount = args.initialCount;
  const checked = await completeSyncIdentityExchange({ initial: args.initial,
    probe: async () => {
      const candidate = await probeDesktopSyncIdentities(args.probeArgs);
      candidateCount += candidate.count;
      return candidate;
    },
    receive: async (candidate) => {
      const result = await receiveDesktopSyncIdentityCandidatePages({ candidate, peer: args.peer });
      args.received.appliedPages += result.appliedPages;
      args.received.pageCount += result.pageCount;
      return result.appliedPages;
    },
    send: async (candidate) => {
      const result = await sendDesktopSyncIdentityCandidatePages({ candidate, peer: args.peer });
      args.sent.appliedPages += result.appliedPages;
      args.sent.pageCount += result.pageCount;
      return result.appliedPages;
    } });
  return { checked, candidateCount };
}

/** Consume every source-side candidate from one validated bilateral probe. */
export async function receiveDesktopSyncIdentityCandidatePages(args: {
  candidate: DesktopIdentityCandidateRound;
  peer: DesktopIdentityPackPeer;
  limit?: number;
}) {
  return consumeCandidatePages(args, 'source');
}

export async function exchangeDesktopSyncIdentityCandidatePages(args: {
  candidate: DesktopIdentityCandidateRound & { localViewId: string; localViewPath: string };
  peer: DesktopIdentityPackPeer;
  limit?: number;
}) {
  const received = await consumeCandidatePages(args, 'source');
  const sent = await consumeCandidatePages(args, 'receiver');
  return { received, sent };
}

export async function sendDesktopSyncIdentityCandidatePages(args: {
  candidate: DesktopIdentityCandidateRound & { localViewId: string; localViewPath: string };
  peer: DesktopIdentityPackPeer;
  limit?: number;
}) {
  return consumeCandidatePages(args, 'receiver');
}

async function consumeCandidatePages(args: {
  candidate: DesktopIdentityCandidateRound;
  peer: DesktopIdentityPackPeer;
  limit?: number;
}, direction: 'source' | 'receiver') {
  if (direction === 'receiver' && (!args.candidate.localViewId ||
      !args.candidate.localViewPath)) throw new Error('sync_identity_local_view_missing');
  let after: { object_type: string; object_id: string } | null = null;
  let previousPageId: string | null = null;
  let pageIndex = 0;
  let appliedPages = 0;
  let limit = args.limit ?? 128;
  for (;;) {
    const next = readDesktopSyncIdentityCandidatePage({
      candidatePath: args.candidate.candidatePath, groupId: args.peer.group_id,
      sourcePeerId: direction === 'source' ? args.peer.peer_device_id : args.peer.local_device_id,
      targetPeerId: direction === 'source' ? args.peer.local_device_id : args.peer.peer_device_id,
      sourceViewId: direction === 'source' ? args.candidate.sourceViewId : args.candidate.localViewId!,
      pageIndex, previousPageId, after, direction, limit
    });
    if (next.page.objects.length === 0) break;
    let completedPage = next.page;
    let consumedPages = 1;
    try {
      const result = direction === 'source'
        ? await downloadAndApplyDesktopSyncIdentityPage({ peer: args.peer, page: next.page })
        : await uploadDesktopSyncIdentityPage({ peer: args.peer, page: next.page,
          localViewPath: args.candidate.localViewPath! });
      if (result.applied) appliedPages += 1;
    } catch (error) {
      if (limit > 1 && error instanceof Error &&
          error.message.includes('sync_identity_pack_page_over_budget')) {
        limit = Math.max(1, Math.floor(limit / 2));
        continue;
      }
      if (!(error instanceof Error) || !error.message.includes('sync_identity_pack_page_over_budget') ||
          next.page.objects.length !== 1 || next.page.objects[0]?.object_type !== 'node') throw error;
      const facts = await exchangeDesktopSyncIdentityFactPages({ page: next.page, peer: args.peer,
        ...(args.candidate.localViewPath ? { localViewPath: args.candidate.localViewPath } : {}) }, direction);
      completedPage = facts.page;
      consumedPages = facts.pageCount;
      appliedPages += facts.appliedPages;
    }
    after = { object_type: next.page.objects.at(-1)!.object_type,
      object_id: next.page.objects.at(-1)!.object_id };
    previousPageId = completedPage.page_id;
    pageIndex += consumedPages;
    if (!next.nextAfter) break;
  }
  return { appliedPages, pageCount: pageIndex };
}
