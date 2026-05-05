import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import { applySyncPackNodesWithDbPort } from '../../../lib/core/sync/syncPackNodeApplyExecutor';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import {
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from './companionSyncNodeVersions';

const INCOMING_PACK_ALIAS = 'inc';

export async function applyCompanionSyncPackNodesWithSharedCore(
  packPath: string,
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
) {
  const connection = await openCompanionDatabaseConnection(manager);
  const port = createCapacitorSqliteDbPort(connection);
  await port.run(`ATTACH DATABASE ${sqlString(packPath)} AS ${INCOMING_PACK_ALIAS}`);
  try {
    await applySyncPackNodesWithDbPort(port, { incomingAlias: INCOMING_PACK_ALIAS });
  } finally {
    await port.run(`DETACH DATABASE ${INCOMING_PACK_ALIAS}`);
  }
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
