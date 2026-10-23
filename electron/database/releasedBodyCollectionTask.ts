import { submitDesktopOperation } from '../desktopOperations.js';
import type { DesktopTaskHandle } from '../desktopTaskTypes.js';

import { openDatabaseConnection, registerDatabaseConnectionCleanup, runWithDatabaseConnectionOwner } from './connection.js';
import { runReleasedBodyCollectionWorker } from './releasedBodyCollectionWorkerClient.js';

const BATCH_SIZE = 4;

let pending = new Set<string>();
let dbPath: string | null = null;
let active: DesktopTaskHandle | null = null;
let generation = 0;
registerDatabaseConnectionCleanup(() => {
  generation++;
  pending = new Set();
  dbPath = null;
  active?.cancel();
  active = null;
});

/** Collects released text bodies off the main thread; uncollected bodies only cost storage. */
export function enqueueReleasedBodyCollection(hashes: readonly string[]) {
  if (hashes.length === 0) return;
  dbPath = openDatabaseConnection().dbPath;
  for (const hash of hashes) pending.add(hash);
  if (!active) scheduleBatch(generation);
}

function scheduleBatch(scheduledGeneration: number) {
  const library = dbPath;
  const batch = [...pending].slice(0, BATCH_SIZE);
  if (scheduledGeneration !== generation || !library || batch.length === 0) return;
  const handle = submitDesktopOperation('released-body-collection', {
    run: async (context) => {
      await runWithDatabaseConnectionOwner(() => {
        context.signal.throwIfAborted();
        if (scheduledGeneration !== generation || openDatabaseConnection().dbPath !== library) {
          throw new Error('body_collection_library_changed');
        }
      });
      return runReleasedBodyCollectionWorker(library, batch, context.signal);
    }
  });
  active = handle;
  void handle.promise.then(() => {
    for (const hash of batch) pending.delete(hash);
    if (active === handle) active = null;
    scheduleBatch(scheduledGeneration);
  }).catch((error) => {
    if (active === handle) active = null;
    if (scheduledGeneration === generation) pending = new Set();
    console.error('[database] released body collection stopped', error);
  });
}
