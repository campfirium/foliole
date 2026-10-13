import type { DbPort } from './dbPort.js';

export async function advanceLocalSourceRevision(port: DbPort, sourceDeviceId: string) {
  const [proof] = await port.query<{ library_epoch: string; proof_revision: number }>(
    'SELECT library_epoch, proof_revision FROM node_version_local_proof_state WHERE singleton_id = 1'
  );
  if (!proof) throw new Error('node_version_local_proof_missing');
  const epoch = proof.library_epoch;
  const revision = proof.proof_revision + 1;
  if (!Number.isSafeInteger(revision)) throw new Error('node_version_proof_revision_exhausted');
  await port.run(
    `INSERT INTO node_version_local_proof_state (singleton_id, library_epoch, proof_revision)
     VALUES (1, ?, ?) ON CONFLICT(singleton_id) DO UPDATE SET proof_revision = excluded.proof_revision`,
    [epoch, proof.proof_revision + 1]
  );
  await port.run(
    `INSERT INTO node_version_local_source_revisions (source_device_identity_key, proof_revision)
     VALUES (?, ?) ON CONFLICT(source_device_identity_key) DO UPDATE SET
       proof_revision = excluded.proof_revision`,
    [sourceDeviceId, revision]
  );
  return { epoch, revision };
}
