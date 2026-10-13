import path from 'node:path';

import { afterEach, beforeEach } from 'vitest';

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';

export let mockedRequestProjectionAppDataDir = '/tmp/request-projection';
let fixture: Awaited<ReturnType<typeof restoreFixture>>;
export function setupRequestProjection() {
  beforeEach(async () => {
    fixture = await restoreFixture();
    mockedRequestProjectionAppDataDir = path.join(fixture.root, 'owner');
    initializeDatabaseConnection(openDatabaseConnection());
    initializeDesktopDeviceProfileFixture();
  });
  afterEach(async () => { closeDatabaseConnection(); await fixture.close(); });
}
export const projectionPeer = (id: string) => fixture.peer(id);
export const ownerPort = () => createBetterSqliteDbPort(openDatabaseConnection().sqlite);

export async function transferProjection(source: DbPort, target: DbPort) {
  const files = createDesktopFramedSyncFiles(path.join(fixture.root, crypto.randomUUID()));
  const [proof] = await source.query<{ library_epoch: string; proof_revision: number }>(
    'SELECT library_epoch, proof_revision FROM node_version_local_proof_state');
  const [receiver] = await target.query<{ library_epoch: string }>('SELECT library_epoch FROM node_version_local_proof_state');
  const [member] = await target.query<{ local_device_identity_key: string }>('SELECT local_device_identity_key FROM sync_group_local_state');
  const [sender] = await source.query<{ local_device_identity_key: string }>('SELECT local_device_identity_key FROM sync_group_local_state');
  const senderId = sender?.local_device_identity_key ?? 'source';
  for (const entry of compareFramedSyncInventories({ local: await readFramedSyncInventory(source), remote: [] })) {
    await withRequestSyncFiles(files, async request => {
      await writeRequestSyncSnapshot(source, { ...entry, direction: 'local_to_remote' }, request);
      await applyRequestSyncObject(target, {
        context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
          senderDeviceId: senderId, senderLibraryEpoch: proof!.library_epoch,
          receiverDeviceId: member!.local_device_identity_key, receiverLibraryEpoch: receiver!.library_epoch },
        peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: senderId,
          ...proof!, devices: [], removals: [], restore: null, source_proof_revisions: {} },
        globalId: entry.globalId, objectType: entry.objectType, requestId: new Uint8Array(16),
        facts: () => request.readFacts(), loadBody: (_db, blob) => request.loadBody(blob), enqueueSearchInvalidations: false
      });
    });
  }
}
