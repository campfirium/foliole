import type { IncomingMessage, ServerResponse } from 'node:http';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../../electron/database/connection.js';
import { handleProductionCompanionFramedSyncPost } from '../../electron/sync/companionLanFramedSyncRoute.js';

import { prepareIosHostedRequestResources } from './ios-hosted-request-resources.js';
import { seedIosHostedRequestLibrary } from './ios-hosted-request-seed.js';
import { advanceIosHostedRequestSuccessor } from './ios-hosted-request-successor.js';
import { readIosHostedStateWritebackFacts } from './ios-hosted-state-writeback-facts.mjs';
import type { createIosSyncPackAcceptanceObservations } from './ios-sync-pack-acceptance-observations.js';

export function createIosHostedRequestScenario(
  deviceId: string,
  observations: ReturnType<typeof createIosSyncPackAcceptanceObservations>,
  options: { seed: 'legal' | 'stateInitial' | 'contentResource'; stateObservations?: { persisted: unknown } } = { seed: 'legal' }
) {
  let preparation: Promise<void> | null = null;
  return async (request: IncomingMessage, response: ServerResponse) => {
    preparation ??= prepareRequestScenario(options.seed);
    await preparation;
    await handleProductionCompanionFramedSyncPost({ deviceId, request, response });
    if (options.seed === 'contentResource') return;
    if (options.seed === 'stateInitial') {
      if (options.stateObservations) options.stateObservations.persisted = await runWithDatabaseConnectionOwner(() =>
        readIosHostedStateWritebackFacts(openDatabaseConnection().sqlite));
      return;
    }
    const facts = await runWithDatabaseConnectionOwner(advanceIosHostedRequestSuccessor);
    if (!facts.ready) return;
    observations.capture_node_id = facts.captureNodeId!;
    observations.received_version_ids = [facts.captureVersionId!, facts.restoreVersionId!];
    observations.successor_version_id = facts.successorVersionId!;
  };
}

async function prepareRequestScenario(seed: 'legal' | 'stateInitial' | 'contentResource') {
  const databasePath = await runWithDatabaseConnectionOwner(async () => {
    const connection = openDatabaseConnection();
    await seedIosHostedRequestLibrary(createBetterSqliteDbPort(connection.sqlite), seed);
    return connection.dbPath;
  });
  if (seed === 'contentResource') await prepareIosHostedRequestResources(databasePath);
}
