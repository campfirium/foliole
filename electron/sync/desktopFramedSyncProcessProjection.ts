import type { DbRow } from '../../lib/core/sync/dbPort.js';
import { IDENTITY_REVIEW_COLUMNS } from '../../lib/core/sync/syncIdentityFactSourceRows.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { openDatabaseConnection } from '../database/connection.js';

import { projectDesktopFramedSyncNodeRecord } from './desktopFramedSyncNodeProjection.js';
import { resolveDesktopFramedSyncNodeResources } from './desktopFramedSyncNodeResources.js';
import {
  projectDesktopFramedSyncParentRelation,
  projectDesktopFramedSyncReview
} from './desktopFramedSyncRelationReviewProjection.js';

/** Build the complete minimal-process transfer from the selected node version. */
export function projectDesktopFramedSyncProcessTransfer(record: NativeSyncNodeRecord) {
  if (!record.version_id) throw new Error('framed_sync_process_version_required');
  const resources = resolveDesktopFramedSyncNodeResources(record);
  const projection = projectDesktopFramedSyncNodeRecord(record, resources.map((resource) => resource.blob));
  const driver = openDatabaseConnection().driver;
  const parents = driver.queryAll<DbRow>(`SELECT version.object_id, parent.version_id,
    parent.parent_version_id, parent.ordinal FROM node_sync_version_parents parent
    JOIN node_sync_versions version ON version.version_id = parent.version_id
    WHERE parent.version_id = ? ORDER BY parent.ordinal`, [record.version_id]);
  const reviews = driver.queryAll<DbRow>(`SELECT ${IDENTITY_REVIEW_COLUMNS.join(', ')}
    FROM review_log WHERE node_id = ? ORDER BY reviewed_at, op_id`, [record.object_id]);
  return {
    bodyBlob: projection.bodyBlob,
    resources,
    manifest: {
      blobs: projection.manifest.blobs,
      facts: [
        ...projection.manifest.facts,
        ...parents.map(projectDesktopFramedSyncParentRelation),
        ...reviews.map(projectDesktopFramedSyncReview)
      ]
    }
  };
}
