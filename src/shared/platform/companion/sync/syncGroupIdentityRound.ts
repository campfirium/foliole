import { completeSyncIdentityExchange } from '../../../../../lib/core/sync/syncIdentityExchangeCompletion.js';
import { recordSyncIdentityPeerBaseline } from '../../../../../lib/core/sync/syncIdentityPeerBaseline.js';
import { createEmptyResourceStages } from '../../companionDesktopSyncResourceStages';
import type { CompanionDesktopSyncOptions } from '../../companionDesktopSyncTypes';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { resolveCompanionSyncPeerHostName,
  resolveCompanionSyncPeerId } from '../network/syncGroupPeerIdentity';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { sendCompanionFramedSyncInventoryDifferences } from './framed/companionFramedSyncInventoryRound';
import { receiveCompanionSyncIdentityCandidates,
  sendCompanionSyncIdentityCandidates } from './syncGroupIdentityExchange';
import { probeCompanionSyncIdentities } from './syncGroupIdentityProbe';
import { drainCompanionSyncIdentityResources } from './syncGroupIdentityResources';
import { loadCompanionSyncGroup } from './syncGroupStore';

async function recordCompletedBaseline(pair: {
  groupId: string; localDeviceId: string; peerDeviceId: string;
}, checked: Awaited<ReturnType<typeof probeCompanionSyncIdentities>>) {
  await runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((port) =>
    recordSyncIdentityPeerBaseline(port, { ...pair,
      localEpoch: checked.localEpoch, peerEpoch: checked.sourceEpoch,
      localWatermark: checked.localWatermark, peerWatermark: checked.sourceWatermark,
      localViewId: checked.localViewId, peerViewId: checked.sourceViewId,
      localProofRoot: checked.localProofRoot, peerProofRoot: checked.peerProofRoot })));
}

async function refreshAfterFramedTransfer(args: {
  candidate: Awaited<ReturnType<typeof probeCompanionSyncIdentities>>;
  endpointUrl: string;
  groupId: string;
  outbound: Awaited<ReturnType<typeof probeCompanionSyncIdentities>>;
  peerId: string;
}) {
  const framed = await sendCompanionFramedSyncInventoryDifferences({
    endpoint_url: args.endpointUrl, receiver_device_id: args.peerId,
    receiver_library_epoch: args.outbound.sourceEpoch, sync_group_id: args.groupId
  });
  if (framed.sent.length === 0) return { addedCandidateCount: 0, framed, outbound: args.outbound };
  const refreshed = await probeCompanionSyncIdentities(args.endpointUrl);
  if (args.outbound !== args.candidate) await args.outbound.cleanup();
  return { addedCandidateCount: refreshed.count, framed, outbound: refreshed };
}

