import type { SyncGroupMemberStatePayload } from '../../platform/syncGroupMemberStateContract.js';

export function assertNodeVersionPeerEpoch(knownEpoch: string | undefined, incomingEpoch: string) {
  if (knownEpoch !== undefined && knownEpoch !== incomingEpoch) {
    throw new Error('node_version_peer_restore_requires_rejoin');
  }
}

export function assertNodeVersionPeerProofFresh(
  known: { library_epoch: string; proof_revision: number } | undefined,
  incoming: SyncGroupMemberStatePayload,
  localDeviceId: string
) {
  assertNodeVersionPeerEpoch(known?.library_epoch, incoming.library_epoch);
  if (known && known.proof_revision > (incoming.source_proof_revisions[localDeviceId] ?? 0)) {
    throw new Error('node_version_peer_restore_requires_rejoin');
  }
}
