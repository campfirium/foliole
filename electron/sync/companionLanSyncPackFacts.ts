import type http from 'node:http';

import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { backfillMissingNodeSyncState } from '../database/nodeSyncStateRows.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';
import { loadDesktopSyncPackFactIndex } from '../database/syncPackFactIndex.js';
import { backfillMissingTombstoneSyncState } from '../database/syncPackTombstoneStateBackfill.js';

export const SYNC_PACK_FACTS_PATH = '/companion/sync-pack-facts';

function stateSeq(value: string | null, fallback?: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(parsed)) {
    throw new Error('invalid_sync_pack_fact_request');
  }
  return parsed;
}

export function loadCompanionSyncPackFactIndex(url: URL) {
  const fromStateSeq = stateSeq(url.searchParams.get('after_state_seq'), 0)!;
  const frontierStateSeq = stateSeq(url.searchParams.get('frontier_state_seq'));
  const sourceEpoch = url.searchParams.get('source_epoch') ?? undefined;
  if (url.searchParams.get('page_contract') !== 'bounded-v1' ||
      (frontierStateSeq === undefined) !== (sourceEpoch === undefined) ||
      (sourceEpoch !== undefined && !sourceEpoch.trim())) {
    throw new Error('invalid_sync_pack_fact_request');
  }
  flushDirtyNodeSyncVersions(new Date().toISOString());
  const driver = openDatabaseConnection().driver;
  backfillMissingNodeSyncState(driver, false);
  backfillMissingTombstoneSyncState(driver);
  return driver.transaction((tx) => loadDesktopSyncPackFactIndex(tx, {
    fromStateSeq,
    ...(frontierStateSeq === undefined ? {} : { frontierStateSeq }),
    ...(sourceEpoch === undefined ? {} : { sourceEpoch })
  }));
}

export async function handleCompanionSyncPackFactsGet(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  url: URL,
  writeJson: (request: http.IncomingMessage, response: http.ServerResponse,
    statusCode: number, payload: unknown) => void
) {
  if (url.pathname !== SYNC_PACK_FACTS_PATH) return false;
  try {
    await runWithDatabaseConnectionOwner(() => {
      const index = loadCompanionSyncPackFactIndex(url);
      writeJson(request, response, 200, index);
    });
  } catch (error) {
    await runWithDatabaseConnectionOwner(() => writeJson(request, response, 409, {
      error: error instanceof Error ? error.message : 'sync_pack_fact_index_failed'
    }));
  }
  return true;
}
