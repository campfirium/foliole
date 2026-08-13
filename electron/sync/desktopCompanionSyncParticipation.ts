import {
  isDesktopCompanionSyncParticipating,
  setDesktopCompanionSyncEnabled,
  setDesktopCompanionSyncPaused
} from './desktopCompanionSyncPreference.js';
import {
  ensureLanWorkspaceSyncServer,
  stopLanWorkspaceSyncServer
} from './lanWorkspaceSyncServer.js';

interface DesktopSyncRuntimeIdentity {
  appVersion: string;
  peerId: string;
}

export function assertDesktopCompanionSyncParticipating() {
  if (!isDesktopCompanionSyncParticipating()) {
    throw new Error('sync_participation_inactive');
  }
}

export async function reconcileDesktopCompanionSyncRuntime(
  identity: DesktopSyncRuntimeIdentity
) {
  return isDesktopCompanionSyncParticipating()
    ? ensureLanWorkspaceSyncServer(identity)
    : stopLanWorkspaceSyncServer();
}

export function enableDesktopCompanionSync(identity: DesktopSyncRuntimeIdentity) {
  setDesktopCompanionSyncEnabled(true);
  return reconcileDesktopCompanionSyncRuntime(identity);
}

export function disableDesktopCompanionSync() {
  setDesktopCompanionSyncEnabled(false);
  return stopLanWorkspaceSyncServer();
}

export function pauseDesktopCompanionSync() {
  setDesktopCompanionSyncPaused(true);
  return stopLanWorkspaceSyncServer();
}

export function resumeDesktopCompanionSync(identity: DesktopSyncRuntimeIdentity) {
  setDesktopCompanionSyncPaused(false);
  return reconcileDesktopCompanionSyncRuntime(identity);
}

export function activateDesktopCompanionSync(identity: DesktopSyncRuntimeIdentity) {
  setDesktopCompanionSyncEnabled(true);
  setDesktopCompanionSyncPaused(false);
  return ensureLanWorkspaceSyncServer(identity);
}
