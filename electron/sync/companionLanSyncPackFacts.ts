import type http from 'node:http';

import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { backfillMissingNodeSyncState } from '../database/nodeSyncStateRows.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { loadDesktopSyncPackFactIndex } from '../database/syncPackFactIndex.js';
import { readDesktopSyncPackFactPage, selectDesktopSyncPackFactWindow } from '../database/syncPackFactPage.js';
import { backfillMissingTombstoneSyncState } from '../database/syncPackTombstoneStateBackfill.js';

import { createCompanionFactSession, readCompanionFactSessionPage } from './companionLanFactSession.js';

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

async function loadCompanionSyncPackFacts(url: URL, peerId: string) {
  const fromStateSeq = stateSeq(url.searchParams.get('after_state_seq'), 0)!;
  const frontierStateSeq = stateSeq(url.searchParams.get('frontier_state_seq'));
  const sourceEpoch = url.searchParams.get('source_epoch') ?? undefined;
  if (url.searchParams.get('page_contract') !== 'bounded-v1' ||
      (frontierStateSeq === undefined) !== (sourceEpoch === undefined) ||
      (sourceEpoch !== undefined && !sourceEpoch.trim())) {
    throw new Error('invalid_sync_pack_fact_request');
  }
  const viewId = url.searchParams.get('fact_view');
  if (viewId) {
    const group = loadDesktopSyncGroup();
    if (!group) throw new Error('sync_group_local_device_missing');
    const previousIndexId = url.searchParams.get('fact_index_id') ?? undefined;
    const claimBits = previousIndexId ? { versions: url.searchParams.get('have_v') ?? '',
      parents: url.searchParams.get('have_p') ?? '', reviews: url.searchParams.get('have_r') ?? '' } : undefined;
    const page = await readCompanionFactSessionPage({ groupId: group.group_id, peerId,
      viewId, ...(previousIndexId ? { previousIndexId } : {}),
      ...(claimBits ? { claimBits } : {}) });
    const index = 'index' in page ? page.index : page;
    if (index.from_state_seq !== fromStateSeq ||
        (frontierStateSeq !== undefined && index.frontier_state_seq !== frontierStateSeq) ||
        (sourceEpoch && index.source_epoch !== sourceEpoch)) {
      throw new Error('sync_pack_fact_index_changed');
    }
    return page;
  }
  if (url.searchParams.has('fact_index_id') || url.searchParams.has('have_v') ||
      url.searchParams.has('have_p') || url.searchParams.has('have_r')) {
    throw new Error('invalid_sync_pack_fact_request');
  }
  if (frontierStateSeq !== undefined) {
    const current = openDatabaseConnection().driver.queryOne<{ high_water: number }>(
      'SELECT high_water FROM sync_state_sequence WHERE singleton_id = 1');
    if (current && current.high_water > frontierStateSeq) {
      throw new Error('sync_pack_source_view_unavailable');
    }
  }
  flushDirtyNodeSyncVersions(new Date().toISOString());
  const driver = openDatabaseConnection().driver;
  backfillMissingNodeSyncState(driver, false);
  backfillMissingTombstoneSyncState(driver);
  const preview = driver.transaction((tx) => {
    const window = selectDesktopSyncPackFactWindow(tx, { fromStateSeq,
      ...(frontierStateSeq === undefined ? {} : { frontierStateSeq }),
      ...(sourceEpoch === undefined ? {} : { sourceEpoch }) });
    return { window, page: readDesktopSyncPackFactPage(tx, window) };
  });
  if (preview.page.complete) return loadCompanionSyncPackFactIndex(url);
  const group = loadDesktopSyncGroup();
  if (!group) throw new Error('sync_group_local_device_missing');
  const session = await createCompanionFactSession({ groupId: group.group_id, toPeerId: peerId,
    window: preview.window });
  try {
    return { source_view_id: session.view.sourceViewId,
      ...readDesktopSyncPackFactPage(session.view.driver, session.window) };
  } finally { session.view.close(); }
}

export async function handleCompanionSyncPackFactsGet(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  url: URL,
  peerId: string,
  writeJson: (request: http.IncomingMessage, response: http.ServerResponse,
    statusCode: number, payload: unknown) => void
) {
  if (url.pathname !== SYNC_PACK_FACTS_PATH) return false;
  try {
    await runWithDatabaseConnectionOwner(async () => {
      const index = await loadCompanionSyncPackFacts(url, peerId);
      writeJson(request, response, 200, index);
    });
  } catch (error) {
    await runWithDatabaseConnectionOwner(() => writeJson(request, response, 409, {
      error: error instanceof Error ? error.message : 'sync_pack_fact_index_failed'
    }));
  }
  return true;
}
