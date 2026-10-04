import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort, DbRow } from './dbPort.js';
import { createSyncIdentityDigest } from './syncIdentityDigest.js';
import { readSyncIdentityRetentionRequirements } from './syncIdentityRequiredFactProjection.js';
import { syncIdentityRetentionIsComplete } from './syncIdentityRetentionCompleteness.js';
import { describeVersionFact } from './syncPackFactPresence.js';

interface NodeRow extends DbRow { id: string; state_fingerprint: string }
interface FactRow extends DbRow {
  digest: string; node_id: string; partition: number; requirements_digest: string;
  state_fingerprint: string;
}
type VersionRow = DbRow & Parameters<typeof describeVersionFact>[0];
interface ParentRow extends DbRow { version_id: string; parent_version_id: string; ordinal: number }
interface ReviewRow extends DbRow {
  id: string; op_id: string; host_name: string; node_id: string; grade: number;
  scheduler_version: string; reviewed_at: string; due_before: string | null;
  stability_before: number | null; difficulty_before: number | null;
  due_after: string; stability_after: number; difficulty_after: number;
}

const encoder = new TextEncoder();
const LIMIT = 128;
export const SYNC_IDENTITY_FACT_PROOF_REVISION = 'retention-v2';
export const SYNC_IDENTITY_FACT_DATA_REVISION = 'restore-facts-v2';

function alias(schema: string) {
  if (!/^[a-z][a-z0-9_]*$/u.test(schema)) throw new Error('sync_identity_schema_invalid');
  return schema;
}

export function addSyncIdentityNodeFactDigest(hash: ReturnType<typeof sha256.create>, kind: string, fact: unknown) {
  const bytes = encoder.encode(JSON.stringify([kind, fact]));
  hash.update(encoder.encode(`${bytes.length}:`));
  hash.update(bytes);
}

function proofFingerprint(digest: string, requirementsDigest: string) {
  return bytesToHex(sha256(encoder.encode(JSON.stringify([digest, requirementsDigest]))));
}

async function scanVersions(port: DbPort, schema: string, nodeId: string,
  hash: ReturnType<typeof sha256.create>) {
  let after = '';
  for (;;) {
    const rows = await port.query<VersionRow>(`SELECT version_id, object_id, parent_version_id,
      host_name, created_at, content_hash, body_text, snapshot_json
      FROM ${schema}.node_sync_versions WHERE object_id = ? AND version_id > ?
      ORDER BY version_id LIMIT ?`, [nodeId, after, LIMIT]);
    for (const row of rows) addSyncIdentityNodeFactDigest(hash, 'version', describeVersionFact(row));
    if (rows.length < LIMIT) return;
    after = rows.at(-1)!.version_id;
  }
}

async function scanParents(port: DbPort, schema: string, nodeId: string,
  hash: ReturnType<typeof sha256.create>) {
  let after: ParentRow | null = null;
  for (;;) {
    const rows: ParentRow[] = await port.query<ParentRow>(`SELECT parent.version_id,
      parent.parent_version_id, parent.ordinal FROM ${schema}.node_sync_version_parents parent
      JOIN ${schema}.node_sync_versions version ON version.version_id = parent.version_id
      WHERE version.object_id = ? ${after ? `AND (parent.version_id, parent.ordinal,
        parent.parent_version_id) > (?, ?, ?)` : ''}
      ORDER BY parent.version_id, parent.ordinal, parent.parent_version_id LIMIT ?`,
    after ? [nodeId, after.version_id, after.ordinal, after.parent_version_id, LIMIT] : [nodeId, LIMIT]);
    for (const row of rows) addSyncIdentityNodeFactDigest(hash, 'parent', {
      version_id: row.version_id, parent_version_id: row.parent_version_id, ordinal: row.ordinal
    });
    if (rows.length < LIMIT) return;
    after = rows.at(-1)!;
  }
}

