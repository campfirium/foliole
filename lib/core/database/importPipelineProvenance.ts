import type { PersistedImportRecord } from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';

export function establishNodeImportProvenance(input: {
  contentFingerprint: string;
  driver: DatabaseDriver;
  importedAt: string;
  nodeId: string;
  sourceFingerprint: string;
}) {
  input.driver.execute(
    `UPDATE nodes
     SET import_source_fingerprint = ?,
         import_content_fingerprint = ?,
         updated_at = ?,
         sync_dirty = 1
     WHERE id = ?
       AND (
         import_source_fingerprint IS NOT ?
         OR import_content_fingerprint IS NOT ?
       )`,
    [
      input.sourceFingerprint,
      input.contentFingerprint,
      input.importedAt,
      input.nodeId,
      input.sourceFingerprint,
      input.contentFingerprint
    ]
  );
}

export function establishImportedNodeIdentity(
  driver: DatabaseDriver,
  record: PersistedImportRecord,
  nodeId: string
) {
  establishNodeImportProvenance({
    contentFingerprint: record.contentFingerprint,
    driver,
    importedAt: record.importedAt,
    nodeId,
    sourceFingerprint: record.sourceFingerprint
  });
}
