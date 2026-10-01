import type http from 'node:http';

import { SYNC_PACK_NODE_DEPENDENCY_OBJECT_TYPES } from '../../lib/core/sync/syncPackDependencyTransfer.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { backfillMissingNodeSyncState } from '../database/nodeSyncStateRows.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { loadDesktopSyncPackFactIndex } from '../database/syncPackFactIndex.js';
import { readDesktopSyncPackFactPage } from '../database/syncPackFactPage.js';
import { selectDesktopSyncPackFactWindow } from '../database/syncPackFactWindow.js';
import { backfillMissingTombstoneSyncState } from '../database/syncPackTombstoneStateBackfill.js';

import { createCompanionFactSession, readCompanionFactSessionPage } from './companionLanFactSession.js';
import { isCompanionRestoreSourceAvailable } from './companionLanRestoreSource.js';
import { openCompanionSourceRoundView } from './companionLanSourceRoundView.js';

export const SYNC_PACK_FACTS_PATH = '/companion/sync-pack-facts';

function stateSeq(value: string | null, fallback?: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(parsed)) {
    throw new Error('invalid_sync_pack_fact_request');
  }
  return parsed;
}

export function loadCompanionSyncPackFactIndex(url: URL, peerId?: string) {
  const fromStateSeq = stateSeq(url.searchParams.get('after_state_seq'), 0)!;
  const frontierStateSeq = stateSeq(url.searchParams.get('frontier_state_seq'));
  const sourceEpoch = url.searchParams.get('source_epoch') ?? undefined;
  if (url.searchParams.get('page_contract') !== 'bounded-v1' ||
      (frontierStateSeq === undefined) !== (sourceEpoch === undefined) ||
      (sourceEpoch !== undefined && !sourceEpoch.trim())) {
    throw new Error('invalid_sync_pack_fact_request');
  }
  const group = peerId && loadDesktopSyncGroup();
  const requestedRoundId = url.searchParams.get('round_source_view_id');
  if (requestedRoundId !== null && !/^[a-f0-9-]{36}$/u.test(requestedRoundId)) {
    throw new Error('invalid_sync_pack_fact_request');
  }
  const round = group && frontierStateSeq !== undefined && sourceEpoch
    ? openCompanionSourceRoundView({ groupId: group.group_id, peerId,
      frontierStateSeq, sourceEpoch }) : null;
  try {
    if (url.searchParams.has('fact_index_id') && round && !requestedRoundId) {
      throw new Error('sync_pack_upgrade_required');
    }
    if (url.searchParams.has('fact_index_id') &&
        (requestedRoundId !== (round?.sourceViewId ?? null))) {
      throw new Error('sync_pack_source_view_unavailable');
    }
    if (!round) {
      flushDirtyNodeSyncVersions(new Date().toISOString());
      backfillMissingNodeSyncState(openDatabaseConnection().driver, false);
      backfillMissingTombstoneSyncState(openDatabaseConnection().driver);
    }
    const driver = round?.driver ?? openDatabaseConnection().driver;
    const index = driver.transaction((tx) => loadDesktopSyncPackFactIndex(tx, {
      fromStateSeq,
      ...(frontierStateSeq === undefined ? {} : { frontierStateSeq }),
      ...(sourceEpoch === undefined ? {} : { sourceEpoch })
    }));
    return round ? { ...index, round_source_view_id: round.sourceViewId } : index;
  } finally { round?.close(); }
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
  if (viewId) return readExistingFactPage(url, peerId, viewId,
    fromStateSeq, frontierStateSeq, sourceEpoch);
  return readFreshFactPage(url, peerId, fromStateSeq, frontierStateSeq, sourceEpoch);
}

async function readExistingFactPage(url: URL, peerId: string, viewId: string,
  fromStateSeq: number, frontierStateSeq?: number, sourceEpoch?: string) {
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

async function readFreshFactPage(url: URL, peerId: string, fromStateSeq: number,
  frontierStateSeq?: number, sourceEpoch?: string) {
  if (url.searchParams.has('fact_index_id') || url.searchParams.has('have_v') ||
      url.searchParams.has('have_p') || url.searchParams.has('have_r')) {
    throw new Error('invalid_sync_pack_fact_request');
  }
  const group = loadDesktopSyncGroup();
  const round = group && frontierStateSeq !== undefined && sourceEpoch
    ? openCompanionSourceRoundView({ groupId: group.group_id, peerId,
      frontierStateSeq, sourceEpoch }) : null;
  try {
    if (!round && frontierStateSeq !== undefined) {
      throw new Error('sync_pack_source_view_unavailable');
    }
    if (!round) {
      flushDirtyNodeSyncVersions(new Date().toISOString());
      backfillMissingNodeSyncState(openDatabaseConnection().driver, false);
      backfillMissingTombstoneSyncState(openDatabaseConnection().driver);
    }
    const driver = round?.driver ?? openDatabaseConnection().driver;
    const preview = driver.transaction((tx) => {
      const window = selectDesktopSyncPackFactWindow(tx, { fromStateSeq,
        ...(frontierStateSeq === undefined ? {} : { frontierStateSeq }),
        ...(sourceEpoch === undefined ? {} : { sourceEpoch }) });
      const dependencyObjects = tx.queryAll(`SELECT 1 FROM sync_object_state
        WHERE state_seq > ? AND state_seq <= ?
          AND object_type IN (${SYNC_PACK_NODE_DEPENDENCY_OBJECT_TYPES.map(() => '?').join(', ')})
          AND (deleted_at IS NULL OR object_type = 'node') LIMIT 2`,
      [window.fromStateSeq, window.toStateSeq, ...SYNC_PACK_NODE_DEPENDENCY_OBJECT_TYPES]);
      return { window, page: readDesktopSyncPackFactPage(tx, window),
        multiObject: dependencyObjects.length > 1 };
    });
    const hasFacts = preview.page.index.versions.length + preview.page.index.parents.length +
      preview.page.index.reviews.length > 0;
    if (preview.page.complete && (!preview.multiObject || !hasFacts)) {
      const direct = new URL(url);
      direct.searchParams.set('frontier_state_seq', String(preview.window.frontierStateSeq));
      direct.searchParams.set('source_epoch', preview.window.sourceEpoch);
      return loadCompanionSyncPackFactIndex(direct, peerId);
    }
    if (!group) throw new Error('sync_group_local_device_missing');
    const session = await createCompanionFactSession({ groupId: group.group_id, toPeerId: peerId,
      window: preview.window, freshRound: frontierStateSeq === undefined });
    try {
      return { source_view_id: session.view.sourceViewId,
        ...readDesktopSyncPackFactPage(session.view.driver, session.window) };
    } finally { session.view.close(); }
  } finally { round?.close(); }
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
      const restoreId = url.searchParams.get('restore_id');
      const group = loadDesktopSyncGroup();
      if (restoreId !== null && (!group || !restoreId.trim() ||
          !isCompanionRestoreSourceAvailable(group.group_id,
            group.local_device_identity_key, restoreId))) {
        throw new Error('sync_group_restore_source_unavailable');
      }
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
