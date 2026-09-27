const readyDeviceIds = new Map<string, 'normal' | 'restore'>();

export function markDesktopSyncGroupMemberStateReady(deviceId: string, mode: 'normal' | 'restore' = 'normal') {
  readyDeviceIds.set(deviceId, mode);
}

export function isDesktopSyncGroupMemberStateReady(deviceId: string) {
  return readyDeviceIds.has(deviceId);
}

export function desktopSyncGroupMemberStateReadiness(deviceId: string) {
  return readyDeviceIds.get(deviceId) ?? null;
}

export function revokeDesktopSyncGroupMemberStateReadiness(deviceId: string) {
  readyDeviceIds.delete(deviceId);
}

export function clearDesktopSyncGroupMemberStateReadiness() {
  readyDeviceIds.clear();
}
