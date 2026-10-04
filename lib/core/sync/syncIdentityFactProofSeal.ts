import type { DbPort, DbRow } from './dbPort.js';
import { computeSyncIdentityNodeFactProofRoot,
  readSyncIdentityNodeFactSummary,
  SYNC_IDENTITY_FACT_PROOF_REVISION } from './syncIdentityNodeFactIndex.js';

function schemaName(schema: string) {
  if (!/^[a-z][a-z0-9_]*$/u.test(schema)) throw new Error('sync_identity_schema_invalid');
  return schema;
}

/** Seal only a completely indexed fixed snapshot, before its view ID is served. */
export async function sealSyncIdentityFactProof(port: DbPort, schema = 'main') {
  const name = schemaName(schema);
  const root = computeSyncIdentityNodeFactProofRoot(
    await readSyncIdentityNodeFactSummary(port, name));
  await port.run(`CREATE TABLE ${name}.sync_identity_source_proof (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    proof_revision TEXT NOT NULL, proof_root TEXT NOT NULL)`);
  await port.run(`INSERT INTO ${name}.sync_identity_source_proof
    (singleton_id, proof_revision, proof_root) VALUES (1, ?, ?)`,
  [SYNC_IDENTITY_FACT_PROOF_REVISION, root]);
  return root;
}

export async function verifySyncIdentityFactProof(port: DbPort, schema = 'main') {
  const name = schemaName(schema);
  let seal: ({ proof_revision: string; proof_root: string } & DbRow) | undefined;
  try {
    [seal] = await port.query<{ proof_revision: string; proof_root: string } & DbRow>(
      `SELECT proof_revision, proof_root FROM ${name}.sync_identity_source_proof
       WHERE singleton_id = 1`);
  } catch {
    throw new Error('sync_identity_source_view_changed');
  }
  const root = computeSyncIdentityNodeFactProofRoot(
    await readSyncIdentityNodeFactSummary(port, name));
  if (seal?.proof_revision !== SYNC_IDENTITY_FACT_PROOF_REVISION ||
      seal.proof_root !== root) throw new Error('sync_identity_source_view_changed');
  return root;
}
