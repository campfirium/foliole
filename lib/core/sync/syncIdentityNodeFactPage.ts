import type { DbPort, DbRow } from './dbPort.js';
import { CHAIN_HEAD_SQL, chainReferencesQuery,
  qualifyNodeVersionReadSql } from './nodeVersionChainSql.js';
import { describeVersionFact } from './syncPackFactPresence.js';

export type SyncIdentityNodeFactSection = 'versions' | 'parents' | 'reviews' | 'requirements';
type VersionRow = DbRow & Parameters<typeof describeVersionFact>[0];
interface ParentRow extends DbRow {
  version_id: string; parent_version_id: string; ordinal: number;
}
interface ReviewRow extends DbRow {
  id: string; op_id: string; host_name: string; node_id: string; grade: number;
  scheduler_version: string; reviewed_at: string; due_before: string | null;
  stability_before: number | null; difficulty_before: number | null;
  due_after: string; stability_after: number; difficulty_after: number;
}
interface RequirementRow extends DbRow { version_id: string; frozen: number }
interface IndexedNode extends DbRow { digest: string; requirements_digest: string }

const MAX_ROWS = 128;
const MAX_BYTES = 60 * 1024;
const encoder = new TextEncoder();

function schemaName(value: string) {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) throw new Error('sync_identity_schema_invalid');
  return value;
}

function parentAfter(value: string | null) {
  if (value === null) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new Error('sync_identity_node_fact_cursor_invalid'); }
  if (!Array.isArray(parsed) || parsed.length !== 3 ||
      typeof parsed[0] !== 'string' || !parsed[0] ||
      !Number.isSafeInteger(parsed[1]) || parsed[1] < 0 ||
      typeof parsed[2] !== 'string' || !parsed[2]) {
    throw new Error('sync_identity_node_fact_cursor_invalid');
  }
  return parsed as [string, number, string];
}

function page<T>(rows: T[], cursor: (row: T) => string) {
  const entries: T[] = [];
  for (const row of rows.slice(0, MAX_ROWS)) {
    if (encoder.encode(JSON.stringify([...entries, row])).length > MAX_BYTES) {
      if (!entries.length) throw new Error('sync_identity_node_fact_item_too_large');
      break;
    }
    entries.push(row);
  }
  return { entries, nextAfter: rows.length > entries.length ? cursor(entries.at(-1)!) : null };
}

async function readVersions(port: DbPort, schema: string, nodeId: string, after: string) {
  const rows = await port.query<VersionRow>(`SELECT version_id, object_id, parent_version_id,
    host_name, created_at, content_hash, body_text, snapshot_json
    FROM ${schema}.node_sync_versions WHERE object_id = ? AND version_id > ?
    ORDER BY version_id LIMIT ?`, [nodeId, after, MAX_ROWS + 1]);
  return page(rows.map(describeVersionFact), (row) => row.version_id);
}

async function readParents(port: DbPort, schema: string, nodeId: string,
  after: [string, number, string] | null) {
  const rows = await port.query<ParentRow>(`SELECT parent.version_id,
    parent.parent_version_id, parent.ordinal FROM ${schema}.node_sync_version_parents parent
    JOIN ${schema}.node_sync_versions version ON version.version_id = parent.version_id
    WHERE version.object_id = ? ${after ? `AND (parent.version_id, parent.ordinal,
      parent.parent_version_id) > (?, ?, ?)` : ''}
    ORDER BY parent.version_id, parent.ordinal, parent.parent_version_id LIMIT ?`,
  after ? [nodeId, ...after, MAX_ROWS + 1] : [nodeId, MAX_ROWS + 1]);
  return page(rows, (row) => JSON.stringify([
    row.version_id, row.ordinal, row.parent_version_id]));
}

async function readReviews(port: DbPort, schema: string, nodeId: string, after: string) {
  const rows = await port.query<ReviewRow>(`SELECT id, op_id, host_name, node_id, grade,
    scheduler_version, reviewed_at, due_before, stability_before, difficulty_before,
    due_after, stability_after, difficulty_after FROM ${schema}.review_log
    WHERE node_id = ? AND op_id > ? ORDER BY op_id LIMIT ?`,
  [nodeId, after, MAX_ROWS + 1]);
  return page(rows, (row) => row.op_id);
}

async function readRequirements(port: DbPort, schema: string, nodeId: string, after: string,
  headId: string | null) {
  const references = chainReferencesQuery(nodeId, false, schema);
  const rows = await port.query<RequirementRow>(`SELECT version_id,
    MAX(frozen) AS frozen FROM (${references.sql}
    UNION ALL SELECT ? AS version_id, 0 AS frozen)
    WHERE version_id IS NOT NULL AND version_id > ? GROUP BY version_id
    ORDER BY version_id LIMIT ?`,
  [...references.params, headId, after, MAX_ROWS + 1]);
  return page(rows, (row) => row.version_id);
}

/** Read one bounded metadata page from a fixed source view, never from live state. */
export async function readSyncIdentityNodeFactDescriptorPage(port: DbPort, args: {
  nodeId: string; section: SyncIdentityNodeFactSection; after: string | null;
  schema?: string;
}) {
  const schema = schemaName(args.schema ?? 'main');
  if (!args.nodeId || args.nodeId.length > 2048 ||
      !['versions', 'parents', 'reviews', 'requirements'].includes(args.section) ||
      args.after !== null && (!args.after || args.after.length > 4096)) {
    throw new Error('sync_identity_node_fact_request_invalid');
  }
  const [indexed] = await port.query<IndexedNode>(`SELECT digest, requirements_digest
    FROM ${schema}.sync_identity_node_facts WHERE node_id = ?`, [args.nodeId]);
  if (!indexed) throw new Error('sync_identity_node_fact_missing');
  const [head] = await port.query<{ current_version_id: string | null }>(
    qualifyNodeVersionReadSql(CHAIN_HEAD_SQL, schema), [args.nodeId]);
  const after = args.after ?? '';
  const result = args.section === 'versions'
    ? await readVersions(port, schema, args.nodeId, after)
    : args.section === 'parents'
      ? await readParents(port, schema, args.nodeId, parentAfter(args.after))
      : args.section === 'reviews'
        ? await readReviews(port, schema, args.nodeId, after)
        : await readRequirements(port, schema, args.nodeId, after,
          head?.current_version_id ?? null);
  return { node_id: args.nodeId, section: args.section,
    fact_digest: indexed.digest, requirements_digest: indexed.requirements_digest,
    head_id: head?.current_version_id ?? null, ...result };
}
