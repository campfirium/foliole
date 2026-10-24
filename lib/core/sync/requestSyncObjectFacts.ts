import { DELETED_NODE_SQL, releaseDeletedNodeBodiesWithPort } from '../database/deletedNodeBodyRelease.js';
import { collectTextBodyBlobCandidatesWithPort } from '../database/textBodyBlobCollection.js';

import { reconcileCurrentNodeBodies, reconcileCurrentNodeBody } from './currentNodeBodyProjection.js';
import type { DbPort } from './dbPort.js';
import type { FramedFactSource } from './framedSyncFactApply.js';
import { parseFramedSyncNodeChildIdentity } from './framedSyncNodeChildFact.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { REQUEST_CHAIN_HEAD_SQL } from './requestSyncBodyReferencePolicy.js';
import { collectRequestSyncBodiesForNodes } from './requestSyncBodyRetention.js';
import { assertCurrentNodeParentChain, assertCurrentNodeParentChains } from './syncNodeParentChain.js';

type ReceivedObject = { globalId: string; objectType: string; currentVersionId?: string; facts: FramedFactSource;
  enqueueSearchInvalidations?: boolean };

/** Facts of one received object; version, relation or text facts mean its stored bodies need collection. */
export function receivedObjectFacts(input: ReceivedObject, onBodies: () => void): FramedFactSource {
  return async function* (port, kinds) {
    for await (const fact of input.facts(port, kinds)) {
      if (fact.globalId !== input.globalId || fact.objectType !== input.objectType) {
        throw new Error('request_sync_object_identity_mismatch');
      }
      if (input.objectType === 'node' && (fact.kind === 2 || fact.kind === 3 ||
          (fact.kind === 1 && parseFramedSyncNodeChildIdentity(fact.factId).objectType === 'node_text_alternative'))) {
        onBodies();
      }
      yield fact;
    }
  };
}

export async function changesCurrentVersion(db: DbPort, input: ReceivedObject) {
  if (input.objectType !== 'node' || !input.currentVersionId) return false;
  const [node] = await db.query<{ current_version_id: string | null }>(REQUEST_CHAIN_HEAD_SQL, [input.globalId]);
  return node?.current_version_id !== input.currentVersionId;
}

/** Projection checks and body bookkeeping that follow applying one received node. */
export async function finishReceivedNode(tx: DbPort, input: ReceivedObject, collectBodies: boolean) {
  if (input.objectType === 'node') {
    await assertCurrentNodeParentChain(tx, input.globalId);
    await reconcileCurrentNodeBody(tx, input.globalId, input.enqueueSearchInvalidations ?? true);
    await releaseReceivedDeletionBodies(tx, input.globalId);
  }
  if (collectBodies) await collectNodeVersionPayloads(tx, input.globalId, Number.MAX_SAFE_INTEGER);
}

/** Whether each received node moves its current version, read for the whole batch at once. */
export async function changedCurrentVersions(db: DbPort, inputs: readonly ReceivedObject[]) {
  const referenced = inputs.filter(input => input.objectType === 'node' && input.currentVersionId);
  const rows = referenced.length ? await db.query<{ id: string; current_version_id: string | null }>(
    `SELECT requested.value AS id, COALESCE(node.current_version_id, tomb.version_id) AS current_version_id
     FROM json_each(?) requested LEFT JOIN nodes node ON node.id = requested.value
     LEFT JOIN node_sync_tombstones tomb ON tomb.node_id = requested.value`,
    [JSON.stringify(referenced.map(input => input.globalId))]) : [];
  const current = new Map(rows.map(row => [row.id, row.current_version_id]));
  return new Map(inputs.map(input => [input.globalId, Boolean(input.objectType === 'node' && input.currentVersionId &&
    current.get(input.globalId) !== input.currentVersionId)]));
}

/** The same follow-up as finishReceivedNode for a batch of nodes, with each check read once for all of them. */
export async function finishReceivedNodes(tx: DbPort, inputs: readonly ReceivedObject[], collect: ReadonlyMap<string, boolean>) {
  const ids = inputs.map(input => input.globalId);
  await assertCurrentNodeParentChains(tx, ids);
  await reconcileCurrentNodeBodies(tx, ids, inputs[0]?.enqueueSearchInvalidations ?? true);
  const deleted = ids.length ? await tx.query<{ node_id: string }>(`SELECT tomb.node_id FROM node_sync_tombstones tomb
    WHERE tomb.node_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS (SELECT 1 FROM nodes WHERE id = tomb.node_id)`,
  [JSON.stringify(ids)]) : [];
  for (const { node_id: nodeId } of deleted) await releaseDeletedNodeBodies(tx, nodeId);
  await collectRequestSyncBodiesForNodes(tx, ids.filter(id => collect.get(id)), Number.MAX_SAFE_INTEGER);
}

/** A received permanent deletion leaves no copy of the note's text on this device either. */
async function releaseReceivedDeletionBodies(tx: DbPort, nodeId: string) {
  if (!(await tx.query(DELETED_NODE_SQL, [nodeId])).length) return;
  await releaseDeletedNodeBodies(tx, nodeId);
}

async function releaseDeletedNodeBodies(tx: DbPort, nodeId: string) {
  const hashes = await releaseDeletedNodeBodiesWithPort(tx, nodeId);
  if (hashes.length) await collectTextBodyBlobCandidatesWithPort(tx, hashes);
}
