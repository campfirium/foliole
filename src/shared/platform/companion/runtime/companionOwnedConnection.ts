import { COMPANION_DATABASE_NAME, COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';

import type { CapacitorCompanionDatabaseManager } from './capacitorCompanionDatabaseOwner';

/**
 * The plugin wrapper only tracks connections of the current document, while native
 * connections live until the app process ends. The database owner is the sole holder of
 * the companion connections, so a native duplicate this document does not know about was
 * left by a replaced document (renderer reload) and is closed by name before retrying once.
 */
export async function createOwnedCompanionConnection(
  manager: CapacitorCompanionDatabaseManager,
  readonly: boolean,
  database = COMPANION_DATABASE_NAME,
  version = COMPANION_DATABASE_VERSION
): ReturnType<CapacitorCompanionDatabaseManager['createConnection']> {
  const create = () => manager.createConnection(
    database, false, 'no-encryption', version, readonly
  );
  try {
    return await create();
  } catch (error) {
    if (!isDuplicateConnection(error, database)) throw error;
    if ((await manager.isConnection(database, readonly)).result) throw error;
    await manager.closeConnection(database, readonly);
    return create();
  }
}

function isDuplicateConnection(error: unknown, database: string) {
  return (error instanceof Error ? error.message : String(error)).includes(`Connection ${database} already exists`);
}
