import { loadOrCreateDesktopInstallationIdentity } from '../desktopInstallationIdentity.js';

import { loadSourceOwnershipReadiness } from './sourceOwnershipReadiness.js';
import { loadWatchedFolderBindings } from './watchedFolderBindings.js';

export function assertLocalWatchedFolderExecution(ruleId: string, options: { requireEnabled?: boolean } = {}) {
  const readiness = loadSourceOwnershipReadiness();
  if (!readiness.ready) throw new Error('watched_folder_peer_upgrade_required');
  const identity = loadOrCreateDesktopInstallationIdentity();
  const binding = loadWatchedFolderBindings().find((item) => item.bindingId === ruleId);
  if (!binding || binding.ownerInstallationId !== identity.installationId || binding.claimState !== 'claimed') {
    throw new Error('watched_folder_not_owned_by_this_device');
  }
  if ((options.requireEnabled && !binding.enabled) || binding.availability !== 'available') {
    throw new Error('watched_folder_not_executable');
  }
  return binding;
}