async function scanReviews(port: DbPort, schema: string, nodeId: string,
  hash: ReturnType<typeof sha256.create>) {
  let after = '';
  for (;;) {
    const rows = await port.query<ReviewRow>(`SELECT id, op_id, host_name, node_id, grade,
      scheduler_version, reviewed_at, due_before, stability_before, difficulty_before,
      due_after, stability_after, difficulty_after FROM ${schema}.review_log
      WHERE node_id = ? AND op_id > ? ORDER BY op_id LIMIT ?`, [nodeId, after, LIMIT]);
    for (const row of rows) addSyncIdentityNodeFactDigest(hash, 'review', {
      id: row.id, op_id: row.op_id, host_name: row.host_name, node_id: row.node_id,
      grade: row.grade, scheduler_version: row.scheduler_version, reviewed_at: row.reviewed_at,
      due_before: row.due_before, stability_before: row.stability_before,
      difficulty_before: row.difficulty_before, due_after: row.due_after,
      stability_after: row.stability_after, difficulty_after: row.difficulty_after
    });
    if (rows.length < LIMIT) return;
    after = rows.at(-1)!.op_id;
  }
}

async function summarize(port: DbPort, schema: string) {
  const digest = createSyncIdentityDigest();
  const proofDigest = createSyncIdentityDigest();
  let after = '';
  let count = 0;
  for (;;) {
    const rows = await port.query<FactRow>(`SELECT node_id, digest, requirements_digest
      FROM ${schema}.sync_identity_node_facts WHERE node_id > ?
      ORDER BY node_id LIMIT ?`, [after, LIMIT]);
    for (const row of rows) {
      digest.add({ object_type: 'node', object_id: row.node_id, fingerprint: row.digest });
      proofDigest.add({ object_type: 'node', object_id: row.node_id,
        fingerprint: proofFingerprint(row.digest, row.requirements_digest) });
    }
    count += rows.length;
    if (rows.length < LIMIT) break;
    after = rows.at(-1)!.node_id;
  }
  await port.run(`INSERT INTO ${schema}.sync_identity_node_fact_summary
    (partition, row_count, digest, proof_digest) VALUES (0, ?, ?, ?)`,
  [count, digest.finish(), proofDigest.finish()]);
}

/** Build only on a fixed source view; never scan live mutable facts for publication. */
export async function buildSyncIdentityNodeFactIndex(port: DbPort, schema = 'main') {
  const prefix = alias(schema);
  await port.run(`DROP TABLE IF EXISTS ${prefix}.sync_identity_node_facts`);
  await port.run(`CREATE TABLE ${prefix}.sync_identity_node_facts (
    node_id TEXT PRIMARY KEY, partition INTEGER NOT NULL,
    digest TEXT NOT NULL, requirements_digest TEXT NOT NULL,
    state_fingerprint TEXT NOT NULL, repair_required INTEGER NOT NULL DEFAULT 0)`);
  await port.run(`CREATE INDEX IF NOT EXISTS ${prefix}.sync_identity_node_facts_partition
    ON sync_identity_node_facts(partition, node_id)`);
  await port.run(`CREATE TABLE IF NOT EXISTS ${prefix}.sync_identity_node_fact_summary (
    partition INTEGER PRIMARY KEY, row_count INTEGER NOT NULL,
    digest TEXT NOT NULL, proof_digest TEXT NOT NULL)`);
  await port.transaction(async (tx) => {
    await tx.run(`DELETE FROM ${prefix}.sync_identity_node_facts`);
    await tx.run(`DELETE FROM ${prefix}.sync_identity_node_fact_summary`);
    let after = '';
    for (;;) {
      const nodes = await tx.query<NodeRow>(`SELECT object_id AS id, fingerprint AS state_fingerprint
        FROM ${prefix}.sync_identity_index_rows WHERE object_type = 'node' AND object_id > ?
        ORDER BY object_id LIMIT ?`, [after, LIMIT]);
      for (const node of nodes) {
        const hash = sha256.create();
        await scanVersions(tx, prefix, node.id, hash);
        await scanParents(tx, prefix, node.id, hash);
        await scanReviews(tx, prefix, node.id, hash);
        const requirements = await readSyncIdentityRetentionRequirements(tx, node.id, prefix);
        const repairRequired = !await syncIdentityRetentionIsComplete(tx, prefix, node.id, requirements);
        const requirementsDigest = bytesToHex(sha256(encoder.encode(JSON.stringify([
          SYNC_IDENTITY_FACT_PROOF_REVISION, requirements.headId, requirements.protectedIds,
          requirements.frozenIds, repairRequired]))));
        await tx.run(`INSERT INTO ${prefix}.sync_identity_node_facts
          (node_id, partition, digest, requirements_digest, state_fingerprint, repair_required)
          VALUES (?, ?, ?, ?, ?, ?)`,
        [node.id, 0, bytesToHex(hash.digest()),
          requirementsDigest, node.state_fingerprint, repairRequired ? 1 : 0]);
      }
      if (nodes.length < LIMIT) break;
      after = nodes.at(-1)!.id;
    }
    await summarize(tx, prefix);
  });
}

