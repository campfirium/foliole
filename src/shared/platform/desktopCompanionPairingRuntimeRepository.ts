import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  DesktopCompanionPairedDevicePayload,
  DesktopCompanionPairingOverviewPayload,
  DesktopCompanionPairRequestPayload,
  NativePrimaryDeviceStatePayload,
  DesktopCompanionSyncServerStatusPayload
} from '../../../lib/platform/nativeCompanionSyncContract';

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

function normalizeServerStatus(value: unknown): DesktopCompanionSyncServerStatusPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      advertised_urls: [],
      last_error: null,
      paired_device_count: 0,
      pending_pair_request_count: 0,
      port: null,
      state: 'stopped'
    };
  }
  const raw = value as Record<string, unknown>;
  return {
    advertised_urls: Array.isArray(raw.advertised_urls)
      ? raw.advertised_urls.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    last_error: typeof raw.last_error === 'string' && raw.last_error.trim() ? raw.last_error : null,
    paired_device_count: typeof raw.paired_device_count === 'number' ? raw.paired_device_count : 0,
    pending_pair_request_count: typeof raw.pending_pair_request_count === 'number' ? raw.pending_pair_request_count : 0,
    port: typeof raw.port === 'number' ? raw.port : null,
    state: raw.state === 'failed' || raw.state === 'running' || raw.state === 'stopped' ? raw.state : 'stopped'
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
      paired_devices: [],
      pending_requests: [],
      primary_device_state: normalizePrimaryDeviceState(null),
      server_status: normalizeServerStatus(null),
      sync_enabled: false
    };
  }
  const raw = value as Record<string, unknown>;
  return {
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
    sync_enabled: raw.sync_enabled === true
  };
}

async function invokeDesktopCompanionPairingCommand<
  T extends
    | typeof NATIVE_COMMANDS.loadCompanionPairingOverview
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
