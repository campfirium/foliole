export function normalizePairingHost(
  value: unknown
): { device_id: string; host_name: string; host_platform: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return typeof raw.device_id === 'string'
      && typeof raw.host_name === 'string'
      && typeof raw.host_platform === 'string'
    ? { device_id: raw.device_id, host_name: raw.host_name, host_platform: raw.host_platform }
    : null;
}
