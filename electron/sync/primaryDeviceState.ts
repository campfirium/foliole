import {
  canRunPrimaryDeviceExternalSource,
  resolvePrimaryDeviceState,
  type PrimaryDevicePeer,
  type PrimaryDeviceState
} from '../../lib/core/sync/primaryDeviceResolver.js';
import { type NativePrimaryDeviceStatePayload } from '../../lib/platform/nativeCompanionSyncContract.js';
import { loadOrCreateDesktopDeviceId } from '../database/deviceIdentity.js';
import { loadCommittedPrimaryDevice } from '../database/primaryDeviceCommit.js';
import { loadSyncPeers } from '../database/syncPeers.js';

import { loadPairedCompanionDevices } from './companionPairingStore.js';

function toPrimaryDevicePeers(peers: ReturnType<typeof loadSyncPeers>): PrimaryDevicePeer[] {
  return peers.map((peer) => ({
    deviceId: peer.peer_id,
    lastSeenVersionCursor: peer.last_seen_version_cursor,
    lastSyncedAt: peer.last_synced_at,
    status: peer.status
  }));
}

function toTrustedDevicePeers(devices: ReturnType<typeof loadPairedCompanionDevices>): PrimaryDevicePeer[] {
  return devices.map((device) => ({
    deviceId: device.device_id,
    status: 'paired'
  }));
}

export function loadDesktopPrimaryDeviceState(now = new Date().toISOString()): PrimaryDeviceState {
  return resolvePrimaryDeviceState({
    committedState: loadCommittedPrimaryDevice(),
    hostKind: 'desktop',
    localDeviceId: loadOrCreateDesktopDeviceId(now),
    syncPeers: toPrimaryDevicePeers(loadSyncPeers()),
    trustedPeers: toTrustedDevicePeers(loadPairedCompanionDevices())
  });
}

export function loadDesktopPrimaryDeviceStatePayload(now?: string): NativePrimaryDeviceStatePayload {
  return toNativePrimaryDeviceStatePayload(loadDesktopPrimaryDeviceState(now));
}

export function canDesktopRunExternalSources(now?: string) {
  return canRunPrimaryDeviceExternalSource(loadDesktopPrimaryDeviceState(now));
}

export function toNativePrimaryDeviceStatePayload(state: PrimaryDeviceState): NativePrimaryDeviceStatePayload {
  return {
    can_initiate_takeover: state.canInitiateTakeover,
    local_role: state.localRole,
    primary_device_id: state.primaryDeviceId,
    source: state.source,
    takeover_blocked_reasons: [...state.takeoverBlockedReasons]
  };
}
