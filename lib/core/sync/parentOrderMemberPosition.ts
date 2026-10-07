import type { DatabaseDriver } from '../database/driver.js';

import type { DbPort, DbRow } from './dbPort.js';
import { nodePositionFactId, nodePositionWriteStatements, type NodePositionPayload } from './nodeVersionMemberPositionFact.js';
import { LOCAL_NODE_POSITION_OWNER_SQL } from './nodeVersionMemberPositionRead.js';
import { PARENT_ORDER_BODY_ROWS_SQL } from './parentOrderBodyRetention.js';
import { createParentOrderLineageGraph } from './syncParentOrderGraph.js';
import { planParentOrderResolution } from './syncParentOrderResolutionPlan.js';

type Owner = Pick<NodePositionPayload, 'group_id' | 'device_identity_key' | 'library_epoch' | 'proof_revision'>;
type Row = { version_id: string; kind: 'baseline' | 'membership' | 'user' | 'merge';
  parent_version_ids_json: string; available: number } & DbRow;
const HEAD_SQL = 'SELECT version_id FROM parent_order_heads WHERE parent_id = ?';
const KNOWN_SQL = `SELECT adopted_version_id, pending_version_ids_json, library_epoch
  FROM parent_order_member_positions WHERE fact_id = ?`;

function declaration(parentId: string, head: string, owner: Owner, rows: Row[], known?: DbRow) {
  const lineage = rows.map((row) => ({ versionId: row.version_id, kind: row.kind,
    parentVersionIds: JSON.parse(row.parent_version_ids_json) as string[] }));
  const ids = new Set(lineage.map((row) => row.versionId));
  if (lineage.some((row) => row.parentVersionIds.some((id) => !ids.has(id)))) return null;
  const graph = createParentOrderLineageGraph(lineage, [head]);
  const pending = graph.maximal(lineage.map((row) => row.versionId))
    .filter((id) => !graph.reachable.has(id)).sort();
  const required = planParentOrderResolution(lineage, [head, ...pending]).requiredVersionIds;
  if ([...required].some((id) => !rows.some((row) => row.version_id === id && row.available === 1))) return null;
  const pendingJson = JSON.stringify(pending);
  if (known?.adopted_version_id === head && known.pending_version_ids_json === pendingJson &&
      known.library_epoch === owner.library_epoch) return null;
  if (!Number.isSafeInteger(owner.proof_revision + 1)) throw new Error('node_version_proof_revision_exhausted');
  return { ...owner, proof_revision: owner.proof_revision + 1, object_id: parentId,
    adopted_version_id: head, pending_version_ids_json: pendingJson,
    updated_at: new Date().toISOString() } satisfies NodePositionPayload;
}

/** Arrangement adoption uses the article position owner, revisions and immutable declarations. */
export async function publishParentOrderPosition(db: DbPort, parentId: string) {
  const [owner] = await db.query<Owner & DbRow>(LOCAL_NODE_POSITION_OWNER_SQL);
  const [head] = await db.query<{ version_id: string }>(HEAD_SQL, [parentId]);
  if (!owner || !head) return;
  const [known] = await db.query(KNOWN_SQL, [nodePositionFactId({ ...owner, object_id: parentId }, 'parent_child_order')]);
  const payload = declaration(parentId, head.version_id, owner,
    await db.query<Row>(PARENT_ORDER_BODY_ROWS_SQL, [parentId]), known);
  if (!payload) return;
  await db.run('UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1 WHERE singleton_id = 1');
  for (const statement of nodePositionWriteStatements(payload, 'parent_child_order')) await db.run(statement.sql, statement.params);
}

export function publishParentOrderPositionWithDriver(driver: DatabaseDriver, parentId: string) {
  const owner = driver.queryOne<Owner>(LOCAL_NODE_POSITION_OWNER_SQL);
  const head = driver.queryOne<{ version_id: string }>(HEAD_SQL, [parentId]);
  if (!owner || !head) return;
  const known = driver.queryOne(KNOWN_SQL, [nodePositionFactId({ ...owner, object_id: parentId }, 'parent_child_order')]);
  const payload = declaration(parentId, head.version_id, owner,
    driver.queryAll<Row>(PARENT_ORDER_BODY_ROWS_SQL, [parentId]), known);
  if (!payload) return;
  driver.execute('UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1 WHERE singleton_id = 1');
  for (const statement of nodePositionWriteStatements(payload, 'parent_child_order')) driver.execute(statement.sql, statement.params);
}
