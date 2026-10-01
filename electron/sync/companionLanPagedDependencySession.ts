import { promises as fs, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { CHAIN_HEAD_SQL } from '../../lib/core/sync/nodeVersionChainSql.js';
import { SYNC_PACK_NODE_DEPENDENCY_OBJECT_TYPES,
  type SyncPackDependencyRow, type SyncPackDependencyTransfer,
  type SyncPackNodeDependencyObjectType } from '../../lib/core/sync/syncPackDependencyTransfer.js';
import type { SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { openDatabaseConnection } from '../database/connection.js';
import { describeSyncPackDependencySource } from '../database/syncPackDependencySource.js';
import { loadPresentSyncPackStateRows } from '../database/syncPackRows.js';

import { openCompanionDependencySession, sessionRoot,
  type CompanionDependencySession } from './companionLanDependencySession.js';
import { openCompanionFactSession } from './companionLanFactSession.js';

export async function activatePagedCompanionDependencySession(args: {
  groupId: string; fromPeerId: string; toPeerId: string; viewId: string;
}) {
  const fact = await openCompanionFactSession(args.groupId, args.toPeerId, args.viewId);
  try {
    const [progress] = fact.view.driver.queryAll<{ completed: number; current_index_id: string }>(
      'SELECT completed, current_index_id FROM fact_claims.progress WHERE singleton_id = 1');
    if (progress?.completed !== 1) throw new Error('sync_pack_fact_claims_incomplete');
    const objects = loadPresentSyncPackStateRows(fact.view.driver,
      fact.window.fromStateSeq, fact.window.toStateSeq)
      .filter((row) => SYNC_PACK_NODE_DEPENDENCY_OBJECT_TYPES.some((type) => type === row.object_type))
      .map((row) => ({ ...row, object_type: row.object_type as SyncPackNodeDependencyObjectType }))
      .sort((left, right) => left.state_seq - right.state_seq ||
        Number(right.object_type === 'node_review') - Number(left.object_type === 'node_review'));
    if (!objects.length || objects.length > 128) throw new Error('sync_pack_dependency_object_unavailable');
    const identity = { from_state_seq: fact.window.fromStateSeq,
      to_state_seq: fact.window.toStateSeq, frontier_state_seq: fact.window.frontierStateSeq,
      source_epoch: fact.window.sourceEpoch, index_id: progress.current_index_id,
      versions: [], parents: [], reviews: [] } satisfies SyncPackFactIndex;
    const root = path.join(sessionRoot(args.groupId, args.toPeerId), args.viewId);
    const staged = path.join(root, 'session.json.preparing');
    openDatabaseConnection().driver.transaction((tx) => {
      const heldHeads = new Set<string>();
      const transfers = objects.map((object) => describePagedTransfer(fact, args, object, tx, heldHeads));
      const session: CompanionDependencySession = { index: identity,
        claims: { versions: [], parents: [], reviews: [] }, toPeerId: args.toPeerId,
        claimDatabase: true, transfer: transfers[0]!, transfers };
      writeFileSync(staged, JSON.stringify(session), { mode: 0o600 });
    });
    await fs.rename(staged, path.join(root, 'session.json'));
  } finally { fact.view.close(); }
  return openCompanionDependencySession(args.groupId, args.toPeerId, args.viewId);
}

function describePagedTransfer(fact: Awaited<ReturnType<typeof openCompanionFactSession>>,
  args: Parameters<typeof activatePagedCompanionDependencySession>[0], object: {
    object_type: SyncPackNodeDependencyObjectType; object_id: string; state_seq: number;
  }, tx: DatabaseDriver, heldHeads: Set<string>): SyncPackDependencyTransfer {
  const nodeIds = fact.view.driver.queryAll<{ id: string }>(`WITH RECURSIVE ancestors(id, parent_id) AS (
    SELECT id, parent_id FROM nodes WHERE id = ?
    UNION SELECT parent.id, parent.parent_id FROM nodes parent
      JOIN ancestors child ON child.parent_id = parent.id
  ) SELECT id FROM ancestors LIMIT 129`, [object.object_id]).map((row) => row.id);
  if ((nodeIds.length > 0 && !nodeIds.includes(object.object_id)) || nodeIds.length > 128) {
    throw new Error('sync_pack_dependency_ancestry_over_budget');
  }
  holdPagedNodeHeads(tx, fact.view, args, nodeIds.length ? nodeIds : [object.object_id], heldHeads);
  const description = describeSyncPackDependencySource({ view: fact.view,
    objectId: object.object_id, objectType: object.object_type,
    ...(nodeIds.length ? { nodeIds } : {}),
    claimDatabase: true, budget: { rows: 128, payloadBytes: 2 * 1024 * 1024 },
    onRow: (row) => holdPagedPayload(tx, args.viewId, row) });
  return { ...description, groupId: args.groupId, peerId: args.fromPeerId,
    sourceViewId: args.viewId, sourceEpoch: fact.window.sourceEpoch,
    objectType: object.object_type, objectId: object.object_id,
    ...(nodeIds.length ? { nodeIds } : {}),
    fromStateSeq: fact.window.fromStateSeq, objectStateSeq: object.state_seq,
    frontierStateSeq: fact.window.frontierStateSeq };
}

function holdPagedNodeHeads(tx: DatabaseDriver,
  view: Awaited<ReturnType<typeof openCompanionFactSession>>['view'],
  args: Parameters<typeof activatePagedCompanionDependencySession>[0], nodeIds: string[], heldHeads: Set<string>) {
  for (const objectId of nodeIds) {
    if (heldHeads.has(objectId)) continue;
    heldHeads.add(objectId);
    const head = view.driver.queryOne<{ current_version_id: string }>(
      CHAIN_HEAD_SQL, [objectId]);
    if (!head?.current_version_id) continue;
    tx.execute(`INSERT OR IGNORE INTO node_version_outbound_holds
      (pack_id, group_id, device_identity_key, object_id, version_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`, [args.viewId, args.groupId, args.toPeerId,
      objectId, head.current_version_id, new Date().toISOString()]);
  }
}

function holdPagedPayload(tx: DatabaseDriver, packId: string, row: SyncPackDependencyRow) {
  if (row.table !== 'node_sync_versions') return;
  const payload = JSON.parse(row.json) as { version_id: string; object_id: string; body_text: string | null };
  if (payload.body_text === null) return;
  tx.execute(`INSERT OR IGNORE INTO node_version_outbound_payload_holds
    (pack_id, object_id, version_id) VALUES (?, ?, ?)`,
  [packId, payload.object_id, payload.version_id]);
}
