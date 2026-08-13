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
  activateDesktopCompanionSync,
  assertDesktopCompanionSyncParticipating,
  disableDesktopCompanionSync,
  enableDesktopCompanionSync,
  pauseDesktopCompanionSync,
  resumeDesktopCompanionSync
} from '../sync/desktopCompanionSyncParticipation.js';
import { loadDesktopCompanionSyncParticipation } from '../sync/desktopCompanionSyncPreference.js';
import { discoverDesktopSyncGroups } from '../sync/desktopSyncGroupDiscovery.js';
import {
  completeDesktopSyncGroupJoin,
  requestDesktopSyncGroupJoin,
  setDesktopSyncGroupJoinCompletionExecutor
} from '../sync/desktopSyncGroupJoin.js';
import { loadDesktopSyncGroupJoinState, saveDesktopSyncGroupCandidates } from '../sync/desktopSyncGroupJoinState.js';
import {
  getLanWorkspaceSyncServerStatus,
  refreshLanWorkspaceSyncServerPairingStatus,
  stopLanWorkspaceSyncServer
} from '../sync/lanWorkspaceSyncServer.js';
import { loadDesktopPrimaryDeviceStatePayload } from '../sync/primaryDeviceState.js';
import { leaveDesktopSyncGroup, removeDesktopSyncGroupMember } from '../sync/syncGroupDeparture.js';

import { asString } from './commandParsers.js';

const COMPANION_PAIRING_COMMANDS = new Set<string>([
  NATIVE_COMMANDS.loadCompanionPairingOverview,
  NATIVE_COMMANDS.createSyncGroup,
  NATIVE_COMMANDS.leaveSyncGroup,
  NATIVE_COMMANDS.removeSyncGroupMember,
  NATIVE_COMMANDS.discoverSyncGroups,
  NATIVE_COMMANDS.requestSyncGroupJoin,
  NATIVE_COMMANDS.completeSyncGroupJoin,
  NATIVE_COMMANDS.enableCompanionSync,
  NATIVE_COMMANDS.disableCompanionSync,
  NATIVE_COMMANDS.pauseCompanionSync,
  NATIVE_COMMANDS.resumeCompanionSync,
  NATIVE_COMMANDS.clearCompanionPairedDevices,
  NATIVE_COMMANDS.removeCompanionPairedDevice,
  NATIVE_COMMANDS.setDesktopAsPrimaryDevice,
  NATIVE_COMMANDS.approveCompanionPairRequest,
  NATIVE_COMMANDS.rejectCompanionPairRequest
]);

function buildDesktopCompanionPairingOverview(serverStatus = refreshLanWorkspaceSyncServerPairingStatus()) {
  const join = loadDesktopSyncGroupJoinState();
  const syncGroup = loadDesktopSyncGroup();
  return {
    join_candidates: join.candidates,
    join_request: join.pending?.request ?? null,
    paired_devices: loadPairedCompanionDevices(),
    pending_requests: loadPendingCompanionPairRequests(),
    primary_device_state: loadDesktopPrimaryDeviceStatePayload(),
    server_status: serverStatus,
    sync_group: syncGroup,
    ...loadDesktopCompanionSyncParticipation()
  };
}

function desktopSyncRuntimeIdentity() {
  return { appVersion: resolveFolioleAppVersion(app), peerId: loadOrCreateDesktopDeviceId() };
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
  if (mutate === approveCompanionPairRequest) assertDesktopCompanionSyncParticipating();
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

async function finishDesktopSyncGroupJoin() {
  assertDesktopCompanionSyncParticipating();
  await completeDesktopSyncGroupJoin();
  await activateDesktopCompanionSync(desktopSyncRuntimeIdentity());
  return buildDesktopCompanionPairingOverview();
}

function handleSyncGroupJoinCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.createSyncGroup) {
    const deviceId = loadOrCreateDesktopDeviceId();
    createDesktopSyncGroup({ deviceId, deviceKind: process.platform, deviceName: resolveDesktopDeviceName() });
    return activateDesktopCompanionSync({ appVersion: resolveFolioleAppVersion(app), peerId: deviceId })
      .then(() => buildDesktopCompanionPairingOverview());
  }
  if (command === NATIVE_COMMANDS.discoverSyncGroups) {
    assertDesktopCompanionSyncParticipating();
    return discoverDesktopSyncGroups().then((candidates) => {
      saveDesktopSyncGroupCandidates(candidates);
      return buildDesktopCompanionPairingOverview();
    });
  }
  if (command === NATIVE_COMMANDS.requestSyncGroupJoin) {
    assertDesktopCompanionSyncParticipating();
    setDesktopSyncGroupJoinCompletionExecutor(
      () => runWithDatabaseConnectionOwner(finishDesktopSyncGroupJoin)
    );
    return requestDesktopSyncGroupJoin(asString(args.endpoint_url, 'endpoint_url'))
      .then(() => buildDesktopCompanionPairingOverview());
  }
  if (command !== NATIVE_COMMANDS.completeSyncGroupJoin) return undefined;
  return finishDesktopSyncGroupJoin();
}

function handleOwnedCompanionPairingCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadCompanionPairingOverview) {
    return buildDesktopCompanionPairingOverview(getLanWorkspaceSyncServerStatus());
  }
  const joinResult = handleSyncGroupJoinCommand(command, args);
  if (joinResult) return joinResult;
  if (command === NATIVE_COMMANDS.enableCompanionSync) {
    return enableDesktopCompanionSync(desktopSyncRuntimeIdentity())
      .then(() => buildDesktopCompanionPairingOverview());
  }
  if (command === NATIVE_COMMANDS.disableCompanionSync) {
    return disableDesktopCompanionSync().then(() => buildDesktopCompanionPairingOverview());
  }
  if (command === NATIVE_COMMANDS.pauseCompanionSync) {
    return pauseDesktopCompanionSync().then(() => buildDesktopCompanionPairingOverview());
  }
  if (command === NATIVE_COMMANDS.resumeCompanionSync) {
    return resumeDesktopCompanionSync(desktopSyncRuntimeIdentity())
      .then(() => buildDesktopCompanionPairingOverview());
  }
  if (command === NATIVE_COMMANDS.leaveSyncGroup) {
    return leaveDesktopSyncGroup()
      .then(() => stopLanWorkspaceSyncServer())
      .then(() => buildDesktopCompanionPairingOverview());
  }
  if (command === NATIVE_COMMANDS.removeSyncGroupMember) {
    return removeDesktopSyncGroupMember(asString(args.device_id, 'device_id'))
      .then(() => buildDesktopCompanionPairingOverview());
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
