import { app } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resolveLocalSyncGroupDevice } from '../../lib/platform/syncGroupContract.js';
import { resolveFolioleAppVersion } from '../appVersion.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import {
  createDesktopSyncGroup,
  leaveDesktopSyncGroupDevice,
  loadDesktopSyncGroup,
  newSyncGroupId
} from '../database/syncGroupStore.js';
import { loadDesktopDeviceIdentity } from '../deviceAnchorStore.js';
import { getMainWindow } from '../mainWindowRegistry.js';
import { resolveDesktopHostName } from '../sync/companionLanPayloads.js';
import {
  activateDesktopCompanionSync,
  assertDesktopCompanionSyncParticipating,
  disableDesktopCompanionSync,
  enableDesktopCompanionSync,
  pauseDesktopCompanionSync,
  resumeDesktopCompanionSync
} from '../sync/desktopCompanionSyncParticipation.js';
import { loadDesktopCompanionSyncParticipation } from '../sync/desktopCompanionSyncPreference.js';
import { runDesktopSyncCoordinator } from '../sync/desktopSyncCoordinator.js';
import { DesktopSyncGroupDiscoverySession } from '../sync/desktopSyncGroupDiscoverySession.js';
import { completeDesktopSyncGroupJoin, requestDesktopSyncGroupJoin } from '../sync/desktopSyncGroupJoin.js';
import { loadDesktopSyncGroupJoinProvider } from '../sync/desktopSyncGroupJoinProvider.js';
import { loadDesktopSyncGroupJoinState, saveDesktopSyncGroupCandidates } from '../sync/desktopSyncGroupJoinState.js';
import { getLanWorkspaceSyncServerStatus, stopLanWorkspaceSyncServer } from '../sync/lanWorkspaceSyncServer.js';

import { asString } from './commandParsers.js';
import { IPC_SYNC_GROUP_DISCOVERY_CHANGED_CHANNEL } from './contracts.js';

const discovery = new DesktopSyncGroupDiscoverySession((snapshot) => {
  saveDesktopSyncGroupCandidates(snapshot.candidates);
  getMainWindow()?.webContents.send(IPC_SYNC_GROUP_DISCOVERY_CHANGED_CHANNEL, snapshot);
});

const COMMANDS = new Set<string>([
  NATIVE_COMMANDS.loadSyncGroupOverview, NATIVE_COMMANDS.createSyncGroup,
  NATIVE_COMMANDS.leaveSyncGroup, NATIVE_COMMANDS.discoverSyncGroups,
  NATIVE_COMMANDS.stopDiscoverSyncGroups, NATIVE_COMMANDS.requestSyncGroupJoin,
  NATIVE_COMMANDS.completeSyncGroupJoin, NATIVE_COMMANDS.enableCompanionSync,
  NATIVE_COMMANDS.disableCompanionSync, NATIVE_COMMANDS.pauseCompanionSync,
  NATIVE_COMMANDS.resumeCompanionSync, NATIVE_COMMANDS.syncCompanionNow,
  NATIVE_COMMANDS.acceptSyncGroupJoinRequest, NATIVE_COMMANDS.rejectSyncGroupJoinRequest
]);

function runtimeIdentity() {
  const group = loadDesktopSyncGroup();
  const local = group ? resolveLocalSyncGroupDevice(group) : null;
  return { appVersion: resolveFolioleAppVersion(app), deviceId: local?.device_identity_key ?? 'unavailable' };
}

function overview() {
  const group = loadDesktopSyncGroup();
  const local = group ? resolveLocalSyncGroupDevice(group) : null;
  const join = loadDesktopSyncGroupJoinState();
  return {
    current_device: local ? { device_name: local.device_name, platform: local.platform } : null,
    join_candidates: join.candidates,
    join_request: join.pending?.request ?? null,
    join_requests: loadDesktopSyncGroupJoinProvider()?.pending() ?? [],
    server_status: getLanWorkspaceSyncServerStatus(),
    sync_group: group,
    ...loadDesktopCompanionSyncParticipation()
  };
}

async function createGroup() {
  const connection = openDatabaseConnection();
  const groupId = newSyncGroupId();
  const { identity } = await loadDesktopDeviceIdentity({ groupId, libraryPath: connection.dbPath });
  createDesktopSyncGroup({ device: identity, deviceName: resolveDesktopHostName(), platform: process.platform });
  await activateDesktopCompanionSync(runtimeIdentity());
  return overview();
}

async function leaveGroup() {
  const group = loadDesktopSyncGroup();
  if (group) leaveDesktopSyncGroupDevice(group.local_device_identity_key);
  await stopLanWorkspaceSyncServer();
  return overview();
}

async function mutateJoinRequest(command: string, args: Record<string, unknown>) {
  const provider = loadDesktopSyncGroupJoinProvider();
  if (!provider) throw new Error('sync_group_not_available');
  const requestId = asString(args.request_id, 'request_id');
  if (command === NATIVE_COMMANDS.acceptSyncGroupJoinRequest) await provider.accept(requestId);
  else provider.reject(requestId);
  return overview();
}

async function handleOwned(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadSyncGroupOverview) return overview();
  if (command === NATIVE_COMMANDS.createSyncGroup) return createGroup();
  if (command === NATIVE_COMMANDS.leaveSyncGroup) return leaveGroup();
  if (command === NATIVE_COMMANDS.discoverSyncGroups) return discovery.start();
  if (command === NATIVE_COMMANDS.stopDiscoverSyncGroups) return discovery.stop();
  if (command === NATIVE_COMMANDS.requestSyncGroupJoin) {
    assertDesktopCompanionSyncParticipating();
    await requestDesktopSyncGroupJoin(asString(args.endpoint_url, 'endpoint_url'));
    return overview();
  }
  if (command === NATIVE_COMMANDS.completeSyncGroupJoin) {
    await completeDesktopSyncGroupJoin();
    return runWithDatabaseConnectionOwner(async () => {
      await activateDesktopCompanionSync(runtimeIdentity());
      return overview();
    });
  }
  if (command === NATIVE_COMMANDS.enableCompanionSync) await enableDesktopCompanionSync(runtimeIdentity());
  else if (command === NATIVE_COMMANDS.disableCompanionSync) await disableDesktopCompanionSync();
  else if (command === NATIVE_COMMANDS.pauseCompanionSync) await pauseDesktopCompanionSync();
  else if (command === NATIVE_COMMANDS.resumeCompanionSync) await resumeDesktopCompanionSync(runtimeIdentity());
  else if (command === NATIVE_COMMANDS.syncCompanionNow) {
    await runDesktopSyncCoordinator('manual');
    return runWithDatabaseConnectionOwner(() => overview());
  }
  else return mutateJoinRequest(command, args);
  return overview();
}

export function handleSyncGroupCommand(command: string, args: Record<string, unknown>) {
  if (!COMMANDS.has(command)) return undefined;
  if (command === NATIVE_COMMANDS.completeSyncGroupJoin || command === NATIVE_COMMANDS.syncCompanionNow) {
    return handleOwned(command, args);
  }
  return runWithDatabaseConnectionOwner(() => handleOwned(command, args));
}
