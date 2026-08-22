import type { NativeCompanionPairingState } from '../../../../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
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
    paired_at: local.joined_at,
    remote_peer_id: fallback.remote_peer_id ?? null,
    remote_peer_name: remote?.host_name ?? null,
    remote_peer_platform: remote?.host_platform ?? null
  });
}
