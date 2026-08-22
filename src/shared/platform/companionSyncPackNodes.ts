import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import type { DbPort } from '../../../lib/core/sync/dbPort';
import { assertSyncPackCursorAdvance } from '../../../lib/core/sync/syncPackCursorGuard';
import { applySyncPackNodeSurfaceWithDbPort } from '../../../lib/core/sync/syncPackNodeApplyExecutor';
import type { NativeSyncPackApplyResult } from '../../../lib/platform/nativeSyncContract';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import type { CompanionSyncPackCursorStore } from './companion/sync/cursor/companionSyncPackCursorStore';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from './companionSyncNodeVersions';

const INCOMING_PACK_ALIAS = 'inc';

export async function applyCompanionSyncPackPathWithSharedCore(
  args: {
    deviceId: string;
    hostName: string;
    packPath: string;
    sourcePeerId: string;
    sourceHostName?: string;
  },
  cursorStore: CompanionSyncPackCursorStore,
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
) {
  const currentCursor = await cursorStore.loadCursor();
  const result = await applyCompanionSyncPackNodesWithSharedCore({
    currentCursor: currentCursor ?? 0,
    deviceId: args.deviceId,
    hostName: args.hostName,
    packPath: args.packPath,
    ...(args.sourceHostName === undefined ? {} : { sourceHostName: args.sourceHostName }),
    sourcePeerId: args.sourcePeerId
  }, manager);
  assertSyncPackCursorAdvance({
    appliedFactCount: result.applied_group_fact_count,
    appliedObjectCount: result.applied_object_count,
    currentCursor: currentCursor ?? 0,
    handledConflictCount: result.handled_conflict_count ?? 0,
    toStateSeq: result.to_state_seq
  });
  if (result.to_state_seq > (currentCursor ?? 0)) {
    await cursorStore.saveCursor(result.to_state_seq);
  }
  return result;
}

export async function applyCompanionSyncPackNodesWithSharedCore(
  args: {
    currentCursor: number;
    deviceId: string;
    hostName: string;
    packPath: string;
    sourceHostName?: string;
    sourcePeerId: string;
  },
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
) {
  const connection = await openCompanionDatabaseConnection(manager);
  const port = createCapacitorSqliteDbPort(connection);
  try {
    return await applyCompanionSyncPackNodesWithDbPort(args, port);
  } finally {
    await closeCompanionDatabaseConnection(manager, connection);
  }
}

export async function applyCompanionSyncPackNodesWithDbPort(
  args: {
    currentCursor: number;
    deviceId: string;
    hostName: string;
    packPath: string;
    sourceHostName?: string;
    sourcePeerId: string;
  },
  port: DbPort
) {
  await port.run(`ATTACH DATABASE ${sqlString(args.packPath)} AS ${INCOMING_PACK_ALIAS}`);
  try {
    return await applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: args.currentCursor,
      hostName: args.hostName,
      incomingAlias: INCOMING_PACK_ALIAS,
      ...(args.sourceHostName === undefined ? {} : { sourceHostName: args.sourceHostName }),
      sourcePeerId: args.sourcePeerId
    }).then((result) => ({
      ...result,
      applied_blob_count: result.appliedBlobCount,
      applied_group_fact_count: result.appliedGroupFactCount,
      applied_object_count: result.appliedObjectCount,
      appliedPackBlobCount: result.appliedBlobCount,
      appliedPackObjectCount: result.appliedObjectCount,
      applied_review_op_ids: result.appliedReviewOpIds,
      handled_conflict_count: result.handledConflictCount,
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