export async function readSyncIdentityNodeFactSummary(port: DbPort, schema = 'main') {
  return port.query<{ partition: number; row_count: number; digest: string }>(
    `SELECT partition, row_count, proof_digest AS digest
     FROM ${alias(schema)}.sync_identity_node_fact_summary
     ORDER BY partition`);
}

export function computeSyncIdentityNodeFactProofRoot(summary: readonly {
  partition: number; row_count: number; digest: string;
}[]) {
  if (summary.length !== 1 || summary.some((row, index) =>
    row.partition !== index || !/^[a-f0-9]{64}$/u.test(row.digest))) {
    throw new Error('sync_identity_fact_proof_unready');
  }
  return bytesToHex(sha256(encoder.encode(JSON.stringify([SYNC_IDENTITY_FACT_PROOF_REVISION,
    summary.map((row) => [row.partition, row.row_count, row.digest])]))));
}

export async function readSyncIdentityNodeFactProofRoot(port: DbPort, schema = 'main') {
  return computeSyncIdentityNodeFactProofRoot(
    await readSyncIdentityNodeFactSummary(port, schema));
}

/** Source and restored facts can match even when device-local retention duties differ. */
export async function readSyncIdentityNodeFactDataRoot(port: DbPort, schema = 'main') {
  const summary = await port.query<{ partition: number; row_count: number; digest: string }>(
    `SELECT partition, row_count, digest FROM ${alias(schema)}.sync_identity_node_fact_summary
     ORDER BY partition`);
  if (summary.length !== 1 || summary.some((row, index) =>
    row.partition !== index || !/^[a-f0-9]{64}$/u.test(row.digest))) {
    throw new Error('sync_identity_fact_data_unready');
  }
  return bytesToHex(sha256(encoder.encode(JSON.stringify([
    SYNC_IDENTITY_FACT_DATA_REVISION,
    summary.map((row) => [row.partition, row.row_count, row.digest])
  ]))));
}

export async function readSyncIdentityNodeFactPage(port: DbPort, partition: number,
  after: string | null, schema = 'main') {
  if (!Number.isSafeInteger(partition) || partition < 0 || partition > 255 ||
      after !== null && (!after || after.length > 2048)) {
    throw new Error('sync_identity_fact_page_invalid');
  }
  const rows = await port.query<FactRow>(`SELECT node_id, partition, digest,
    requirements_digest, state_fingerprint
    FROM ${alias(schema)}.sync_identity_node_facts WHERE partition = ? AND node_id > ?
    ORDER BY node_id LIMIT 129`, [partition, after ?? '']);
  const entries: Array<{ object_type: 'node'; object_id: string; fingerprint: string;
    requirements_digest: string; state_fingerprint: string }> = [];
  let bytes = 2;
  for (const row of rows.slice(0, 128)) {
    const entry = { object_type: 'node' as const, object_id: row.node_id,
      fingerprint: proofFingerprint(row.digest, row.requirements_digest),
      requirements_digest: row.requirements_digest,
      state_fingerprint: row.state_fingerprint };
    const size = encoder.encode(JSON.stringify(entry)).length + (entries.length ? 1 : 0);
    if (bytes + size > 65536) {
      if (!entries.length) throw new Error('sync_identity_fact_page_too_large');
      break;
    }
    entries.push(entry);
    bytes += size;
  }
  return { entries, nextAfter: rows.length > entries.length ? {
    object_type: 'node', object_id: entries.at(-1)!.object_id
  } : null };
}
