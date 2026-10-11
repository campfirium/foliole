import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';

const readyDeviceIds = new Map<string, 'normal' | 'restore'>();
const verifiedStates = new Map<string, SyncGroupMemberStatePayload>();

export function markDesktopSyncGroupMemberStateReady(deviceId: string, mode: 'normal' | 'restore' = 'normal',
  state?: SyncGroupMemberStatePayload) {
  readyDeviceIds.set(deviceId, mode);
  if (state) verifiedStates.set(deviceId, structuredClone(state));
}

export function readDesktopVerifiedMemberState(deviceId: string) {
  const state = verifiedStates.get(deviceId);
  if (!state || !readyDeviceIds.has(deviceId)) throw new Error('sync_group_member_state_required');
  return structuredClone(state);
}

export function isDesktopSyncGroupMemberStateReady(deviceId: string) {
  return readyDeviceIds.has(deviceId);
}

export function desktopSyncGroupMemberStateReadiness(deviceId: string) {
  return readyDeviceIds.get(deviceId) ?? null;
}

export function revokeDesktopSyncGroupMemberStateReadiness(deviceId: string) {
  readyDeviceIds.delete(deviceId);
  verifiedStates.delete(deviceId);
}

export function clearDesktopSyncGroupMemberStateReadiness() {
  readyDeviceIds.clear();
  verifiedStates.clear();
}
