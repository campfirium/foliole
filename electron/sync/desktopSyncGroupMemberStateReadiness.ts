const readyDeviceIds = new Set<string>();

export function markDesktopSyncGroupMemberStateReady(deviceId: string) {
  readyDeviceIds.add(deviceId);
}

export function isDesktopSyncGroupMemberStateReady(deviceId: string) {
  return readyDeviceIds.has(deviceId);
}

export function clearDesktopSyncGroupMemberStateReadiness() {
  readyDeviceIds.clear();
}
