import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  DesktopCompanionPairedDevicePayload,
  DesktopCompanionPairingOverviewPayload,
  DesktopCompanionPairRequestPayload,
  NativePrimaryDeviceStatePayload
} from '../../../lib/platform/nativeCompanionSyncContract';

import { normalizeJoinCandidates, normalizeJoinRequest } from './desktop/pairingJoinNormalization';
import { normalizeServerStatus } from './desktop/pairingServerNormalization';
import { normalizeSyncGroup } from './desktop/syncGroupNormalization';
import { getElectronAPI } from './electronApi';
import { getRuntimeInvoke } from './runtimeInvoke';

function normalizePairedDevice(value: unknown): DesktopCompanionPairedDevicePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.device_id !== 'string' ||
    typeof raw.device_kind !== 'string' ||
    typeof raw.device_name !== 'string' ||
    typeof raw.paired_at !== 'string'
  ) {
    return null;
  }
  return {
    client_address: typeof raw.client_address === 'string' && raw.client_address.trim() ? raw.client_address : null,
    device_id: raw.device_id,
    device_kind: raw.device_kind,
    device_name: raw.device_name,
    paired_at: raw.paired_at
  };
}

function normalizePendingRequest(value: unknown): DesktopCompanionPairRequestPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.device_id !== 'string' ||
    typeof raw.device_kind !== 'string' ||
    typeof raw.device_name !== 'string' ||
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
    device_id: raw.device_id,
    device_kind: raw.device_kind,
    device_name: raw.device_name,
    expires_at: raw.expires_at,
    pair_request_id: raw.pair_request_id,
    requested_at: raw.requested_at,
    status: raw.status
  };
}

function normalizePrimaryDeviceState(value: unknown): NativePrimaryDeviceStatePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      can_initiate_takeover: false,
      local_role: 'unknown',
      primary_device_id: null,
      source: 'paired-primary-missing',
      takeover_blocked_reasons: ['no-current-primary-device']
    };
  }
  const raw = value as Record<string, unknown>;
  return {
    can_initiate_takeover: raw.can_initiate_takeover === true,
    local_role: raw.local_role === 'primary' || raw.local_role === 'secondary' ? raw.local_role : 'unknown',
    primary_device_id: typeof raw.primary_device_id === 'string' && raw.primary_device_id.trim() ? raw.primary_device_id : null,
    source: normalizePrimaryDeviceSource(raw.source),
    takeover_blocked_reasons: normalizeTakeoverBlockedReasons(raw.takeover_blocked_reasons)
  };
}

function normalizePrimaryDeviceSource(value: unknown): NativePrimaryDeviceStatePayload['source'] {
  if (
    value === 'committed-primary-device' ||
    value === 'companion-paired-primary' ||
    value === 'desktop-paired-default' ||
    value === 'self-unpaired'
  ) {
    return value;
  }
  return 'paired-primary-missing';
}

function normalizeTakeoverBlockedReasons(value: unknown): NativePrimaryDeviceStatePayload['takeover_blocked_reasons'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is NativePrimaryDeviceStatePayload['takeover_blocked_reasons'][number] =>
    entry === 'control-message-carrier-missing' ||
    entry === 'no-current-primary-device' ||
    entry === 'release-ack-missing' ||
    entry === 'sync-latest-confirmation-missing'
  );
}

function normalizePairingOverview(value: unknown): DesktopCompanionPairingOverviewPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      join_candidates: [],
      join_request: null,
      paired_devices: [],
      pending_requests: [],
      primary_device_state: normalizePrimaryDeviceState(null),
      server_status: normalizeServerStatus(null),
      sync_group: null,
      sync_enabled: false
    };
  }
  const raw = value as Record<string, unknown>;
  return {
    join_candidates: normalizeJoinCandidates(raw.join_candidates),
    join_request: normalizeJoinRequest(raw.join_request),
    paired_devices: Array.isArray(raw.paired_devices)
      ? raw.paired_devices
          .map((entry) => normalizePairedDevice(entry))
          .filter((entry): entry is DesktopCompanionPairedDevicePayload => entry !== null)
      : [],
    pending_requests: Array.isArray(raw.pending_requests)
      ? raw.pending_requests
          .map((entry) => normalizePendingRequest(entry))
          .filter((entry): entry is DesktopCompanionPairRequestPayload => entry !== null)
      : [],
    primary_device_state: normalizePrimaryDeviceState(raw.primary_device_state),
    server_status: normalizeServerStatus(raw.server_status),
    sync_group: normalizeSyncGroup(raw.sync_group),
    sync_enabled: raw.sync_enabled === true
  };
}

async function invokeDesktopCompanionPairingCommand<
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
    | typeof NATIVE_COMMANDS.clearCompanionPairedDevices
    | typeof NATIVE_COMMANDS.removeCompanionPairedDevice
    | typeof NATIVE_COMMANDS.setDesktopAsPrimaryDevice
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

export function removeDesktopSyncGroupMember(deviceId: string) {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.removeSyncGroupMember, { device_id: deviceId });
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

export function clearDesktopCompanionPairedDevices() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.clearCompanionPairedDevices);
}

export function removeDesktopCompanionPairedDevice(deviceId: string) {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.removeCompanionPairedDevice, {
    device_id: deviceId
  });
}

export function setDesktopAsPrimaryDevice() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.setDesktopAsPrimaryDevice);
}

export function enableDesktopCompanionSync() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.enableCompanionSync);
}

export function disableDesktopCompanionSync() {
  return invokeDesktopCompanionPairingCommand(NATIVE_COMMANDS.disableCompanionSync);
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
