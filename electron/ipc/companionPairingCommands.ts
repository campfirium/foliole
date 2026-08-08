import { app } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resolveFolioleAppVersion } from '../appVersion.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadOrCreateDesktopDeviceId } from '../database/deviceIdentity.js';
import { commitPrimaryDeviceToPeer } from '../database/primaryDeviceCommit.js';
import { createDesktopSyncGroup, loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { resolveDesktopDeviceName } from '../sync/companionLanPayloads.js';
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
import { discoverDesktopSyncGroups } from '../sync/desktopSyncGroupDiscovery.js';
import { loadDesktopSyncGroupJoinState, saveDesktopSyncGroupCandidates } from '../sync/desktopSyncGroupJoinState.js';
import { completeDesktopSyncGroupJoin, requestDesktopSyncGroupJoin } from '../sync/desktopSyncGroupProvisioning.js';
import {
  ensureLanWorkspaceSyncServer,
  getLanWorkspaceSyncServerStatus,
  refreshLanWorkspaceSyncServerPairingStatus,
  stopLanWorkspaceSyncServer
} from '../sync/lanWorkspaceSyncServer.js';
import { loadDesktopPrimaryDeviceStatePayload } from '../sync/primaryDeviceState.js';

import { asString } from './commandParsers.js';

const COMPANION_PAIRING_COMMANDS = new Set<string>([
  NATIVE_COMMANDS.loadCompanionPairingOverview,
  NATIVE_COMMANDS.createSyncGroup,
  NATIVE_COMMANDS.discoverSyncGroups,
  NATIVE_COMMANDS.requestSyncGroupJoin,
  NATIVE_COMMANDS.completeSyncGroupJoin,
  NATIVE_COMMANDS.enableCompanionSync,
  NATIVE_COMMANDS.disableCompanionSync,
  NATIVE_COMMANDS.clearCompanionPairedDevices,
  NATIVE_COMMANDS.removeCompanionPairedDevice,
  NATIVE_COMMANDS.setDesktopAsPrimaryDevice,
  NATIVE_COMMANDS.approveCompanionPairRequest,
  NATIVE_COMMANDS.rejectCompanionPairRequest
]);

function buildDesktopCompanionPairingOverview() {
  const join = loadDesktopSyncGroupJoinState();
  return {
    join_candidates: join.candidates,
    join_request: join.pending?.request ?? null,
    paired_devices: loadPairedCompanionDevices(),
    pending_requests: loadPendingCompanionPairRequests(),
    primary_device_state: loadDesktopPrimaryDeviceStatePayload(),
    server_status: refreshLanWorkspaceSyncServerPairingStatus(),
    sync_group: loadDesktopSyncGroup(),
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

function handleSyncGroupJoinCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.createSyncGroup) {
    const deviceId = loadOrCreateDesktopDeviceId();
    createDesktopSyncGroup({ deviceId, deviceKind: process.platform, deviceName: resolveDesktopDeviceName() });
    if (!isDesktopCompanionSyncEnabled()) setDesktopCompanionSyncEnabled(true);
    return ensureLanWorkspaceSyncServer({ appVersion: resolveFolioleAppVersion(app), peerId: deviceId })
      .then(() => buildDesktopCompanionPairingOverview());
  }
  if (command === NATIVE_COMMANDS.discoverSyncGroups) {
    return discoverDesktopSyncGroups().then((candidates) => {
      saveDesktopSyncGroupCandidates(candidates);
      return buildDesktopCompanionPairingOverview();
    });
  }
  if (command === NATIVE_COMMANDS.requestSyncGroupJoin) {
    return requestDesktopSyncGroupJoin(asString(args.endpoint_url, 'endpoint_url'))
      .then(() => buildDesktopCompanionPairingOverview());
  }
  if (command !== NATIVE_COMMANDS.completeSyncGroupJoin) return undefined;
  return completeDesktopSyncGroupJoin().then(async () => {
    setDesktopCompanionSyncEnabled(true);
    await ensureLanWorkspaceSyncServer({
      appVersion: resolveFolioleAppVersion(app), peerId: loadOrCreateDesktopDeviceId()
    });
    return buildDesktopCompanionPairingOverview();
  });
}

function handleOwnedCompanionPairingCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadCompanionPairingOverview) {
    const join = loadDesktopSyncGroupJoinState();
    return {
      join_candidates: join.candidates,
      join_request: join.pending?.request ?? null,
      paired_devices: loadPairedCompanionDevices(),
      pending_requests: loadPendingCompanionPairRequests(),
      primary_device_state: loadDesktopPrimaryDeviceStatePayload(),
      server_status: getLanWorkspaceSyncServerStatus(),
      sync_group: loadDesktopSyncGroup(),
      sync_enabled: isDesktopCompanionSyncEnabled()
    };
  }
  const joinResult = handleSyncGroupJoinCommand(command, args);
  if (joinResult) return joinResult;
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

export function handleCompanionPairingCommand(command: string, args: Record<string, unknown>) {
  if (!COMPANION_PAIRING_COMMANDS.has(command)) return undefined;
  return runWithDatabaseConnectionOwner(() => handleOwnedCompanionPairingCommand(command, args));
}
