import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { openDatabaseConnection } from '../database/connection.js';
import { describeSyncPackDependencySource, iterateSyncPackDependencyPages } from '../database/syncPackDependencySource.js';

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
    const object = fact.view.driver.queryOne<{
      object_type: 'node' | 'node_review'; object_id: string; state_seq: number;
    }>(`SELECT object_type, object_id, state_seq FROM sync_object_state
      WHERE state_seq > ? AND state_seq <= ? AND object_type IN ('node', 'node_review')
        AND deleted_at IS NULL
      ORDER BY state_seq, CASE object_type WHEN 'node_review' THEN 0 ELSE 1 END LIMIT 1`,
    [fact.window.fromStateSeq, fact.window.toStateSeq]);
    if (!object) throw new Error('sync_pack_dependency_object_unavailable');
    const nodeIds = fact.view.driver.queryAll<{ id: string }>(`WITH RECURSIVE ancestors(id, parent_id) AS (
      SELECT id, parent_id FROM nodes WHERE id = ?
      UNION SELECT parent.id, parent.parent_id FROM nodes parent
        JOIN ancestors child ON child.parent_id = parent.id
    ) SELECT id FROM ancestors LIMIT 129`, [object.object_id]).map((row) => row.id);
    if (!nodeIds.includes(object.object_id) || nodeIds.length > 128) {
      throw new Error('sync_pack_dependency_ancestry_over_budget');
    }
    const description = describeSyncPackDependencySource({ view: fact.view,
      objectId: object.object_id, objectType: object.object_type, nodeIds,
      claimDatabase: true,
      budget: { rows: 128, payloadBytes: 2 * 1024 * 1024 } });
    const identity = { from_state_seq: fact.window.fromStateSeq,
      to_state_seq: fact.window.toStateSeq, frontier_state_seq: fact.window.frontierStateSeq,
      source_epoch: fact.window.sourceEpoch, index_id: progress.current_index_id,
      versions: [], parents: [], reviews: [] } satisfies SyncPackFactIndex;
    const session: CompanionDependencySession = { index: identity,
      claims: { versions: [], parents: [], reviews: [] }, toPeerId: args.toPeerId,
      claimDatabase: true, transfer: { ...description,
        groupId: args.groupId, peerId: args.fromPeerId, sourceViewId: args.viewId,
        sourceEpoch: fact.window.sourceEpoch, objectType: object.object_type,
        objectId: object.object_id, nodeIds, fromStateSeq: fact.window.fromStateSeq,
        objectStateSeq: object.state_seq, frontierStateSeq: fact.window.frontierStateSeq } };
    const root = path.join(sessionRoot(args.groupId, args.toPeerId), args.viewId);
    const staged = path.join(root, 'session.json.preparing');
    await fs.writeFile(staged, JSON.stringify(session), { mode: 0o600 });
    holdPagedSourceFacts(session, fact.view);
    await fs.rename(staged, path.join(root, 'session.json'));
  } finally { fact.view.close(); }
  return openCompanionDependencySession(args.groupId, args.toPeerId, args.viewId);
}

function holdPagedSourceFacts(session: CompanionDependencySession,
  view: Awaited<ReturnType<typeof openCompanionFactSession>>['view']) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    for (const objectId of session.transfer.nodeIds ?? [session.transfer.objectId]) {
      const head = view.driver.queryOne<{ current_version_id: string }>(
        'SELECT current_version_id FROM nodes WHERE id = ?', [objectId]);
      if (!head?.current_version_id) continue;
      tx.execute(`INSERT OR IGNORE INTO node_version_outbound_holds
        (pack_id, group_id, device_identity_key, object_id, version_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`, [session.transfer.sourceViewId, session.transfer.groupId,
        session.toPeerId, objectId, head.current_version_id,
        new Date().toISOString()]);
    }
    for (const page of iterateSyncPackDependencyPages({ view, objectId: session.transfer.objectId,
      objectType: session.transfer.objectType,
      ...(session.transfer.nodeIds ? { nodeIds: session.transfer.nodeIds } : {}),
      claimDatabase: true,
      budget: { rows: 128, payloadBytes: 2 * 1024 * 1024 } })) {
      for (const row of page) {
        if (row.table !== 'node_sync_versions') continue;
        const payload = JSON.parse(row.json) as { version_id: string; object_id: string; body_text: string | null };
        if (payload.body_text === null) continue;
        tx.execute(`INSERT OR IGNORE INTO node_version_outbound_payload_holds
          (pack_id, object_id, version_id) VALUES (?, ?, ?)`,
        [session.transfer.sourceViewId, payload.object_id, payload.version_id]);
      }
    }
  });
}
