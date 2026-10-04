import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import type { DbPort, DbRow } from './dbPort.js';
import { planNodeVersionChain, type ChainVersion, type ChainEdge } from './nodeVersionChainPlan.js';
import { CHAIN_HEAD_SQL, chainReferencesQuery, qualifyNodeVersionReadSql } from './nodeVersionChainSql.js';
import { identityReviewRowSchema } from './syncIdentityFactRowSchemas.js';
import { IDENTITY_REVIEW_COLUMNS } from './syncIdentityFactSourceRows.js';
import { addSyncIdentityNodeFactDigest } from './syncIdentityNodeFactDigest.js';
import { describeVersionFact } from './syncPackFactPresence.js';

type NodeRow = { id: string; state_fingerprint: string };
type VersionRow = DbRow & Parameters<typeof describeVersionFact>[0];
type ParentRow = ChainEdge & { object_id: string };
type ReviewRow = DbRow & z.infer<typeof identityReviewRowSchema>;
type Builder = {
  hash: ReturnType<typeof sha256.create>;
  versions: ChainVersion[];
  edges: ChainEdge[];
};
const refsSchema = z.array(z.tuple([z.string().nullable(), z.number()]));
const encoder = new TextEncoder();
const LIMIT = 128;

async function scanVersions(port: DbPort, schema: string, ids: string, builders: Map<string, Builder>) {
  let after = ['', ''];
  for (;;) {
    const rows = await port.query<VersionRow>(`SELECT version_id, object_id, parent_version_id,
      host_name, created_at, content_hash, body_text, snapshot_json FROM ${schema}.node_sync_versions
      WHERE object_id IN (SELECT value FROM json_each(?)) AND (object_id, version_id) > (?, ?)
      ORDER BY object_id, version_id LIMIT ?`, [ids, ...after, LIMIT]);
    for (const row of rows) {
      const builder = builders.get(row.object_id)!;
      const fact = describeVersionFact(row);
      addSyncIdentityNodeFactDigest(builder.hash, 'version', fact);
      builder.versions.push({ version_id: row.version_id, object_id: row.object_id,
        parent_version_id: row.parent_version_id, body_text: fact.body_hash === null ? null : '',
        snapshot_json: '{"content":null}' });
    }
    if (rows.length < LIMIT) return;
    const last = rows.at(-1)!;
    after = [last.object_id, last.version_id];
  }
}

async function scanParents(port: DbPort, schema: string, ids: string, builders: Map<string, Builder>) {
  let after: Array<string | number> = ['', '', -1, ''];
  for (;;) {
    const rows = await port.query<ParentRow>(`SELECT version.object_id, parent.version_id,
      parent.parent_version_id, parent.ordinal FROM ${schema}.node_sync_version_parents parent
      JOIN ${schema}.node_sync_versions version ON version.version_id = parent.version_id
      WHERE version.object_id IN (SELECT value FROM json_each(?))
      AND (version.object_id, parent.version_id, parent.ordinal, parent.parent_version_id) > (?, ?, ?, ?)
      ORDER BY version.object_id, parent.version_id, parent.ordinal, parent.parent_version_id LIMIT ?`,
    [ids, ...after, LIMIT]);
    for (const row of rows) {
      const builder = builders.get(row.object_id)!;
      const edge = { version_id: row.version_id, parent_version_id: row.parent_version_id, ordinal: row.ordinal };
      builder.edges.push(edge);
      addSyncIdentityNodeFactDigest(builder.hash, 'parent', edge);
    }
    if (rows.length < LIMIT) return;
    const last = rows.at(-1)!;
    after = [last.object_id, last.version_id, last.ordinal, last.parent_version_id];
  }
}

async function scanReviews(port: DbPort, schema: string, ids: string, builders: Map<string, Builder>) {
  let after = ['', ''];
  for (;;) {
    const rows = await port.query<ReviewRow>(`SELECT ${IDENTITY_REVIEW_COLUMNS.join(', ')}
      FROM ${schema}.review_log WHERE node_id IN (SELECT value FROM json_each(?))
      AND (node_id, op_id) > (?, ?) ORDER BY node_id, op_id LIMIT ?`, [ids, ...after, LIMIT]);
    for (const row of rows) addSyncIdentityNodeFactDigest(builders.get(row.node_id)!.hash,
      'review', identityReviewRowSchema.parse(row));
    if (rows.length < LIMIT) return;
    const last = rows.at(-1)!;
    after = [last.node_id, last.op_id];
  }
}

async function readRequirements(port: DbPort, schema: string, ids: string) {
  const head = qualifyNodeVersionReadSql(CHAIN_HEAD_SQL, schema).replaceAll('?', 'requested.value');
  const refs = chainReferencesQuery('', false, schema).sql.replaceAll('?', 'requested.value');
  return port.query<DbRow & { node_id: string; head_id: string | null; refs_json: string }>(
    `SELECT requested.value AS node_id, (SELECT current_version_id FROM (${head})) AS head_id,
      (SELECT json_group_array(json_array(version_id, frozen)) FROM (${refs})) AS refs_json
     FROM json_each(?) requested`, [ids]);
}

/** Keep body reads bounded while sharing native calls across a fixed node page. */
export async function buildSyncIdentityNodeFactPage(port: DbPort, schema: string,
  nodes: NodeRow[], proofRevision: string) {
  if (!/^[a-z][a-z0-9_]*$/u.test(schema) || nodes.length > LIMIT) {
    throw new Error('sync_identity_fact_build_page_invalid');
  }
  if (!nodes.length) return;
  const ids = JSON.stringify(nodes.map((node) => node.id));
  const builders = new Map(nodes.map((node) => [node.id,
    { hash: sha256.create(), versions: [], edges: [] } satisfies Builder]));
  await scanVersions(port, schema, ids, builders);
  await scanParents(port, schema, ids, builders);
  await scanReviews(port, schema, ids, builders);
  const byNode = new Map(nodes.map((node) => [node.id, node]));
  const facts = (await readRequirements(port, schema, ids)).map((row) => {
    const refs = refsSchema.parse(JSON.parse(row.refs_json));
    const protectedIds = [...new Set([...row.head_id ? [row.head_id] : [],
      ...refs.flatMap(([id]) => id ? [id] : [])])].sort();
    const frozenIds = [...new Set(refs.flatMap(([id, frozen]) => id && frozen ? [id] : []))].sort();
    const builder = builders.get(row.node_id)!;
    const repairRequired = planNodeVersionChain(builder.versions, builder.edges,
      new Set(protectedIds), new Set(frozenIds), Number.MAX_SAFE_INTEGER,
      new Set(row.head_id ? [row.head_id] : [])).skipped !== null;
    return [row.node_id, 0, bytesToHex(builder.hash.digest()),
      bytesToHex(sha256(encoder.encode(JSON.stringify([proofRevision,
        row.head_id, protectedIds, frozenIds, repairRequired])))),
      byNode.get(row.node_id)!.state_fingerprint, repairRequired ? 1 : 0];
  });
  await port.run(`INSERT INTO ${schema}.sync_identity_node_facts
    (node_id, partition, digest, requirements_digest, state_fingerprint, repair_required)
    SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
      json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]')
    FROM json_each(?)`, [JSON.stringify(facts)]);
}
