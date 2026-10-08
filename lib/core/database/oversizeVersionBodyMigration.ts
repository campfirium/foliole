import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';
import { CHAIN_VERSION_METADATA_SQL } from '../sync/nodeVersionChainMetadata.js';
import { planNodeVersionMetadataChain, type ChainEdge, type ChainVersionMetadata } from '../sync/nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, CHAIN_HEAD_SQL, chainMutationStatements, chainReferencesQuery } from '../sync/nodeVersionChainSql.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

const AVAILABLE = `(body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text'
  OR json_type(snapshot_json, '$.content') IS NULL)`;
const OVERSIZE = `${AVAILABLE} AND (
  length(CAST(body_text AS BLOB)) > ${TEXT_BODY_MAX_BYTES}
  OR length(CAST(json_extract(snapshot_json, '$.content') AS BLOB)) > ${TEXT_BODY_MAX_BYTES}
  OR EXISTS (SELECT 1 FROM json_each(snapshot_json, '$.text_alternative_bodies') body
    WHERE length(CAST(json_extract(body.value, '$.text') AS BLOB)) > ${TEXT_BODY_MAX_BYTES})
  OR EXISTS (SELECT 1 FROM json_each(snapshot_json, '$.text_alternatives') alternative
    JOIN content_blob_data blob ON blob.hash = json_extract(alternative.value, '$.body_blob_hash')
    WHERE length(blob.data) > ${TEXT_BODY_MAX_BYTES}))`;
const NEXT = `SELECT object_id FROM node_sync_versions WHERE object_id > ? AND ${OVERSIZE}
  ORDER BY object_id LIMIT 1`;
const CANDIDATES = `SELECT version_id FROM node_sync_versions WHERE object_id = ? AND ${OVERSIZE}`;
interface Head extends DbRow { current_version_id: string | null; sync_dirty: number }
interface Reference extends DbRow { version_id: string | null; frozen: number }
interface Identity extends DbRow { version_id: string }

function retirementStatements(head: Head, refs: Reference[], versions: ChainVersionMetadata[],
  edges: ChainEdge[], candidates: Identity[]) {
  const protectedIds = new Set([head.current_version_id!, ...refs.flatMap((row) => row.version_id ? [row.version_id] : [])]);
  const frozen = new Set(refs.filter((row) => row.frozen && row.version_id).map((row) => row.version_id!));
  const plan = planNodeVersionMetadataChain(versions, edges, protectedIds, frozen,
    Number.MAX_SAFE_INTEGER, new Set([head.current_version_id!]));
  if (plan.skipped) return [];
  const oversizeIds = new Set(candidates.map((row) => row.version_id));
  return chainMutationStatements({ ...plan, removed: plan.removed.filter((id) => oversizeIds.has(id)) });
}

/** The existing retention policy alone decides which original payloads can be released. */
export function migrateOversizeVersionBodies(sqlite: DatabaseMigrationTarget) {
  let after = '';
  for (;;) {
    const [node] = sqlite.prepare(NEXT).all(after) as Array<{ object_id: string }>;
    if (!node) return;
    after = node.object_id;
    const [head] = sqlite.prepare(CHAIN_HEAD_SQL).all(after) as Head[];
    if (!head?.current_version_id || head.sync_dirty !== 0) continue;
    const query = chainReferencesQuery(after);
    const statements = retirementStatements(head, sqlite.prepare(query.sql).all(...query.params) as Reference[],
      sqlite.prepare(CHAIN_VERSION_METADATA_SQL).all(after) as ChainVersionMetadata[],
      sqlite.prepare(CHAIN_EDGES_SQL).all(after) as ChainEdge[],
      sqlite.prepare(CANDIDATES).all(after) as Identity[]);
    for (const statement of statements) sqlite.prepare(statement.sql).run(...statement.params);
  }
}

export async function migrateCompanionOversizeVersionBodies(db: DbPort) {
  let after = '';
  for (;;) {
    const [node] = await db.query<{ object_id: string }>(NEXT, [after]);
    if (!node) return;
    after = node.object_id;
    const [head] = await db.query<Head>(CHAIN_HEAD_SQL, [after]);
    if (!head?.current_version_id || head.sync_dirty !== 0) continue;
    const query = chainReferencesQuery(after);
    const statements = retirementStatements(head, await db.query<Reference>(query.sql, query.params),
      await db.query<ChainVersionMetadata>(CHAIN_VERSION_METADATA_SQL, [after]),
      await db.query<ChainEdge>(CHAIN_EDGES_SQL, [after]), await db.query<Identity>(CANDIDATES, [after]));
    for (const statement of statements) await db.run(statement.sql, statement.params);
  }
}
