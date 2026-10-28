import path from 'node:path';

import Database from 'better-sqlite3';

import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';
import { createFakeCapacitorConnection, installCompanionNodeSchema } from '../../companionSyncNodeVersionsTestSupport';
import { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner';

export async function openContentEditDatabase(directory: string, now: string) {
  const database = new Database(path.join(directory, 'companion.db'));
  database.transaction(() => {
    installCompanionNodeSchema(database);
    database.pragma(`user_version = ${COMPANION_DATABASE_VERSION}`);
    database.prepare('INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)').run('device_id', 'test-mobile', now);
  })();
  const connection = { ...createFakeCapacitorConnection(database),
    getUrl: async () => ({ url: path.join(directory, 'companion.db') }) };
  const manager = {
    closeConnection: async () => undefined, createConnection: async () => connection,
    isConnection: async () => ({ result: true }), isDatabase: async () => ({ result: true }),
    retrieveConnection: async () => connection
  };
  const owner = new CapacitorCompanionDatabaseOwner(manager as never, 'ios');
  await owner.open({ expectedHostName: 'mobile', now });
  return { database, owner };
}

export async function insertContentEditNode(owner: CapacitorCompanionDatabaseOwner, value: WorkspaceNodeSnapshot, versionId: string) {
  const record = await toWorkspaceNativeNodeVersion(value, 'remote', versionId);
  await owner.runWriter((db) => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
}
