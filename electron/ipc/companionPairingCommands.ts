import { app } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resolveFolioleAppVersion } from '../appVersion.js';
import { loadOrCreateDesktopDeviceId } from '../database/deviceIdentity.js';
import { commitPrimaryDeviceToPeer } from '../database/primaryDeviceCommit.js';
import {
  approveCompanionPairRequest,
  loadPendingCompanionPairRequests,
  rejectCompanionPairRequest
} from '../sync/companionPairingRequests.js';
import { clearPairedCompanionDevices, loadPairedCompanionDevices, removePairedCompanionDevice } from '../sync/companionPairingStore.js';
import {
  isDesktopCompanionSyncEnabled,
  setDesktopCompanionSyncEnabled
} from '../sync/desktopCompanionSyncPreference.js';
import {
  ensureLanWorkspaceSyncServer,
  getLanWorkspaceSyncServerStatus,
  refreshLanWorkspaceSyncServerPairingStatus,
  stopLanWorkspaceSyncServer
} from '../sync/lanWorkspaceSyncServer.js';
import { loadDesktopPrimaryDeviceStatePayload } from '../sync/primaryDeviceState.js';

import { asString } from './commandParsers.js';

function buildDesktopCompanionPairingOverview() {
  return {
    paired_devices: loadPairedCompanionDevices(),
    pending_requests: loadPendingCompanionPairRequests(),
    primary_device_state: loadDesktopPrimaryDeviceStatePayload(),
    server_status: refreshLanWorkspaceSyncServerPairingStatus(),
    sync_enabled: isDesktopCompanionSyncEnabled()
  };
}

function requireCompanionPairRequestMutationResult<T>(result: T | null, pairRequestId: string) {
  if (result) {
    return result;
  }
  throw new Error(`unknown companion pair request: ${pairRequestId}`);
}

function handleCompanionPairRequestMutation(
  args: Record<string, unknown>,
  mutate: typeof approveCompanionPairRequest | typeof rejectCompanionPairRequest
) {
  const pairRequestId = asString(args.pair_request_id, 'pair_request_id');
  requireCompanionPairRequestMutationResult(mutate(pairRequestId), pairRequestId);
  return buildDesktopCompanionPairingOverview();
}

function setDesktopAsPrimaryDevice() {
  const desktopDeviceId = loadOrCreateDesktopDeviceId();
  commitPrimaryDeviceToPeer({
    primaryDeviceId: desktopDeviceId,
    updatedByDeviceId: desktopDeviceId
  });
  return buildDesktopCompanionPairingOverview();
}

export function handleCompanionPairingCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadCompanionPairingOverview) {
    return {
      paired_devices: loadPairedCompanionDevices(),
      pending_requests: loadPendingCompanionPairRequests(),
      primary_device_state: loadDesktopPrimaryDeviceStatePayload(),
      server_status: getLanWorkspaceSyncServerStatus(),
      sync_enabled: isDesktopCompanionSyncEnabled()
    };
  }
  if (command === NATIVE_COMMANDS.enableCompanionSync) {
    setDesktopCompanionSyncEnabled(true);
    return ensureLanWorkspaceSyncServer({
      appVersion: resolveFolioleAppVersion(app),
      peerId: loadOrCreateDesktopDeviceId()
    }).then(() => buildDesktopCompanionPairingOverview());
  }
  if (command === NATIVE_COMMANDS.disableCompanionSync) {
    setDesktopCompanionSyncEnabled(false);
    return stopLanWorkspaceSyncServer().then(() => buildDesktopCompanionPairingOverview());
  }
  if (command === NATIVE_COMMANDS.approveCompanionPairRequest) {
    return handleCompanionPairRequestMutation(args, approveCompanionPairRequest);
  }
  if (command === NATIVE_COMMANDS.rejectCompanionPairRequest) {
    return handleCompanionPairRequestMutation(args, rejectCompanionPairRequest);
  }
  if (command === NATIVE_COMMANDS.clearCompanionPairedDevices) {
    clearPairedCompanionDevices();
    return buildDesktopCompanionPairingOverview();
  }
  if (command === NATIVE_COMMANDS.removeCompanionPairedDevice) {
    const deviceId = asString(args.device_id, 'device_id');
    removePairedCompanionDevice(deviceId);
    return buildDesktopCompanionPairingOverview();
  }
  if (command === NATIVE_COMMANDS.setDesktopAsPrimaryDevice) {
    return setDesktopAsPrimaryDevice();
  }
  return undefined;
}
