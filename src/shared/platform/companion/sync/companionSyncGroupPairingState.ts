import type { NativeCompanionPairingState } from '../../../../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract';
import { normalizePairingState } from '../../companionPairingState';

export function projectCompanionSyncGroupPairingState(
  group: SyncGroupPayload,
  fallback: NativeCompanionPairingState
) {
  const local = group.members.find((member) => member.host_name === group.local_host_name);
  const remote = group.members.find((member) => member.host_name !== group.local_host_name);
  if (!local) return fallback;
  return normalizePairingState({
    ...fallback,
    authorization_id: local.authorization_id,
    host_name: local.host_name,
    host_platform: local.host_platform,
    is_paired: true,
    negotiated_protocol_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
    paired_at: local.joined_at,
    remote_peer_id: fallback.remote_peer_id ?? null,
    remote_peer_name: remote?.host_name ?? null,
    remote_peer_platform: remote?.host_platform ?? null,
    remote_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  });
}
