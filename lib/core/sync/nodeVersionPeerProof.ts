import type { SyncGroupCoveragePayload } from '../../platform/syncGroupCoverageContract.js';
import type { SyncGroupMemberStatePayload } from '../../platform/syncGroupMemberStateContract.js';

import { SYNC_GROUP_LINE_CLOCK_MARGIN_MS } from './syncGroupCoverageStore.js';

export function assertNodeVersionPeerEpoch(knownEpoch: string | undefined, incomingEpoch: string) {
  if (knownEpoch !== undefined && knownEpoch !== incomingEpoch) {
    throw new Error('node_version_peer_restore_requires_rejoin');
  }
}

/**
 * A crash can drop a peer's last commits after this device acknowledged them. The peer is still safe
 * to sync with when what it durably holds stays within the group line's margin of what this device
 * believed it held, because nothing reclaimed here relied on the lost part.
 */
export function isPeerProofRollbackRecoverable(
  local: SyncGroupCoveragePayload, incoming: SyncGroupMemberStatePayload
) {
  const peer = incoming.sender_device_identity_key;
  const held = incoming.coverage?.basis === local.basis ? incoming.coverage.cells[peer] ?? {} : {};
  return Object.entries(local.cells[peer] ?? {}).every(([origin, at]) => {
    const durable = held[origin];
    return durable !== undefined && Date.parse(durable) >= Date.parse(at) - SYNC_GROUP_LINE_CLOCK_MARGIN_MS;
  });
}

/** Returns the revision to remember when the peer recoverably lost acknowledged commits. */
export function assertNodeVersionPeerProofFresh(
  known: { library_epoch: string; proof_revision: number } | undefined,
  incoming: SyncGroupMemberStatePayload,
  localDeviceId: string,
  localCoverage: SyncGroupCoveragePayload
): number | null {
  assertNodeVersionPeerEpoch(known?.library_epoch, incoming.library_epoch);
  const acknowledged = incoming.source_proof_revisions[localDeviceId] ?? 0;
  if (!known || known.proof_revision <= acknowledged) return null;
  if (!isPeerProofRollbackRecoverable(localCoverage, incoming)) {
    throw new Error('node_version_peer_restore_requires_rejoin');
  }
  return acknowledged;
}
