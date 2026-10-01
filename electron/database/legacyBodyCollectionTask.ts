import { readDataMigrationState } from '../../lib/core/database/dataMigrationState.js';
import { submitDesktopOperation } from '../desktopOperations.js';
import type { DesktopTaskHandle } from '../desktopTaskTypes.js';

import { openDatabaseConnection, registerDatabaseConnectionCleanup, runWithDatabaseConnectionOwner } from './connection.js';
import { runLegacyBodyCollectionWorker } from './legacyBodyCollectionWorkerClient.js';
import { BODY_COLLECTION_ID } from './legacyBodyMigrationState.js';

let active: DesktopTaskHandle | null = null;
let generation = 0;
registerDatabaseConnectionCleanup(() => {
  generation++;
  active?.cancel();
  active = null;
});

export async function startLegacyBodyCollectionTask() {
  const library = await runWithDatabaseConnectionOwner(() => {
    const connection = openDatabaseConnection();
    if (readDataMigrationState(connection.sqlite, BODY_COLLECTION_ID)?.status === 'completed') return null;
    return { dbPath: connection.dbPath, generation };
  });
  if (!library || active) return;
  scheduleBatch(library);
}

function scheduleBatch(library: { dbPath: string; generation: number }) {
  if (library.generation !== generation) return;
  const handle = submitDesktopOperation('legacy-body-collection', {
    run: async (context) => {
      await runWithDatabaseConnectionOwner(() => {
        context.signal.throwIfAborted();
        if (library.generation !== generation || openDatabaseConnection().dbPath !== library.dbPath) {
          throw new Error('body_collection_library_changed');
        }
      });
      return runLegacyBodyCollectionWorker(library.dbPath, 32, context.signal);
    }
  });
  active = handle;
  void handle.promise.then((result) => {
    if (active === handle) active = null;
    const status = result as { completed: boolean; paused?: boolean } | undefined;
    if (status && !status.completed && !status.paused) scheduleBatch(library);
  }).catch((error) => {
    if (active === handle) active = null;
    console.error('[database] legacy body collection paused until next library open', error);
  });
}
