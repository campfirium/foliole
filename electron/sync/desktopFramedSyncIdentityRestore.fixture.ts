import path from 'node:path';

import { beginSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { saveBackupSettings } from '../database/backupSettings.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';

import { runDesktopFramedSyncInventoryRound } from './desktopFramedSyncInventoryRound.js';

type FixtureContext = Readonly<{ bodyStorage: 'continuous' | 'chunked'; deviceId: string; stateRoot: string }>;

export async function runIdentityRestoreFixtureCommand(action: string,
  args: Readonly<Record<string, unknown>>, context: FixtureContext) {
  if (context.bodyStorage !== 'chunked') throw new Error('fixture_chunked_restore_required');
  if (typeof args.peerOrigin !== 'string' || typeof args.peerDeviceId !== 'string' ||
      (args.mode !== 'restore' && args.mode !== 'adoption') || typeof args.restoreId !== 'string') {
    throw new Error('fixture_identity_restore_input_invalid');
  }
  const groupId = 't326-group';
  if (action === 'begin_identity_restore') {
    const directory = path.join(context.stateRoot, 'identity-restore-backups');
    saveBackupSettings({ backup_dir: directory });
    const db = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
    await db.transaction(async (tx) => {
      if (args.mode === 'restore') await receiveSyncGroupRestoreEvent(tx, {
        group_id: groupId, restore_id: String(args.restoreId), restored_at: '2026-10-07T08:00:00.000Z',
        source_device_identity_key: String(args.peerDeviceId)
      });
      else await beginSyncGroupLocalAdoption(tx, {
        endpointUrl: String(args.peerOrigin), groupId, libraryEpoch: `${context.deviceId}-epoch`,
        providerDeviceId: String(args.peerDeviceId), providerDeviceName: String(args.peerDeviceId), providerPlatform: 'desktop'
      });
    });
    return { directory };
  }
  return runDesktopFramedSyncInventoryRound({
    bodyStorage: context.bodyStorage,
    localLibraryEpoch: `${context.deviceId}-epoch`, remoteLibraryEpoch: `${args.peerDeviceId}-epoch`,
    ...(args.mode === 'restore' ? { restoreId: args.restoreId } : {}),
    peer: { endpoint_url: args.peerOrigin, group_id: groupId, local_device_id: context.deviceId,
      peer_device_id: args.peerDeviceId, peer_device_name: args.peerDeviceId, peer_platform: 'desktop' }
  });
}
