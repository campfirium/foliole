import { parentFactKey } from '../../lib/core/sync/syncPackFactPresence.js';
import { openDatabaseConnection } from '../database/connection.js';
import { buildDesktopSyncPackFromDriver, type BuildDesktopSyncPackInput } from '../database/syncPackBuilderFromDriver.js';
import { readDesktopSyncPackFactPage } from '../database/syncPackFactPage.js';
import { stageDesktopSyncPackNodeHolds } from '../database/syncPackNodeVersionHolds.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../database/syncPackPageBudget.js';
import { loadPackRows, loadPresentSyncPackStateRows } from '../database/syncPackRows.js';
import { loadSyncPackTombstoneRows } from '../database/syncPackTombstoneRows.js';
import { syncPackVersionHeads } from '../database/syncPackVersionHeads.js';

import { openCompanionFactSession } from './companionLanFactSession.js';

export async function buildKnownFactPack(args: {
  groupId: string; peerId: string; viewId: string; input: BuildDesktopSyncPackInput;
}) {
  const fact = await openCompanionFactSession(args.groupId, args.peerId, args.viewId);
  try {
    const progress = fact.view.driver.queryOne<{ completed: number }>(
      'SELECT completed FROM fact_claims.progress WHERE singleton_id = 1');
    if (progress?.completed !== 1) throw new Error('sync_pack_fact_claims_incomplete');
    if (fact.window.fromStateSeq !== args.input.fromStateSeq ||
        (args.input.sourceEpoch && args.input.sourceEpoch !== fact.window.sourceEpoch) ||
        (args.input.frontierStateSeq !== undefined &&
          args.input.frontierStateSeq !== fact.window.frontierStateSeq)) {
      throw new Error('sync_pack_source_view_changed');
    }
    const changed = loadPresentSyncPackStateRows(fact.view.driver,
      fact.window.fromStateSeq, fact.window.toStateSeq)[0];
    if (changed?.object_type === 'node' || changed?.object_type === 'node_review') return null;

    if (!allKnownFactsHeld(fact)) return null;
    const pack = await buildDesktopSyncPackFromDriver({ ...args.input, packId: args.viewId,
      sourceEpoch: fact.window.sourceEpoch, frontierStateSeq: fact.window.frontierStateSeq,
      toStateSeq: fact.window.toStateSeq, allFactsKnown: true, dependencyTransfers: [],
      pageBudget: DEFAULT_SYNC_PACK_PAGE_BUDGET, requireDeliveryHold: false }, fact.view.driver);
    holdKnownFactPackHeads(fact, args.viewId, args.input.fromPeerId, args.peerId);
    return pack;
  } finally { fact.view.close(); }
}

function allKnownFactsHeld(fact: Awaited<ReturnType<typeof openCompanionFactSession>>) {
  let after: Parameters<typeof readDesktopSyncPackFactPage>[2];
  while (true) {
    const page = readDesktopSyncPackFactPage(fact.view.driver, fact.window, after);
    for (const [kind, rows, key] of [
      ['versions', page.index.versions, (row: { version_id: string }) => row.version_id],
      ['parents', page.index.parents, parentFactKey],
      ['reviews', page.index.reviews, (row: { op_id: string }) => row.op_id]
    ] as const) for (const row of rows) {
      const factKey = key(row as never);
      const held = fact.view.driver.queryOne<{ fact_json: string }>(
        'SELECT fact_json FROM fact_claims.known_facts WHERE kind = ? AND fact_key = ?',
        [kind, factKey]);
      if (held?.fact_json !== JSON.stringify(row)) return false;
    }
    if (page.complete) return true;
    after = page.next!;
  }
}

function holdKnownFactPackHeads(fact: Awaited<ReturnType<typeof openCompanionFactSession>>,
  packId: string, fromPeerId: string, toPeerId: string) {
  const nodes = knownFactHeads(fact);
  const knownVersionIds = nodes.map((node) => node.current_version_id).filter((id): id is string => Boolean(id));
  openDatabaseConnection().driver.transaction((driver) => {
    const existing = driver.queryAll<{ object_id: string; version_id: string }>(
      'SELECT object_id, version_id FROM node_version_outbound_holds WHERE pack_id = ?', [packId]);
    if (existing.length) {
      const expected = nodes.filter((node) => node.current_version_id)
        .map((node) => `${node.id}:${node.current_version_id}`).sort();
      if (JSON.stringify(existing.map((row) => `${row.object_id}:${row.version_id}`).sort()) !==
          JSON.stringify(expected)) throw new Error('node_version_pack_hold_changed');
      return;
    }
    stageDesktopSyncPackNodeHolds({ createdAt: new Date().toISOString(), driver,
      fromPeerId, nodes, packId, toPeerId, versions: [], knownVersionIds });
  });
}

export async function restoreKnownFactReceiptHolds(args: {
  groupId: string; peerId: string; packId: string; fromPeerId: string;
  results: Array<{ objectId: string; sentVersionId: string }>;
}) {
  if (!args.results.length) return;
  const driver = openDatabaseConnection().driver;
  if (driver.queryOne('SELECT 1 FROM node_version_outbound_holds WHERE pack_id = ? LIMIT 1',
    [args.packId])) return;
  const fact = await openCompanionFactSession(args.groupId, args.peerId, args.packId);
  try {
    if (fact.view.driver.queryOne<{ completed: number }>(
      'SELECT completed FROM fact_claims.progress WHERE singleton_id = 1')?.completed !== 1) return;
    if (!allKnownFactsHeld(fact)) return;
    const nodes = knownFactHeads(fact);
    const expected = nodes.filter((node) => node.current_version_id)
      .map((node) => `${node.id}:${node.current_version_id}`).sort();
    const received = args.results.map((row) => `${row.objectId}:${row.sentVersionId}`).sort();
    if (JSON.stringify(expected) !== JSON.stringify(received)) return;
    holdKnownFactPackHeads(fact, args.packId, args.fromPeerId, args.peerId);
  } finally { fact.view.close(); }
}

function knownFactHeads(fact: Awaited<ReturnType<typeof openCompanionFactSession>>) {
  return syncPackVersionHeads(fact.view.driver,
    loadPackRows(fact.window.fromStateSeq, fact.window.toStateSeq, fact.view.driver).nodes,
    loadSyncPackTombstoneRows(fact.view.driver, fact.window));
}
