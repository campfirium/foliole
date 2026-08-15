import type { NativeCompanionPairingState } from '../../../../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract';
import { normalizePairingState } from '../../companionPairingState';

export function projectCompanionSyncGroupPairingState(
  group: SyncGroupPayload,
  fallback: NativeCompanionPairingState
) {
  const local = group.members.find((member) => member.device_id === group.local_device_id);
  const remote = group.members.find((member) => member.device_id !== group.local_device_id);
  if (!local) return fallback;
  return normalizePairingState({
    device_id: local.device_id,
    device_kind: local.device_kind,
    device_name: local.device_name,
    is_paired: true,
    negotiated_protocol_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
    paired_at: local.joined_at,
    primary_device_id: remote?.device_id ?? local.device_id,
    remote_peer_id: remote?.device_id ?? null,
    remote_peer_name: remote?.device_name ?? null,
    remote_peer_platform: remote?.device_kind ?? null,
    remote_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  });
}
