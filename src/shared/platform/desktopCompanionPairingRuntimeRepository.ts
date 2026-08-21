import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  DesktopCompanionAuthorizationPayload,
  DesktopCompanionPairingOverviewPayload,
  DesktopCompanionPairRequestPayload
} from '../../../lib/platform/nativeCompanionSyncContract';

import { normalizePairingHost } from './desktop/pairingHostNormalization';
import { normalizeJoinCandidates, normalizeJoinRequest } from './desktop/pairingJoinNormalization';
import { normalizeServerStatus } from './desktop/pairingServerNormalization';
import { normalizeSyncGroup } from './desktop/syncGroupNormalization';
import { getElectronAPI } from './electronApi';
import { getRuntimeInvoke } from './runtimeInvoke';

function normalizePairedAuthorization(value: unknown): DesktopCompanionAuthorizationPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.authorization_id !== 'string' ||
    typeof raw.host_name !== 'string' ||
    typeof raw.host_platform !== 'string' ||
    typeof raw.paired_at !== 'string'
  ) {
    return null;
  }
  return {
    client_address: typeof raw.client_address === 'string' && raw.client_address.trim() ? raw.client_address : null,
    authorization_id: raw.authorization_id,
    host_name: raw.host_name,
    host_platform: raw.host_platform,
    paired_at: raw.paired_at
  };
}

function normalizePendingRequest(value: unknown): DesktopCompanionPairRequestPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.host_name !== 'string' ||
    typeof raw.host_platform !== 'string' ||
    typeof raw.expires_at !== 'string' ||
    typeof raw.pair_request_id !== 'string' ||
    typeof raw.requested_at !== 'string'
  ) {
    return null;
  }
  if (raw.status !== 'approved' && raw.status !== 'pending' && raw.status !== 'rejected') {
    return null;
  }
  return {
    client_address: typeof raw.client_address === 'string' && raw.client_address.trim() ? raw.client_address : null,
    host_name: raw.host_name,
    host_platform: raw.host_platform,
    expires_at: raw.expires_at,
    pair_request_id: raw.pair_request_id,
    requested_at: raw.requested_at,
    status: raw.status,
  };
}

function normalizePairingOverview(value: unknown): DesktopCompanionPairingOverviewPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      current_host: null,
      join_candidates: [],
      join_request: null,
      paired_authorizations: [],
      pending_requests: [],
      server_status: normalizeServerStatus(null),
      sync_group: null,
      sync_enabled: false,
      sync_paused: false,
      participating: false
    };
  }
  const raw = value as Record<string, unknown>;
  return {
    current_host: normalizePairingHost(raw.current_host),
    join_candidates: normalizeJoinCandidates(raw.join_candidates),
    join_request: normalizeJoinRequest(raw.join_request),
    paired_authorizations: Array.isArray(raw.paired_authorizations)
      ? raw.paired_authorizations
          .map((entry) => normalizePairedAuthorization(entry))
          .filter((entry): entry is DesktopCompanionAuthorizationPayload => entry !== null)
      : [],
    pending_requests: Array.isArray(raw.pending_requests)
      ? raw.pending_requests
          .map((entry) => normalizePendingRequest(entry))
          .filter((entry): entry is DesktopCompanionPairRequestPayload => entry !== null)
      : [],
    server_status: normalizeServerStatus(raw.server_status),
    sync_group: normalizeSyncGroup(raw.sync_group),
    sync_enabled: raw.sync_enabled === true,
    sync_paused: raw.sync_paused === true,
    participating: raw.participating === true
  };
}

export async function invokeDesktopCompanionPairingCommand<
  T extends
    | typeof NATIVE_COMMANDS.loadCompanionPairingOverview
    | typeof NATIVE_COMMANDS.createSyncGroup
    | typeof NATIVE_COMMANDS.leaveSyncGroup
    | typeof NATIVE_COMMANDS.removeSyncGroupMember
    | typeof NATIVE_COMMANDS.discoverSyncGroups
    | typeof NATIVE_COMMANDS.requestSyncGroupJoin
    | typeof NATIVE_COMMANDS.completeSyncGroupJoin
    | typeof NATIVE_COMMANDS.enableCompanionSync
    | typeof NATIVE_COMMANDS.disableCompanionSync
    | typeof NATIVE_COMMANDS.pauseCompanionSync
    | typeof NATIVE_COMMANDS.resumeCompanionSync
    | typeof NATIVE_COMMANDS.approveCompanionPairRequest
    | typeof NATIVE_COMMANDS.rejectCompanionPairRequest
>(
  command: T,
  args?: Record<string, unknown>
) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return normalizePairingOverview(null);
  }
  return normalizePairingOverview(await runtimeInvoke(command, args));
}

export function loadDesktopCompanionPairingOverview() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.loadCompanionPairingOverview);
}

export function createDesktopSyncGroup() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.createSyncGroup);
}

export function leaveDesktopSyncGroup() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.leaveSyncGroup);
}

export function removeDesktopSyncGroupMember(hostName: string) {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.removeSyncGroupMember, { host_name: hostName });
}

export function discoverDesktopSyncGroups() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.discoverSyncGroups);
}

export function requestDesktopSyncGroupJoin(endpointUrl: string) {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.requestSyncGroupJoin, { endpoint_url: endpointUrl });
}

export function completeDesktopSyncGroupJoin() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.completeSyncGroupJoin);
}

export function approveDesktopCompanionPairRequest(pairRequestId: string) {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.approveCompanionPairRequest, {
    pair_request_id: pairRequestId
  });
}

export function rejectDesktopCompanionPairRequest(pairRequestId: string) {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.rejectCompanionPairRequest, {
    pair_request_id: pairRequestId
  });
}

export function onDesktopCompanionPairingRequestsChanged(handler: () => void) {
  return getElectronAPI()?.onCompanionPairingRequestsChanged?.(handler) ?? null;
}
