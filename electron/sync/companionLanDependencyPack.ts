import { advanceSyncPackDependencyDigest, SYNC_PACK_DEPENDENCY_INITIAL_DIGEST,
  type SyncPackDependencyTransfer } from '../../lib/core/sync/syncPackDependencyTransfer.js';
import type { SyncPackFactClaims, SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { buildDesktopSyncPackFromDriver, type BuildDesktopSyncPackInput } from '../database/syncPackBuilderFromDriver.js';
import { buildSyncPackDependencyPageArchive } from '../database/syncPackDependencyPageBuilder.js';
import type { SyncPackDependencyTable } from '../database/syncPackDependencyRows.js';
import { iterateSyncPackDependencyPages } from '../database/syncPackDependencySource.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../database/syncPackPageBudget.js';

import { createCompanionDependencySession, openCompanionDependencySession,
  type CompanionDependencySession } from './companionLanDependencySession.js';
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
    const { index } = session;
    if (index.from_state_seq !== args.input.fromStateSeq ||
        (args.input.sourceEpoch && args.input.sourceEpoch !== index.source_epoch) ||
        (args.input.frontierStateSeq !== undefined && args.input.frontierStateSeq !== index.frontier_state_seq)) {
      throw new Error('sync_pack_source_view_changed');
    }
    const transfers = session.transfers ?? [session.transfer];
    let transferIndex = requestedTransferIndex(args.url, transfers);
    let transfer = transfers[transferIndex]!;
    let afterRow = Number(args.url.searchParams.get('dependency_after_row') ?? '0');
    if (!Number.isSafeInteger(afterRow) || afterRow < 0 || afterRow > transfer.expectedRows) {
      throw new Error('sync_pack_dependency_page_not_contiguous');
    }
    let switched = false;
    while (afterRow === transfer.expectedRows) {
      const requestedDigest = args.url.searchParams.get('dependency_digest');
      if (!switched && requestedDigest !== transfer.expectedDigest &&
          !(session.claimDatabase && afterRow === 0 && !requestedDigest)) {
        throw new Error('sync_pack_dependency_prefix_changed');
      }
      if (transferIndex === transfers.length - 1) return await buildFinalDependencyPack(args.input, session);
      transfer = transfers[++transferIndex]!;
      afterRow = 0;
      switched = true;
    }
    const beforeDigest = switched ? SYNC_PACK_DEPENDENCY_INITIAL_DIGEST :
      args.url.searchParams.get('dependency_digest') ?? SYNC_PACK_DEPENDENCY_INITIAL_DIGEST;
    return await buildDependencyPage(args, session, transfer, afterRow, beforeDigest,
      switched ? undefined : readPosition(args.url, afterRow));
  } finally { session.view.close(); }
}

function requestedTransferIndex(url: URL, transfers: NonNullable<CompanionDependencySession['transfers']>) {
  const objectType = url.searchParams.get('dependency_object_type');
  const objectId = url.searchParams.get('dependency_object_id');
  if ((objectType === null) !== (objectId === null)) throw new Error('sync_pack_dependency_object_invalid');
  if (objectType === null) {
    if (transfers.length > 1 &&
        (url.searchParams.has('dependency_after_row') || url.searchParams.has('dependency_digest'))) {
      throw new Error('sync_pack_upgrade_required');
    }
    return 0;
  }
  const index = transfers.findIndex((transfer) =>
    transfer.objectType === objectType && transfer.objectId === objectId);
  if (index < 0) throw new Error('sync_pack_dependency_object_invalid');
  return index;
}

async function buildDependencyPage(args: Parameters<typeof buildCompanionDependencyPack>[0],
  session: Awaited<ReturnType<typeof openCompanionDependencySession>>,
  transfer: SyncPackDependencyTransfer, afterRow: number, beforeDigest: string,
  after?: ReturnType<typeof readPosition>) {
  const source = { view: session.view, objectId: transfer.objectId, objectType: transfer.objectType,
    ...(transfer.nodeIds ? { nodeIds: transfer.nodeIds } : {}), claims: session.claims,
    ...(session.claimDatabase ? { claimDatabase: true } : {}), ...(after ? { after } : {}) };
  const pageRows = iterateSyncPackDependencyPages({ ...source,
    budget: { rows: 128, payloadBytes: 2 * 1024 * 1024 } }).next().value;
  if (!pageRows?.length) throw new Error('sync_pack_dependency_page_not_contiguous');
  for (let rowLimit = 128; rowLimit >= 1; rowLimit = Math.floor(rowLimit / 2)) {
    const rows = pageRows.slice(0, rowLimit);
    const afterDigest = rows.reduce(advanceSyncPackDependencyDigest, beforeDigest);
    try {
      return await buildSyncPackDependencyPageArchive({
        page: { transfer, afterRow, beforeDigest, afterDigest, rows }, outputPath: args.input.outputPath,
        packId: args.input.packId, fromPeerId: args.input.fromPeerId, toPeerId: args.input.toPeerId!,
        ...(args.input.restoreId ? { restoreId: args.input.restoreId } : {}) });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'sync_pack_dependency_page_over_budget' || rowLimit === 1) throw error;
    }
  }
  throw new Error('sync_pack_dependency_page_over_budget');
}

function buildFinalDependencyPack(input: BuildDesktopSyncPackInput,
  session: Awaited<ReturnType<typeof openCompanionDependencySession>>) {
  const { transfer, index } = session;
  return buildDesktopSyncPackFromDriver({ ...input, packId: transfer.sourceViewId,
    sourceEpoch: index.source_epoch, frontierStateSeq: index.frontier_state_seq,
    toStateSeq: index.to_state_seq, pageBudget: DEFAULT_SYNC_PACK_PAGE_BUDGET,
    receiverFacts: session.claims, dependencyTransfers: session.transfers ?? [transfer],
    requireDeliveryHold: false }, session.view.driver);
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
