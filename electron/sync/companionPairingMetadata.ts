import type { DesktopCompanionAuthorizationPayload } from '../../lib/platform/nativeCompanionSyncContract.js';
import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract.js';

export function resolveCompanionPairingMetadata(group: SyncGroupPayload | null) {
  const authorizations: DesktopCompanionAuthorizationPayload[] = (group?.members ?? [])
    .filter((member) => member.state === 'active' && member.host_name !== group?.local_host_name)
    .map((member) => ({
      authorization_id: member.authorization_id,
      client_address: null,
      host_name: member.host_name,
      host_platform: member.host_platform,
      paired_at: member.joined_at
    }));
  return {
    paired_authorization_count: authorizations.length,
    paired_authorizations: authorizations
  };
}
