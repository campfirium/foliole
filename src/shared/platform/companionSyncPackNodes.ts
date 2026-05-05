import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import { applySyncPackNodeSurfaceWithDbPort } from '../../../lib/core/sync/syncPackNodeApplyExecutor';
import type { NativeSyncPackApplyResult } from '../../../lib/platform/nativeSyncContract';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import {
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from './companionSyncNodeVersions';

const INCOMING_PACK_ALIAS = 'inc';

export async function applyCompanionSyncPackNodesWithSharedCore(
  args: { currentCursor: number; deviceId: string; packPath: string },
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
) {
  const connection = await openCompanionDatabaseConnection(manager);
  const port = createCapacitorSqliteDbPort(connection);
  await port.run(`ATTACH DATABASE ${sqlString(args.packPath)} AS ${INCOMING_PACK_ALIAS}`);
  try {
    return await applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: args.currentCursor,
      deviceId: args.deviceId,
      incomingAlias: INCOMING_PACK_ALIAS
    }).then((result) => ({
      ...result,
      applied_blob_count: result.appliedBlobCount,
      applied_object_count: result.appliedObjectCount,
      appliedPackBlobCount: result.appliedBlobCount,
      appliedPackObjectCount: result.appliedObjectCount,
      applied_review_op_ids: result.appliedReviewOpIds,
      to_state_seq: result.toStateSeq
    } satisfies NativeSyncPackApplyResult & typeof result & {
      appliedPackBlobCount: number;
      appliedPackObjectCount: number;
    }));
  } finally {
    await port.run(`DETACH DATABASE ${INCOMING_PACK_ALIAS}`);
  }
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
