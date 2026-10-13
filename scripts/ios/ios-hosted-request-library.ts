import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { openDatabaseConnection, resolveDatabasePath, runWithDatabaseConnectionOwner } from '../../electron/database/connection.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { loadDesktopSyncGroupMemberState } from '../../electron/database/syncGroupMemberStateStore.js';
import { createDesktopSyncGroup, loadDesktopSyncGroupInfo, registerSyncGroupDevice } from '../../electron/database/syncGroupStore.js';
import { acceptDesktopSyncGroupMemberState } from '../../electron/sync/desktopSyncGroupMemberState.js';
import { IOS_HOSTED_PROVIDER_DEVICE_ID, IOS_HOSTED_PROVIDER_NAME, IOS_HOSTED_SYNC_GROUP_ID } from '../../lib/platform/iosHostedSyncGroupContract.js';
import type { SyncGroupJoinRequestInput } from '../../lib/platform/syncGroupJoinContract.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

/** The fixture owns the isolated path and schema; this adapter uses the production membership owner. */
export async function createIosHostedRequestLibrary(input: { databasePath: string; workgroupKey: string }) {
  const assertLibrary = () => {
    const home = process.env.FOLIOLE_LIBRARY_HOME;
    const relative = home ? path.relative(path.resolve(home), path.resolve(input.databasePath)) : '..';
    if (!home || relative.startsWith('..') || path.isAbsolute(relative) || resolveDatabasePath() !== input.databasePath) {
      throw new Error('ios_hosted_request_library_mismatch');
    }
  };
  const withLibrary = <T>(action: () => T) => runWithDatabaseConnectionOwner(() => {
    assertLibrary();
    return action();
  });
  await withLibrary(() => {
    const [, groupId, anchor, libraryPath] = JSON.parse(IOS_HOSTED_PROVIDER_DEVICE_ID) as string[];
    createDesktopSyncGroup({ device: createSyncGroupDeviceIdentity({ group_id: groupId!,
      device_anchor: anchor!, library_path: libraryPath!, path_flavor: 'posix' }),
    deviceName: IOS_HOSTED_PROVIDER_NAME, displayName: 'Acceptance Sync Group', platform: 'macOS',
    workgroupKey: input.workgroupKey });
    const group = loadDesktopSyncGroupInfo();
    if (group?.group_id !== IOS_HOSTED_SYNC_GROUP_ID || group.workgroup_key !== input.workgroupKey ||
        loadDesktopSyncGroupMemberState().sender_device_identity_key !== IOS_HOSTED_PROVIDER_DEVICE_ID) {
      throw new Error('ios_hosted_request_group_mismatch');
    }
  });
  return {
    registerAcceptedDevice: (device: SyncGroupJoinRequestInput['device']) => withLibrary(() => {
      registerSyncGroupDevice({ device: createSyncGroupDeviceIdentity({ group_id: IOS_HOSTED_SYNC_GROUP_ID,
        device_anchor: device.device_anchor, library_path: device.canonical_library_path,
        path_flavor: device.path_flavor }), deviceName: device.device_name, platform: device.platform });
    }),
    acceptMemberState: (bodyText: string, authenticatedDeviceId: string) => withLibrary(() =>
      acceptDesktopSyncGroupMemberState(bodyText, authenticatedDeviceId)),
    memberState: () => withLibrary(() => loadDesktopSyncGroupMemberState())
  };
}

export async function initializeIosHostedRequestLibrary(artifactDir: string, workgroupKey: string) {
  process.env.FOLIOLE_LIBRARY_HOME = path.resolve(artifactDir, 'library');
  const runtimeRoot = path.resolve(artifactDir, 'runtime');
  mkdirSync(runtimeRoot, { recursive: true });
  app.setPath('userData', runtimeRoot);
  await app.whenReady();
  await initializeDatabase(undefined, { deferSearchIndex: true, recovery: 'fail' });
  return createIosHostedRequestLibrary({ databasePath: openDatabaseConnection().dbPath, workgroupKey });
}
