import {
  advanceSyncPackDependencyDigest, SYNC_PACK_DEPENDENCY_INITIAL_DIGEST
} from '../../lib/core/sync/syncPackDependencyTransfer.js';
import type { SyncPackFactClaims, SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { buildDesktopSyncPackFromDriver, type BuildDesktopSyncPackInput } from '../database/syncPackBuilderFromDriver.js';
import { buildSyncPackDependencyPageArchive } from '../database/syncPackDependencyPageBuilder.js';
import type { SyncPackDependencyTable } from '../database/syncPackDependencyRows.js';
import { iterateSyncPackDependencyPages } from '../database/syncPackDependencySource.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../database/syncPackPageBudget.js';

import { createCompanionDependencySession, openCompanionDependencySession } from './companionLanDependencySession.js';
import { buildKnownFactPack } from './companionLanKnownFactPack.js';
import { activatePagedCompanionDependencySession } from './companionLanPagedDependencySession.js';

export async function buildCompanionDependencyPack(args: {
  url: URL; groupId: string; input: BuildDesktopSyncPackInput;
  facts?: { index: SyncPackFactIndex; receiverFacts: SyncPackFactClaims };
}) {
  const viewId = args.url.searchParams.get('dependency_view');
  const factViewId = args.url.searchParams.get('fact_view');
  if (viewId && factViewId) throw new Error('sync_pack_source_view_invalid');
  if (!args.input.toPeerId) throw new Error('node_version_pack_target_missing');
  const direct = factViewId && await buildKnownFactPack({ groupId: args.groupId, peerId: args.input.toPeerId, viewId: factViewId, input: args.input });
  if (direct) return direct;
  const session = viewId
    ? await openCompanionDependencySession(args.groupId, args.input.toPeerId, viewId)
    : factViewId ? await activatePagedCompanionDependencySession({ groupId: args.groupId,
      fromPeerId: args.input.fromPeerId, toPeerId: args.input.toPeerId, viewId: factViewId })
    : args.facts ? await createCompanionDependencySession({ groupId: args.groupId,
      fromPeerId: args.input.fromPeerId, toPeerId: args.input.toPeerId,
      index: args.facts.index, claims: args.facts.receiverFacts }) : null;
  if (!session) throw new Error('sync_pack_fact_probe_required');
  try {
    const { transfer, index } = session;
    if (index.from_state_seq !== args.input.fromStateSeq ||
        (args.input.sourceEpoch && args.input.sourceEpoch !== index.source_epoch) ||
        (args.input.frontierStateSeq !== undefined && args.input.frontierStateSeq !== index.frontier_state_seq)) {
      throw new Error('sync_pack_source_view_changed');
    }
    const afterRow = Number(args.url.searchParams.get('dependency_after_row') ?? '0');
    if (!Number.isSafeInteger(afterRow) || afterRow < 0 || afterRow > transfer.expectedRows) {
      throw new Error('sync_pack_dependency_page_not_contiguous');
    }
    if (afterRow === transfer.expectedRows) {
      const requestedDigest = args.url.searchParams.get('dependency_digest');
      if (requestedDigest !== transfer.expectedDigest &&
          !(session.claimDatabase && afterRow === 0 && !requestedDigest)) {
        throw new Error('sync_pack_dependency_prefix_changed');
      }
      return await buildFinalDependencyPack(args.input, session);
    }
    const beforeDigest = args.url.searchParams.get('dependency_digest') ?? SYNC_PACK_DEPENDENCY_INITIAL_DIGEST;
    const after = readPosition(args.url, afterRow);
    const source = { view: session.view, objectId: transfer.objectId, objectType: transfer.objectType,
      ...(transfer.nodeIds ? { nodeIds: transfer.nodeIds } : {}),
      claims: session.claims, ...(session.claimDatabase ? { claimDatabase: true } : {}),
      ...(after ? { after } : {}) };
    // Reduce the page, never the retained history, when encrypted wire bytes are the tighter bound.
    for (let rowLimit = 128; rowLimit >= 1; rowLimit = Math.floor(rowLimit / 2)) {
      const rows = iterateSyncPackDependencyPages({ ...source,
        budget: { rows: rowLimit, payloadBytes: 2 * 1024 * 1024 } }).next().value;
      if (!rows?.length) throw new Error('sync_pack_dependency_page_not_contiguous');
      const afterDigest = rows.reduce(advanceSyncPackDependencyDigest, beforeDigest);
      try {
        return await buildSyncPackDependencyPageArchive({
          page: { transfer, afterRow, beforeDigest, afterDigest, rows }, outputPath: args.input.outputPath,
          packId: args.input.packId, fromPeerId: args.input.fromPeerId, toPeerId: args.input.toPeerId,
          ...(args.input.restoreId ? { restoreId: args.input.restoreId } : {}) });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'sync_pack_dependency_page_over_budget' || rowLimit === 1) throw error;
      }
    }
    throw new Error('sync_pack_dependency_page_over_budget');
  } finally { session.view.close(); }
}

function buildFinalDependencyPack(input: BuildDesktopSyncPackInput,
  session: Awaited<ReturnType<typeof openCompanionDependencySession>>) {
  const { transfer, index } = session;
  return buildDesktopSyncPackFromDriver({ ...input, packId: transfer.sourceViewId,
    sourceEpoch: index.source_epoch, frontierStateSeq: index.frontier_state_seq,
    toStateSeq: index.to_state_seq, pageBudget: DEFAULT_SYNC_PACK_PAGE_BUDGET,
    receiverFacts: session.claims, dependencyTransfers: [transfer], requireDeliveryHold: false }, session.view.driver);
}

function readPosition(url: URL, afterRow: number) {
  if (afterRow === 0) return undefined;
  const table = url.searchParams.get('dependency_table');
  const key = url.searchParams.get('dependency_key');
  const ordinal = Number(url.searchParams.get('dependency_ordinal'));
  if (!table || !['node_sync_versions', 'node_sync_version_parents', 'review_log'].includes(table) ||
      !key || !Number.isSafeInteger(ordinal) || ordinal < -1) {
    throw new Error('sync_pack_dependency_resume_position_invalid');
  }
  return { table: table as SyncPackDependencyTable, position: { key, ordinal } };
}
