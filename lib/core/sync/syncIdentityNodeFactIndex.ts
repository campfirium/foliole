import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort, DbRow } from './dbPort.js';
import { createSyncIdentityDigest } from './syncIdentityDigest.js';
import { buildSyncIdentityNodeFactPage } from './syncIdentityNodeFactBuildPage.js';

export { addSyncIdentityNodeFactDigest } from './syncIdentityNodeFactDigest.js';

interface NodeRow extends DbRow { id: string; state_fingerprint: string }
interface FactRow extends DbRow {
  digest: string; node_id: string; partition: number; requirements_digest: string;
  state_fingerprint: string;
}
const encoder = new TextEncoder();
const LIMIT = 128;
export const SYNC_IDENTITY_FACT_PROOF_REVISION = 'retention-v2';
export const SYNC_IDENTITY_FACT_DATA_REVISION = 'restore-facts-v2';

function alias(schema: string) {
  if (!/^[a-z][a-z0-9_]*$/u.test(schema)) throw new Error('sync_identity_schema_invalid');
  return schema;
}

function proofFingerprint(digest: string, requirementsDigest: string) {
  return bytesToHex(sha256(encoder.encode(JSON.stringify([digest, requirementsDigest]))));
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
      await buildSyncIdentityNodeFactPage(tx, prefix, nodes, SYNC_IDENTITY_FACT_PROOF_REVISION);
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
