import { decodeTextBodyBlobData, hashTextBody } from '../../lib/core/database/contentBodyBlobs.js';
import { readDataMigrationState } from '../../lib/core/database/dataMigrationState.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { isLegacyPdfImportPlaceholder } from '../../lib/core/database/legacyPdfImportPlaceholder.js';
import { projectNodeInlineContent } from '../../lib/core/database/nodeInlineProjection.js';
import { storedSyncNodeVersionBody } from '../../lib/core/sync/syncNodeGraph.js';

import type { DatabaseConnection } from './connection.js';
import { repairCurrentVersionBodyWithDriver } from './currentVersionBodyRepair.js';
import {
  BODY_COLLECTION_ID, BODY_RECLAIM_ID, BODY_REPAIR_ID, initialBodyMigrationProgress,
  protectBodyMigration, readBodyMigrationProgress, saveBodyMigrationProgress
} from './legacyBodyMigrationState.js';

interface Candidate extends Record<string, unknown> {
  id: string;
  content: string;
  body_blob_hash: string;
  current_version_id: string | null;
  data: unknown;
  kind: string | null;
  object_id: string | null;
  body_text: string | null;
  snapshot_json: string | null;
  sync_dirty: number;
  editing: number;
}

function inspectCandidate(driver: DatabaseDriver, row: Candidate): { reason: string } | { repair: boolean; retirePlaceholder: boolean } {
  const body = decodeTextBodyBlobData(row.data);
  if (row.kind !== 'text_body' || body === null || hashTextBody(body) !== row.body_blob_hash) {
    return { reason: 'body_blob_invalid_or_missing' };
  }
  if (row.object_id !== row.id || !row.snapshot_json) return { reason: 'current_version_unavailable' };
  let snapshot: { body_blob_hash?: string | null; content?: string };
  try { snapshot = JSON.parse(row.snapshot_json); } catch { return { reason: 'current_version_snapshot_invalid' }; }
  if (!snapshot || typeof snapshot !== 'object') return { reason: 'current_version_snapshot_invalid' };
  const versionBody = storedSyncNodeVersionBody({ body_text: row.body_text, snapshot_json: row.snapshot_json });
  const contradictory = row.content !== '' && row.content !== body && row.content !== projectNodeInlineContent(body);
  const retirePlaceholder = contradictory && snapshot.body_blob_hash === row.body_blob_hash &&
    (versionBody === row.content || versionBody === body) && isLegacyPdfImportPlaceholder(driver, row.id, body);
  if (contradictory && !retirePlaceholder) return { reason: 'contradictory_inline_body' };
  const repair = versionBody !== body || Boolean(snapshot.body_blob_hash && snapshot.body_blob_hash !== row.body_blob_hash);
  if (!repair && !retirePlaceholder) {
    return { repair: false, retirePlaceholder: false };
  }
  if (row.sync_dirty) return { reason: 'node_dirty' };
  if (row.editing) return { reason: 'editor_active' };
  return { repair, retirePlaceholder };
}


function loadConsistencyCandidates(driver: DatabaseDriver, retry: boolean) {
  return driver.queryAll<Candidate>(
    `SELECT n.id, n.content, n.body_blob_hash, n.current_version_id, n.sync_dirty,
      b.kind, d.data, v.object_id, v.body_text, v.snapshot_json,
      EXISTS (SELECT 1 FROM node_version_local_holds h WHERE h.object_id = n.id) AS editing
     FROM nodes n LEFT JOIN content_blobs b ON b.hash = n.body_blob_hash
     LEFT JOIN content_blob_data d ON d.hash = n.body_blob_hash
     LEFT JOIN node_sync_versions v ON v.version_id = n.current_version_id
     WHERE n.body_blob_hash IS NOT NULL
       AND (? = 0 OR n.id IN (SELECT object_id FROM legacy_body_migration_protections WHERE migration_id = ?))`,
    [retry ? 1 : 0, BODY_REPAIR_ID]);
}

export function needsLegacyBodyConsistencySnapshot(connection: Pick<DatabaseConnection, 'driver' | 'sqlite'>) {
  const state = readDataMigrationState(connection.sqlite, BODY_REPAIR_ID);
  if (state?.status === 'completed') return false;
  return loadConsistencyCandidates(connection.driver, Boolean(state)).some((row) => {
    const result = inspectCandidate(connection.driver, row);
    return 'repair' in result && (result.repair || result.retirePlaceholder);
  });
}

/** Called inside the schema transaction, before any sync or merge consumer is installed. */
export function migrateLegacyBodyConsistency(connection: Pick<DatabaseConnection, 'driver' | 'sqlite'>,
  hostName: string, fresh: boolean) {
  if (readDataMigrationState(connection.sqlite, BODY_REPAIR_ID)?.status === 'completed') return;
  const { driver } = connection;
  const progress = readBodyMigrationProgress(driver, BODY_REPAIR_ID) ?? initialBodyMigrationProgress(BODY_REPAIR_ID, 'consistency');
  const retry = Boolean(readBodyMigrationProgress(driver, BODY_REPAIR_ID));
  let protectedCount = 0;
  if (!fresh) for (const row of loadConsistencyCandidates(driver, retry)) {
    driver.execute('DELETE FROM legacy_body_migration_protections WHERE migration_id = ? AND object_id = ?', [BODY_REPAIR_ID, row.id]);
    const inspection = inspectCandidate(driver, row);
    if ('reason' in inspection) {
      protectBodyMigration(driver, BODY_REPAIR_ID, row.id, inspection.reason);
      protectedCount++;
    } else {
      if (inspection.repair && row.current_version_id && repairCurrentVersionBodyWithDriver(driver, {
        nodeId: row.id, expectedVersionId: row.current_version_id, expectedBodyBlobHash: row.body_blob_hash,
        hostName, now: new Date().toISOString()
      })) progress.changed++;
      if (inspection.retirePlaceholder) {
        driver.execute('UPDATE nodes SET content = ? WHERE id = ?',
          [projectNodeInlineContent(decodeTextBodyBlobData(row.data)!), row.id]);
        driver.execute('DELETE FROM legacy_body_migration_protections WHERE migration_id = ? AND object_id = ?',
          [BODY_COLLECTION_ID, row.id]);
      }
    }
  }
  saveBodyMigrationProgress(connection, progress, protectedCount === 0);
  if (fresh) for (const id of [BODY_COLLECTION_ID, BODY_RECLAIM_ID]) {
    saveBodyMigrationProgress(connection, initialBodyMigrationProgress(id, 'done'), true);
  }
}
