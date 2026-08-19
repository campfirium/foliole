export interface SyncGroupHostProfile {
  host_name: string;
}

export function allocateSyncGroupHostName(
  baseName: string,
  occupiedNames: Iterable<string>
): SyncGroupHostProfile {
  const normalizedBase = baseName.trim();
  if (!normalizedBase) throw new Error('sync_group_host_name_invalid');
  const occupied = new Set([...occupiedNames].map((name) => name.trim()).filter(Boolean));
  let hostName = normalizedBase;
  let suffix = 2;
  while (occupied.has(hostName)) {
    hostName = `${normalizedBase} ${suffix}`;
    suffix += 1;
  }
  return { host_name: hostName };
}

export function isAssignedSyncGroupHostName(name: string, baseName: string) {
  const normalizedName = name.trim();
  const normalizedBase = baseName.trim();
  if (!normalizedName || !normalizedBase) return false;
  return normalizedName === normalizedBase
    || new RegExp(`^${escapePattern(normalizedBase)} [2-9][0-9]*$`, 'u').test(normalizedName);
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
