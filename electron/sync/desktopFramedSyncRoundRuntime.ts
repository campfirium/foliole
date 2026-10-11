import { expireFramedSyncFileCompletions } from '../../lib/core/sync/framedSyncFileCompletionRetention.js';
import type { FramedSyncFilePort } from '../../lib/core/sync/framedSyncFilePort.js';
import { createFramedSyncFileSessionNoncePort } from '../../lib/core/sync/framedSyncFileSession.js';
import { createFramedSyncFileStaging } from '../../lib/core/sync/framedSyncFileStaging.js';
import { loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

import { createDesktopLibrarySyncFiles } from './desktopFramedSyncFiles.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export async function loadRoundRuntime(peer: DesktopSyncGroupPeer, files?: FramedSyncFilePort | null) {
  const runtime = await runWithDatabaseConnectionOwner(async () => {
    const workgroup = loadDesktopWorkgroupKey(peer.group_id);
    if (!workgroup) throw new Error('sync_group_workgroup_key_missing');
    const connection = openDatabaseConnection();
    const storage = files === null ? undefined : files ?? createDesktopLibrarySyncFiles(connection.dbPath);
    const db = createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-framed-sync-round' });
    const adoption = await loadSyncGroupLocalAdoption(db);
    assertAdoptionSource(adoption, peer);
    return {
      adoption, db, ...(storage ? { files: storage } : {}),
      groupKey: new Uint8Array(Buffer.from(workgroup.group_key, 'base64url')),
      groupSecret: workgroup.group_key,
      noncePort: storage ? createFramedSyncFileSessionNoncePort(storage) : createDesktopFramedSyncSessionNoncePort(db),
      staging: storage ? createFramedSyncFileStaging(storage) : createDesktopFramedSyncStaging(db)
    };
  });
  if (runtime.files) await expireFramedSyncFileCompletions(runtime.files);
  return runtime;
}

function assertAdoptionSource(
  adoption: Awaited<ReturnType<typeof loadSyncGroupLocalAdoption>>, peer: DesktopSyncGroupPeer
) {
  if (adoption && (adoption.providerDeviceId !== peer.peer_device_id || adoption.groupId !== peer.group_id)) {
    throw new Error('sync_group_local_adoption_source_mismatch');
  }
}
