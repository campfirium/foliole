import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  DesktopSyncGroupJoinRequestSummaryPayload,
  DesktopSyncGroupOverviewPayload
} from '../../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupDiscoverySnapshot } from '../../../lib/platform/syncGroupDiscoveryContract';

import { normalizeJoinCandidates, normalizeJoinRequest } from './desktop/syncGroupJoinNormalization';
import { normalizeSyncGroup } from './desktop/syncGroupNormalization';
import { normalizeServerStatus } from './desktop/syncGroupServerNormalization';
import { getElectronAPI } from './electronApi';
import { getRuntimeInvoke } from './runtimeInvoke';

function normalizeJoinRequestSummary(value: unknown): DesktopSyncGroupJoinRequestSummaryPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const required = ['device_name', 'expires_at', 'platform', 'request_id', 'requested_at'];
  if (required.some((key) => typeof raw[key] !== 'string') ||
      (raw.status !== 'accepted' && raw.status !== 'pending')) return null;
  return raw as unknown as DesktopSyncGroupJoinRequestSummaryPayload;
}

function normalizeOverview(value: unknown): DesktopSyncGroupOverviewPayload {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const current = raw.current_device && typeof raw.current_device === 'object'
    ? raw.current_device as Record<string, unknown> : null;
  const currentDevice = current && typeof current.device_name === 'string' && typeof current.platform === 'string'
    ? { device_name: current.device_name, platform: current.platform } : null;
  return {
    current_device: currentDevice,
    join_candidates: normalizeJoinCandidates(raw.join_candidates),
    join_request: normalizeJoinRequest(raw.join_request),
    join_requests: Array.isArray(raw.join_requests)
      ? raw.join_requests.map(normalizeJoinRequestSummary)
        .filter((item): item is DesktopSyncGroupJoinRequestSummaryPayload => item !== null) : [],
    server_status: normalizeServerStatus(raw.server_status),
    sync_group: normalizeSyncGroup(raw.sync_group),
    sync_enabled: raw.sync_enabled === true,
    sync_paused: raw.sync_paused === true,
    participating: raw.participating === true
  };
}

type SyncGroupCommand =
  | typeof NATIVE_COMMANDS.loadSyncGroupOverview
  | typeof NATIVE_COMMANDS.createSyncGroup
  | typeof NATIVE_COMMANDS.leaveSyncGroup
  | typeof NATIVE_COMMANDS.requestSyncGroupJoin
  | typeof NATIVE_COMMANDS.completeSyncGroupJoin
  | typeof NATIVE_COMMANDS.enableCompanionSync
  | typeof NATIVE_COMMANDS.disableCompanionSync
  | typeof NATIVE_COMMANDS.pauseCompanionSync
  | typeof NATIVE_COMMANDS.resumeCompanionSync
  | typeof NATIVE_COMMANDS.syncCompanionNow
  | typeof NATIVE_COMMANDS.acceptSyncGroupJoinRequest
  | typeof NATIVE_COMMANDS.rejectSyncGroupJoinRequest;

export async function invokeDesktopSyncGroupCommand(command: SyncGroupCommand, args?: Record<string, unknown>) {
  const runtimeInvoke = getRuntimeInvoke();
  return normalizeOverview(runtimeInvoke ? await runtimeInvoke(command, args) : null);
}

export function loadDesktopSyncGroupOverview() {
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.loadSyncGroupOverview);
}

export function createDesktopSyncGroup() {
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.createSyncGroup);
}

export function leaveDesktopSyncGroup() {
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.leaveSyncGroup);
}

export function requestDesktopSyncGroupJoin(endpointUrl: string) {
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.requestSyncGroupJoin, { endpoint_url: endpointUrl });
}

export function completeDesktopSyncGroupJoin() {
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.completeSyncGroupJoin);
}

export function syncDesktopCompanionNow() {
  if (!getRuntimeInvoke()) return Promise.reject(new Error('sync_trigger_bridge_unavailable'));
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.syncCompanionNow);
}

export function acceptDesktopSyncGroupJoinRequest(requestId: string) {
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.acceptSyncGroupJoinRequest, { request_id: requestId });
}

export function rejectDesktopSyncGroupJoinRequest(requestId: string) {
  return invokeDesktopSyncGroupCommand(NATIVE_COMMANDS.rejectSyncGroupJoinRequest, { request_id: requestId });
}

export function discoverDesktopSyncGroups() {
  const invoke = getRuntimeInvoke();
  if (!invoke) return Promise.resolve({ candidates: [], change: 'failed', error_code: 'bridge_incompatible',
    status: 'incompatible' } satisfies SyncGroupDiscoverySnapshot);
  return invoke(NATIVE_COMMANDS.discoverSyncGroups);
}

export function stopDiscoveringDesktopSyncGroups() {
  const invoke = getRuntimeInvoke();
  if (!invoke) return Promise.resolve({ candidates: [], change: 'stopped', error_code: null,
    status: 'stopped' } satisfies SyncGroupDiscoverySnapshot);
  return invoke(NATIVE_COMMANDS.stopDiscoverSyncGroups);
}

export function onDesktopSyncGroupJoinRequestsChanged(handler: () => void) {
  return getElectronAPI()?.onSyncGroupJoinRequestsChanged?.(handler) ?? null;
}

export function onDesktopSyncGroupDiscoveryChanged(handler: (payload: SyncGroupDiscoverySnapshot) => void) {
  return getElectronAPI()?.onSyncGroupDiscoveryChanged?.(handler) ?? null;
}
