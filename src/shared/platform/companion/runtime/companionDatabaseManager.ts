import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection, type CapacitorSQLitePlugin } from '@capacitor-community/sqlite';

import { COMPANION_DATABASE_NAME } from '../../../../../lib/platform/nativeCompanionContract';

/** Native connections survive document replacement; their transactions must not. */
export class CompanionDatabaseManager extends SQLiteConnection {
  constructor(private readonly nativePlugin: CapacitorSQLitePlugin) {
    super(nativePlugin);
  }

  override async closeConnection(database: string, readonly: boolean) {
    // createOwnedCompanionConnection only closes an unknown native connection after
    // a duplicate proves that the previous document left it behind.
    if (database === COMPANION_DATABASE_NAME && !readonly
      && !(await this.isConnection(database, readonly)).result) {
      const abandoned = new SQLiteDBConnection(database, readonly, this.nativePlugin);
      if ((await abandoned.isDBOpen()).result && (await abandoned.isTransactionActive()).result) {
        await abandoned.rollbackTransaction();
      }
    }
    await super.closeConnection(database, readonly);
  }
}

/** Delete a closed companion database through the trusted native connection adapter. */
export async function deleteCompanionDatabaseFiles(database: string, version: number) {
  if (!(await CapacitorSQLite.isDatabase({ database })).result) return;
  await CapacitorSQLite.createConnection({ database, encrypted: false, mode: 'no-encryption',
    version, readonly: false });
  try { await CapacitorSQLite.deleteDatabase({ database }); }
  finally { await CapacitorSQLite.closeConnection({ database, readonly: false }); }
}
