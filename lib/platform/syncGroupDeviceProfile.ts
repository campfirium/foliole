export interface SyncGroupDeviceProfile {
  device_id: string;
  device_name: string;
}

export function allocateSyncGroupDeviceProfile(
  baseName: string,
  occupiedNames: Iterable<string>
): SyncGroupDeviceProfile {
  const normalizedBase = baseName.trim();
  if (!normalizedBase) throw new Error('sync_group_device_name_invalid');
  const occupied = new Set([...occupiedNames].map((name) => name.trim()).filter(Boolean));
  let deviceName = normalizedBase;
  let suffix = 2;
  while (occupied.has(deviceName)) {
    deviceName = `${normalizedBase} ${suffix}`;
    suffix += 1;
  }
  return { device_id: deviceName, device_name: deviceName };
}

export function isAssignedSyncGroupDeviceName(name: string, baseName: string) {
  const normalizedName = name.trim();
  const normalizedBase = baseName.trim();
  if (!normalizedName || !normalizedBase) return false;
  return normalizedName === normalizedBase
    || new RegExp(`^${escapePattern(normalizedBase)} [2-9][0-9]*$`, 'u').test(normalizedName);
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
