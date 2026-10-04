import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { sealSyncIdentityFactProof } from '../../lib/core/sync/syncIdentityFactProofSeal.js';
import { prepareReadySyncIdentityIndex } from '../../lib/core/sync/syncIdentityIndexPreparation.js';
import { buildSyncIdentityNodeFactIndex,
  computeSyncIdentityNodeFactProofRoot,
  SYNC_IDENTITY_FACT_PROOF_REVISION } from '../../lib/core/sync/syncIdentityNodeFactIndex.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { createSyncPackSourceView, openSyncPackSourceView } from './syncPackSourceView.js';

/** The caller owns source and the published view's lifetime. */
export async function createSyncIdentitySourceView(source: Database.Database, outputPath: string) {
  await prepareReadySyncIdentityIndex(createBetterSqliteDbPort(source));
  const view = await createSyncPackSourceView(source, outputPath);
  const expectedId = view.sourceViewId;
  view.close();
  try {
    const snapshot = new Database(path.toNamespacedPath(outputPath), { fileMustExist: true });
    try {
      await prepareReadySyncIdentityIndex(createBetterSqliteDbPort(snapshot));
      await buildSyncIdentityNodeFactIndex(createBetterSqliteDbPort(snapshot));
      await sealSyncIdentityFactProof(createBetterSqliteDbPort(snapshot));
    }
    finally { snapshot.close(); }
    return openSyncIdentitySourceView(outputPath, expectedId);
  } catch (error) {
    await fs.rm(outputPath, { force: true });
    throw error;
  }
}

export function openSyncIdentitySourceView(filePath: string, expectedId?: string) {
  const view = openSyncPackSourceView(filePath);
  if (expectedId && view.sourceViewId !== expectedId) {
    view.close();
    throw new Error('sync_identity_source_view_changed');
  }
  try {
    const sqlite = new Database(path.toNamespacedPath(filePath), { readonly: true, fileMustExist: true });
    try { verifyDesktopIdentityFactProof(sqlite); }
    catch (error) { sqlite.close(); throw error; }
    return { sourceViewId: view.sourceViewId, sourceEpoch: view.sourceEpoch,
      driver: view.driver,
      port: createBetterSqliteDbPort(sqlite),
      close: () => { sqlite.close(); view.close(); } };
  } catch (error) {
    view.close();
    throw error;
  }
}

function verifyDesktopIdentityFactProof(sqlite: Database.Database) {
  let seal: { revision: string; root: string } | undefined;
  try {
    seal = sqlite.prepare(`SELECT proof_revision AS revision, proof_root AS root
      FROM sync_identity_source_proof WHERE singleton_id = 1`).get() as typeof seal;
  } catch { throw new Error('sync_identity_source_view_changed'); }
  const summary = sqlite.prepare(`SELECT partition, row_count, proof_digest AS digest
    FROM sync_identity_node_fact_summary ORDER BY partition`).all() as
    Array<{ partition: number; row_count: number; digest: string }>;
  const root = computeSyncIdentityNodeFactProofRoot(summary);
  if (seal?.revision !== SYNC_IDENTITY_FACT_PROOF_REVISION || seal.root !== root) {
    throw new Error('sync_identity_source_view_changed');
  }
}
