import { loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export function loadRoundRuntime(peer: DesktopSyncGroupPeer) {
  return runWithDatabaseConnectionOwner(async () => {
    const workgroup = loadDesktopWorkgroupKey(peer.group_id);
    if (!workgroup) throw new Error('sync_group_workgroup_key_missing');
    const connection = openDatabaseConnection();
    const db = createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-framed-sync-round' });
    const adoption = await loadSyncGroupLocalAdoption(db);
    assertAdoptionSource(adoption, peer);
    return {
      adoption, db,
      groupKey: new Uint8Array(Buffer.from(workgroup.group_key, 'base64url')),
      groupSecret: workgroup.group_key,
      noncePort: createDesktopFramedSyncSessionNoncePort(db),
      staging: createDesktopFramedSyncStaging(db)
    };
  });
}

function assertAdoptionSource(
  adoption: Awaited<ReturnType<typeof loadSyncGroupLocalAdoption>>, peer: DesktopSyncGroupPeer
) {
  if (adoption && (adoption.providerDeviceId !== peer.peer_device_id || adoption.groupId !== peer.group_id)) {
    throw new Error('sync_group_local_adoption_source_mismatch');
  }
}