/** A bilateral v21 exchange is complete only after a fresh fixed-view probe is empty. */
export async function runCompanionSyncIdentityRound(endpointUrl: string, hostName: string,
  options: { includeResources?: boolean;
    onProgress?: CompanionDesktopSyncOptions['onProgress'];
    onStructureSynced?: (appliedObjects: number) => Promise<void> | void } = {}) {
  const group = await loadCompanionSyncGroup();
  if (!group) throw new Error('sync_group_not_joined');
  const peerId = await resolveCompanionSyncPeerId(endpointUrl);
  const peerHostName = await resolveCompanionSyncPeerHostName(endpointUrl);
  const pair = { groupId: group.group_id,
    localDeviceId: group.local_device_identity_key, peerDeviceId: peerId };
  const candidate = await probeCompanionSyncIdentities(endpointUrl);
  let candidateCount = candidate.count;
  let outbound: Awaited<ReturnType<typeof probeCompanionSyncIdentities>> | undefined;
  let verification: Awaited<ReturnType<typeof probeCompanionSyncIdentities>> | undefined;
  try {
    const identity = { endpointUrl,
      groupId: group.group_id, hostName, localPeerId: group.local_device_identity_key,
      peerHostName, peerId };
    const firstReceived = await receiveCompanionSyncIdentityCandidates({ ...identity,
      localViewId: candidate.localViewId, remoteViewId: candidate.sourceViewId,
      snapshotPath: candidate.snapshotPath });
    const receivedPages = firstReceived.appliedPages;
    outbound = receivedPages > 0 ? await probeCompanionSyncIdentities(endpointUrl) : candidate;
    if (outbound !== candidate) candidateCount += outbound.count;
    const refreshed = await refreshAfterFramedTransfer({ candidate, endpointUrl,
      groupId: group.group_id, outbound, peerId });
    outbound = refreshed.outbound;
    candidateCount += refreshed.addedCandidateCount;
    const sent = await sendCompanionSyncIdentityCandidates({ ...identity,
      localViewId: outbound.localViewId, remoteViewId: outbound.sourceViewId,
      snapshotPath: outbound.snapshotPath });
    if (sent.appliedPages > 0) verification = await probeCompanionSyncIdentities(endpointUrl);
    const completion = await completeCompanionIdentityRound({ initial: verification ?? outbound,
      initialCount: verification?.count ?? 0, endpointUrl, identity, received: firstReceived, sent });
    const checked = completion.checked;
    if (checked !== (verification ?? outbound)) {
      await verification?.cleanup();
      verification = checked;
    }
    await options.onStructureSynced?.(firstReceived.appliedObjects);
    const resources = options.includeResources === false
      ? { syncedCount: 0, stages: createEmptyResourceStages() } :
      await drainCompanionSyncIdentityResources({ endpointUrl,
        groupId: group.group_id, peerId, onProgress: options.onProgress });
    if (options.includeResources !== false) {
      await recordCompletedBaseline(pair, checked);
    }
    return { framed: refreshed.framed, received: firstReceived, sent,
      resources,
      candidateCount: candidateCount + completion.candidateCount,
      timeCandidateCount: 0, usedTimeCandidates: false,
      verifiedCandidateCount: checked.count };
  } finally {
    await verification?.cleanup();
    if (outbound !== candidate) await outbound?.cleanup();
    await candidate.cleanup();
  }
}

async function completeCompanionIdentityRound(args: {
  initial: Awaited<ReturnType<typeof probeCompanionSyncIdentities>>;
  initialCount: number;
  endpointUrl: string;
  identity: Omit<Parameters<typeof receiveCompanionSyncIdentityCandidates>[0],
    'localViewId' | 'remoteViewId' | 'snapshotPath'>;
  received: Awaited<ReturnType<typeof receiveCompanionSyncIdentityCandidates>>;
  sent: Awaited<ReturnType<typeof sendCompanionSyncIdentityCandidates>>;
}) {
  let candidateCount = args.initialCount;
  const checked = await completeSyncIdentityExchange({ initial: args.initial,
    probe: async () => {
      const candidate = await probeCompanionSyncIdentities(args.endpointUrl);
      candidateCount += candidate.count;
      return candidate;
    },
    receive: async (candidate) => {
      const result = await receiveCompanionSyncIdentityCandidates({ ...args.identity,
        localViewId: candidate.localViewId, remoteViewId: candidate.sourceViewId,
        snapshotPath: candidate.snapshotPath });
      args.received.appliedPages += result.appliedPages;
      args.received.pageCount += result.pageCount;
      args.received.appliedObjects += result.appliedObjects;
      return result.appliedPages;
    },
    send: async (candidate) => {
      const result = await sendCompanionSyncIdentityCandidates({ ...args.identity,
        localViewId: candidate.localViewId, remoteViewId: candidate.sourceViewId,
        snapshotPath: candidate.snapshotPath });
      args.sent.appliedPages += result.appliedPages;
      args.sent.pageCount += result.pageCount;
      args.sent.appliedObjects += result.appliedObjects;
      return result.appliedPages;
    } });
  return { checked, candidateCount };
}
