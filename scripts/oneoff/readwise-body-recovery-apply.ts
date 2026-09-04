import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';

import type { RecoveryPlan } from './readwise-body-recovery-selection.js';

export interface RecoveryApplyResult {
  recovered: Array<{ bodyHash: string; nodeId: string; versionId: string }>;
}

export async function applyAfterVerifiedBackup<T>(input: {
  apply: () => T;
  createVerifiedBackup: () => Promise<string>;
}) {
  const backupPath = await input.createVerifiedBackup();
  return { backupPath, result: input.apply() };
}

export function applyRecoveryPlan(input: {
  driver: DatabaseDriver;
  hostName: string;
  now: string;
  plan: RecoveryPlan;
  afterCandidate?: (nodeId: string) => void;
}): RecoveryApplyResult {
  const recovered: RecoveryApplyResult['recovered'] = [];
  input.driver.transaction(() => {
    for (const candidate of input.plan.apply) {
      const mutation = applyParentContentChange({
        driver: input.driver, nextContent: candidate.recoveryContent,
        nodeId: candidate.nodeId, updatedAt: input.now
      });
      if (!mutation.written || mutation.skippedAnchors.length > 0) throw new Error(`body_mutation_failed:${candidate.nodeId}`);
      input.driver.execute(
        'UPDATE nodes SET last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?',
        [input.hostName, candidate.nodeId]
      );
      for (const anchor of candidate.anchors) {
        input.driver.execute(
          `UPDATE nodes SET anchor_link = ?, anchor_resolution_status = 'resolved',
           anchor_source_version_id = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
          [anchor.anchorLink, anchor.sourceVersionId, input.now, input.hostName, anchor.childId]
        );
        const childVersionId = flushNodeSyncVersionWithDriver(input.driver, anchor.childId, input.hostName, input.now);
        if (!childVersionId) throw new Error(`anchor_version_flush_failed:${anchor.childId}`);
      }
      const versionId = flushNodeSyncVersionWithDriver(input.driver, candidate.nodeId, input.hostName, input.now);
      if (!versionId) throw new Error(`body_version_flush_failed:${candidate.nodeId}`);
      const row = input.driver.queryOne<{ body_blob_hash: string }>('SELECT body_blob_hash FROM nodes WHERE id = ?', [candidate.nodeId]);
      if (!row?.body_blob_hash) throw new Error(`body_hash_missing:${candidate.nodeId}`);
      recovered.push({ bodyHash: row.body_blob_hash, nodeId: candidate.nodeId, versionId });
      input.afterCandidate?.(candidate.nodeId);
    }
  });
  return { recovered };
}
