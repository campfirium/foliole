import { COMPANION_DATABASE_NAME, COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';

import type { CapacitorCompanionDatabaseManager } from './capacitorCompanionDatabaseOwner';

const DUPLICATE_CONNECTION = `Connection ${COMPANION_DATABASE_NAME} already exists`;

/**
 * The plugin wrapper only tracks connections of the current document, while native
 * connections live until the app process ends. The database owner is the sole holder of
 * the companion connections, so a native duplicate this document does not know about was
 * left by a replaced document (renderer reload) and is closed by name before retrying once.
 */
export async function createOwnedCompanionConnection(
  manager: CapacitorCompanionDatabaseManager,
  readonly: boolean
): ReturnType<CapacitorCompanionDatabaseManager['createConnection']> {
  const create = () => manager.createConnection(
    COMPANION_DATABASE_NAME, false, 'no-encryption', COMPANION_DATABASE_VERSION, readonly
  );
  try {
    return await create();
  } catch (error) {
    if (!isDuplicateConnection(error)) throw error;
    if ((await manager.isConnection(COMPANION_DATABASE_NAME, readonly)).result) throw error;
    await manager.closeConnection(COMPANION_DATABASE_NAME, readonly);
    return create();
  }
}

function isDuplicateConnection(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).includes(DUPLICATE_CONNECTION);
}
