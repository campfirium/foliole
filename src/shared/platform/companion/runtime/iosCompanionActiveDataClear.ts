import { ANDROID_COMPANION_APP_DATA_CLEAR_MUTATIONS } from '../../../../../lib/core/database/androidCompanionAppDataClearMutationDefinitions';
import { ANDROID_COMPANION_MUTATION_DEFINITIONS } from '../../../../../lib/core/database/androidCompanionMutationDefinitions';
import { loadIosCompanionWorkspaceSyncState } from '../sync/workspace-state/iosCompanionWorkspaceSyncStateStore';

import { writeIosCompanionDatabase } from './iosCompanionActiveDatabase';

export async function clearIosCompanionActiveData() {
  await writeIosCompanionDatabase((db) => db.transaction(async (tx) => {
    const tables = new Set((await tx.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    )).map((row) => row.name));
    for (const mutation of ANDROID_COMPANION_APP_DATA_CLEAR_MUTATIONS) {
      if (!tables.has(mutation.table)) continue;
      await tx.run(ANDROID_COMPANION_MUTATION_DEFINITIONS[mutation.statementName]);
    }
    await tx.run(ANDROID_COMPANION_MUTATION_DEFINITIONS.companionMetaDeleteExceptDeviceId);
  }));
  return loadIosCompanionWorkspaceSyncState();
}
