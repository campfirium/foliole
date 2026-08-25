import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { createCapacitorSqliteDbPort } from '../../capacitorSqliteDbPort';

export interface IosSyncGroupMigrationAcceptanceDatabase {
  db: DbPort;
  name: string;
}

export async function openIosSyncGroupMigrationAcceptanceDatabases(fault: string) {
  const manager = new SQLiteConnection(CapacitorSQLite);
  const names = ['library-a', 'library-b', 'registry'].map((name) => `foliole-t151-${fault}-${name}`);
  const databases: IosSyncGroupMigrationAcceptanceDatabase[] = [];
  try {
    for (const name of names) {
      await CapacitorSQLite.deleteDatabase({ database: name, readonly: false }).catch(() => undefined);
      const connection = await manager.createConnection(name, false, 'no-encryption', 1, false);
      await connection.open();
      databases.push({ db: createCapacitorSqliteDbPort(connection, 'ios'), name });
    }
    return {
      close: () => closeDatabases(manager, databases),
      databases
    };
  } catch (error) {
    await closeDatabases(manager, databases);
    throw error;
  }
}

async function closeDatabases(
  manager: SQLiteConnection,
  databases: IosSyncGroupMigrationAcceptanceDatabase[]
) {
  for (const database of [...databases].reverse()) {
    await manager.closeConnection(database.name, false).catch(() => undefined);
    await CapacitorSQLite.deleteDatabase({ database: database.name, readonly: false }).catch(() => undefined);
  }
}
