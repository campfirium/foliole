import type { DesktopCompanionSyncServerStatusPayload } from '../../../../lib/platform/nativeCompanionSyncContract';

export function normalizeServerStatus(value: unknown): DesktopCompanionSyncServerStatusPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      active_device_count: 0, advertised_urls: [], last_error: null,
      pending_join_request_count: 0, port: null, state: 'stopped',
      topology_role: 'observing', topology_status: 'observing'
    };
  }
  const raw = value as Record<string, unknown>;
  return {
    active_device_count: typeof raw.active_device_count === 'number' ? raw.active_device_count : 0,
    advertised_urls: Array.isArray(raw.advertised_urls)
      ? raw.advertised_urls.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    last_error: typeof raw.last_error === 'string' && raw.last_error.trim() ? raw.last_error : null,
    pending_join_request_count: typeof raw.pending_join_request_count === 'number'
      ? raw.pending_join_request_count : 0,
    port: typeof raw.port === 'number' ? raw.port : null,
    state: raw.state === 'failed' || raw.state === 'running' || raw.state === 'stopped' ? raw.state : 'stopped',
    topology_role: raw.topology_role === 'anchor' || raw.topology_role === 'member'
      ? raw.topology_role : 'observing',
    topology_status: ['ready', 'waiting_anchor', 'incompatible', 'sync_before_demote'].includes(
      String(raw.topology_status)
    ) ? raw.topology_status as DesktopCompanionSyncServerStatusPayload['topology_status'] : 'observing'
  };
}
