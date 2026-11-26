import path from 'node:path';

import Database from 'better-sqlite3';

import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { createFakeCapacitorConnection } from '../../companionSyncNodeVersionsTestSupport';
import { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner';

export async function openContentEditDatabase(directory: string, now: string, platform: 'android' | 'ios' = 'ios') {
  const database = new Database(path.join(directory, 'companion.db'));
  const connection = { ...createFakeCapacitorConnection(database),
    getUrl: async () => ({ url: path.join(directory, 'companion.db') }) };
  const manager = {
    closeConnection: async () => undefined, createConnection: async () => connection,
    isConnection: async () => ({ result: true }), isDatabase: async () => ({ result: false }),
    retrieveConnection: async () => connection
  };
  const owner = new CapacitorCompanionDatabaseOwner(manager as never, platform);
  try {
    await owner.open({ expectedHostName: 'mobile', now });
  } catch (error) {
    database.close();
    throw error;
  }
  return { database, owner };
}

export async function insertContentEditNode(owner: CapacitorCompanionDatabaseOwner, value: WorkspaceNodeSnapshot, versionId: string) {
  const record = await toWorkspaceNativeNodeVersion(value, 'remote', versionId);
  await owner.runWriter((db) => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }), { kind: 'business' });
}
