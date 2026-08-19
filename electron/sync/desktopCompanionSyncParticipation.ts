import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import {
  isDesktopCompanionSyncParticipating,
  setDesktopCompanionSyncEnabled,
  setDesktopCompanionSyncPaused
} from './desktopCompanionSyncPreference.js';
import {
  ensureLanWorkspaceSyncServer,
  stopLanWorkspaceSyncServer
} from './lanWorkspaceSyncServer.js';
import { enableDesktopWorkgroupKey, loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

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
  return isDesktopCompanionSyncParticipating() && hasCurrentWorkgroupSecurity()
    ? ensureLanWorkspaceSyncServer(identity)
    : stopLanWorkspaceSyncServer();
}

export function enableDesktopCompanionSync(identity: DesktopSyncRuntimeIdentity) {
  enableCurrentWorkgroupSecurity();
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
  enableCurrentWorkgroupSecurity();
  setDesktopCompanionSyncEnabled(true);
  setDesktopCompanionSyncPaused(false);
  return ensureLanWorkspaceSyncServer(identity);
}

function enableCurrentWorkgroupSecurity() {
  const group = loadDesktopSyncGroup();
  if (!group) return;
  if (group.local_member_state !== 'active') throw new Error('sync_group_not_available');
  enableDesktopWorkgroupKey(group.group_id);
}

function hasCurrentWorkgroupSecurity() {
  const group = loadDesktopSyncGroup();
  return Boolean(group?.local_member_state === 'active'
    && loadDesktopWorkgroupKey(group.group_id));
}
