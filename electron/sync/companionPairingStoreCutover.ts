import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { migratePairedCompanionStore } from './companionPairingStore.js';

export function ensureCompanionPairingStoreAuthorizationCutover() {
  const group = loadDesktopSyncGroup();
  const authorizationByHost = new Map(
    (group?.members ?? []).map((member) => [member.host_name, member.authorization_id])
  );
  return migratePairedCompanionStore((hostName) => authorizationByHost.get(hostName) ?? null);
}
