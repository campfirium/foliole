import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';

import type { AnchorRepairMutation, AnchorRepairPlan } from './readwise-anchor-repair-types.js';

export interface AnchorRepairApplyResult {
  changed: Array<{ childId: string; status: string; versionId: string }>;
}

function assertMutationInput(driver: DatabaseDriver, mutation: AnchorRepairMutation) {
  const row = driver.queryOne<{
    anchor_link: string;
    body_blob_hash: string;
    child_version_id: string;
    parent_version_id: string;
  }>(
    `SELECT c.anchor_link, c.current_version_id AS child_version_id,
            p.body_blob_hash, p.current_version_id AS parent_version_id
     FROM nodes c JOIN nodes p ON p.id = c.parent_id
     WHERE c.id = ? AND p.id = ? AND c.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [mutation.childId, mutation.parentId]
  );
  if (!row || row.anchor_link !== mutation.expectedAnchorLink ||
    row.child_version_id !== mutation.expectedChildVersionId ||
    row.body_blob_hash !== mutation.expectedParentBodyHash ||
    row.parent_version_id !== mutation.expectedParentVersionId) {
    throw new Error(`anchor_repair_input_drift:${mutation.childId}`);
  }
}

export function applyAnchorRepairPlan(input: {
  afterMutation?: (childId: string) => void;
  driver: DatabaseDriver;
  hostName: string;
  now: string;
  plan: AnchorRepairPlan;
}): AnchorRepairApplyResult {
  const changed: AnchorRepairApplyResult['changed'] = [];
  input.driver.transaction(() => {
    for (const mutation of [...input.plan.apply, ...input.plan.unmap]) {
      assertMutationInput(input.driver, mutation);
      input.driver.execute(
        `UPDATE nodes SET anchor_link = ?, anchor_resolution_status = ?, anchor_source_version_id = ?,
                updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
        [mutation.nextAnchorLink, mutation.nextStatus, mutation.expectedParentVersionId,
          input.now, input.hostName, mutation.childId]
      );
      const versionId = flushNodeSyncVersionWithDriver(input.driver, mutation.childId, input.hostName, input.now);
      if (!versionId) throw new Error(`anchor_repair_version_flush_failed:${mutation.childId}`);
      changed.push({ childId: mutation.childId, status: mutation.nextStatus, versionId });
      input.afterMutation?.(mutation.childId);
    }
  });
  return { changed };
}
