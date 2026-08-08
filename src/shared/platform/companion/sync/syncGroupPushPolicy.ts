import { shouldSkipSyncGroupPush } from '../../../../../lib/platform/syncGroupContract';
import type { CompanionDesktopSyncOptions } from '../../companionDesktopSyncTypes';
import { loadCompanionPairingState } from '../../companionWorkspacePairing';

import { loadCompanionSyncGroup } from './syncGroupStore';

export async function shouldSkipCompanionPush(options: CompanionDesktopSyncOptions) {
  if (options.resourcesOnly) return true;
  const pairing = await loadCompanionPairingState();
  const syncGroup = pairing.device_kind === 'android-capacitor' ? await loadCompanionSyncGroup() : null;
  return shouldSkipSyncGroupPush(pairing.device_kind, syncGroup?.local_member_state);
}
