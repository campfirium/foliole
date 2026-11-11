import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION, type SyncGroupMemberStatePayload } from '../../platform/syncGroupMemberStateContract.js';
import type { WebDavRelayBinding } from '../../platform/webDavRelayContract.js';

import type { DbPort } from './dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import type { RequestSyncAuthenticatedContext } from './requestSyncWire.js';
import { readRelayCollections, relayCollectionUrl } from './webDavRelayCollections.js';
import { readWebDavRelayLanBaseline } from './webDavRelayLanBaseline.js';

export async function readWebDavRelayBodyScope(db: DbPort, binding: WebDavRelayBinding, localDevice: string) {
  const desktop = localDevice === binding.desktop_device_id;
  if (!desktop && localDevice !== binding.phone_device_id) return null;
  const peerDevice = desktop ? binding.phone_device_id : binding.desktop_device_id;
  const [epochs] = await db.query<{ localEpoch: string; peerEpoch: string }>(`
    SELECT local.library_epoch AS localEpoch, known.library_epoch AS peerEpoch
    FROM node_version_local_proof_state local
    JOIN node_version_device_revisions known ON known.group_id = ? AND known.device_identity_key = ?
    JOIN sync_group_devices peer ON peer.group_id = known.group_id AND peer.device_identity_key = known.device_identity_key
    WHERE local.singleton_id = 1 AND peer.state = 'active' AND known.blocked_reason IS NULL
      AND NOT EXISTS (SELECT 1 FROM sync_group_removal_decisions removed
        WHERE removed.group_id = peer.group_id AND removed.target_device_identity_key = peer.device_identity_key
          AND removed.superseded_at IS NULL)`, [binding.group_id, peerDevice]);
  if (!epochs) return null;
  const baseline = await readWebDavRelayLanBaseline(db, { binding, localDevice, ...epochs });
  if (!baseline) return null;
  const folder = new URL(binding.directory_url);
  if (folder.username || folder.password || folder.search || folder.hash || !folder.pathname.endsWith('/')) {
    throw new Error('webdav_relay_invalid_url');
  }
  const digest = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([
    binding.id, desktop ? epochs.localEpoch : epochs.peerEpoch, desktop ? epochs.peerEpoch : epochs.localEpoch
  ]))));
  const outgoing = new URL(`foliole-${digest}-${desktop ? 'desktop' : 'phone'}/`, folder);
  const incoming = new URL(`foliole-${digest}-${desktop ? 'phone' : 'desktop'}/`, folder);
  const source = bytesToHex(sha256(new TextEncoder().encode(baseline.sourceEpoch)));
  const key = `webdav_relay_body:${digest}:${source}`;
  const collections = await readRelayCollections(db, key);
  return { baseline, key, receiveScope: { bindingId: binding.id, ...epochs, sourceEpoch: baseline.sourceEpoch },
    outgoing: relayCollectionUrl(outgoing, collections?.active ?? 'legacy'),
    outgoingDirection: outgoing, incoming,
    send: context(binding.group_id, localDevice, epochs.localEpoch, peerDevice, epochs.peerEpoch),
    receive: context(binding.group_id, peerDevice, epochs.peerEpoch, localDevice, epochs.localEpoch) };
}

export type WebDavRelayBodyScope = NonNullable<Awaited<ReturnType<typeof readWebDavRelayBodyScope>>>;

function context(groupId: string, sender: string, senderEpoch: string, receiver: string,
  receiverEpoch: string): RequestSyncAuthenticatedContext {
  return { groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, initiatorDeviceId: sender,
    initiatorLibraryEpoch: senderEpoch, responderDeviceId: receiver, responderLibraryEpoch: receiverEpoch };
}

export function webDavRelayPeerState(scope: WebDavRelayBodyScope): SyncGroupMemberStatePayload {
  return { contract_version: SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION, group_id: scope.receive.groupId,
    sender_device_identity_key: scope.receive.initiatorDeviceId, library_epoch: scope.receive.initiatorLibraryEpoch,
    proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null };
}
