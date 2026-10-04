import { z } from 'zod';

import type { DatabaseDriver } from '../database/driver.js';

import type { DbPort, DbRow } from './dbPort.js';
import { nodePositionFactId, nodePositionWriteStatements, type NodePositionPayload } from './nodeVersionMemberPositionFact.js';
import { describeLocalNodePosition, LOCAL_NODE_POSITION_OWNER_SQL,
  LOCAL_NODE_POSITION_SQL } from './nodeVersionMemberPositionRead.js';

type Owner = Pick<NodePositionPayload, 'group_id' | 'device_identity_key' | 'library_epoch' | 'proof_revision'>;
type PositionRow = { version_id: string; adopted: number; complete: number } & DbRow;
type KnownPosition = Pick<NodePositionPayload, 'adopted_version_id' | 'pending_version_ids_json' | 'library_epoch'>;

function declaration(nodeId: string, owner: Owner, rows: PositionRow[], known?: KnownPosition) {
  if (!rows.some((row) => row.adopted === 1) || rows.some((row) => row.complete !== 1)) return null;
  const position = describeLocalNodePosition(rows);
  if (known?.adopted_version_id === position.adopted_version_id &&
      known.pending_version_ids_json === position.pending_version_ids_json &&
      known.library_epoch === owner.library_epoch) return null;
  if (!Number.isSafeInteger(owner.proof_revision + 1)) throw new Error('node_version_proof_revision_exhausted');
  return { ...position, ...owner, object_id: nodeId, proof_revision: owner.proof_revision + 1,
    updated_at: new Date().toISOString() } satisfies NodePositionPayload;
}

const KNOWN_POSITION_SQL = `SELECT adopted_version_id, pending_version_ids_json, library_epoch
  FROM node_version_member_positions WHERE fact_id = ?`;
const ADVANCE_REVISION_SQL = `UPDATE node_version_local_proof_state
  SET proof_revision = proof_revision + 1 WHERE singleton_id = 1`;

const positionRowsSchema = z.array(z.object({
  version_id: z.string(), adopted: z.number(), complete: z.number()
}));
const POSITION_PAGE_SQL = `SELECT requested.value AS node_id,
  (SELECT json_group_array(json_object('version_id', version_id,
    'adopted', adopted, 'complete', complete)) FROM (
    ${LOCAL_NODE_POSITION_SQL.replaceAll('?', 'requested.value')}
  )) AS rows_json FROM json_each(?) requested`;

/** Read one bounded page through the native bridge while preserving declaration order. */
export async function publishLocalNodePositionPage(port: DbPort, nodeIds: string[]) {
  const ids = nodeIds.filter((id) => !['special-inbox', 'special-virtual-root'].includes(id));
  if (!ids.length) return;
  if (ids.length > 128) throw new Error('node_position_page_too_large');
  const [owner] = await port.query<Owner & DbRow>(LOCAL_NODE_POSITION_OWNER_SQL);
  if (!owner) return;
  const known = await port.query<KnownPosition & DbRow & { fact_id: string }>(
    `SELECT fact_id, adopted_version_id, pending_version_ids_json, library_epoch
     FROM node_version_member_positions WHERE fact_id IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(ids.map((object_id) => nodePositionFactId({ ...owner, object_id })))]);
  const byFact = new Map(known.map((row) => [row.fact_id, row]));
  const rows = await port.query<DbRow & { node_id: string; rows_json: string }>(
    POSITION_PAGE_SQL, [JSON.stringify(ids)]);
  for (const row of rows) {
    const payload = declaration(row.node_id, owner, positionRowsSchema.parse(JSON.parse(row.rows_json)),
      byFact.get(nodePositionFactId({ ...owner, object_id: row.node_id })));
    if (!payload) continue;
    await port.run(ADVANCE_REVISION_SQL);
    for (const statement of nodePositionWriteStatements(payload)) await port.run(statement.sql, statement.params);
    owner.proof_revision = payload.proof_revision;
  }
}

/** Publish only after the complete adopted and pending bodies are durably available. */
export async function publishLocalNodePosition(port: DbPort, nodeId: string) {
  if (['special-inbox', 'special-virtual-root'].includes(nodeId)) return;
  const [owner] = await port.query<Owner & DbRow>(LOCAL_NODE_POSITION_OWNER_SQL);
  if (!owner) return;
  const [known] = await port.query<KnownPosition & DbRow>(KNOWN_POSITION_SQL,
    [nodePositionFactId({ ...owner, object_id: nodeId })]);
  const rows = await port.query<PositionRow>(LOCAL_NODE_POSITION_SQL, [nodeId, nodeId]);
  const payload = declaration(nodeId, owner, rows, known);
  if (!payload) return;
  await port.run(ADVANCE_REVISION_SQL);
  for (const statement of nodePositionWriteStatements(payload)) await port.run(statement.sql, statement.params);
}

/** Thin synchronous storage adapter for desktop edits. The caller owns the write transaction. */
export function publishLocalNodePositionWithDriver(driver: DatabaseDriver, nodeId: string) {
  if (['special-inbox', 'special-virtual-root'].includes(nodeId)) return;
  const owner = driver.queryOne<Owner>(LOCAL_NODE_POSITION_OWNER_SQL);
  if (!owner) return;
  const known = driver.queryOne<KnownPosition>(KNOWN_POSITION_SQL,
    [nodePositionFactId({ ...owner, object_id: nodeId })]);
  const payload = declaration(nodeId, owner,
    driver.queryAll<PositionRow>(LOCAL_NODE_POSITION_SQL, [nodeId, nodeId]), known ?? undefined);
  if (!payload) return;
  driver.execute(ADVANCE_REVISION_SQL);
  for (const statement of nodePositionWriteStatements(payload)) driver.execute(statement.sql, statement.params);
}
