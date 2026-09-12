import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';

import { captureSyncGroupDigest } from './t181-jpeg-body-repair-plan.js';
import type { JpegBodyRepairPlan } from './t181-jpeg-body-repair-types.js';

export function applyJpegBodyRepairPlan(input: {
  afterCandidate?: (nodeId: string) => void;
  driver: DatabaseDriver;
  hostName: string;
  now: string;
  plan: JpegBodyRepairPlan;
}) {
  const versions: Array<{ nodeId: string; versionId: string }> = [];
  input.driver.transaction(() => {
    if (captureSyncGroupDigest(input.driver) !== input.plan.syncGroupDigest) {
      throw new Error('sync_group_state_drifted');
    }
    input.plan.candidates.forEach((candidate, index) => {
      const state = input.driver.queryOne<{
        body_blob_hash: string | null;
        current_version_id: string | null;
        updated_at: string;
      }>('SELECT body_blob_hash, current_version_id, updated_at FROM nodes WHERE id = ?', [candidate.nodeId]);
      const body = loadNodeBodyResolution(input.driver, candidate.nodeId);
      if (!state || !body || body.status === 'unavailable' || body.content !== candidate.previousContent ||
          state.body_blob_hash !== candidate.bodyHash || state.current_version_id !== candidate.currentVersionId ||
          state.updated_at !== candidate.updatedAt) throw new Error(`repair_candidate_drifted:${candidate.nodeId}`);
      const updatedAt = new Date(Date.parse(input.now) + index).toISOString();
      const mutation = applyParentContentChange({
        driver: input.driver, nextContent: candidate.nextContent, nodeId: candidate.nodeId,
        previousContent: candidate.previousContent, updatedAt
      });
      if (!mutation.written || mutation.affectedChildIds.length || mutation.skippedAnchors.length) {
        throw new Error(`repair_body_mutation_not_isolated:${candidate.nodeId}`);
      }
      input.driver.execute(
        'UPDATE nodes SET last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?',
        [input.hostName, candidate.nodeId]
      );
      const versionId = flushNodeSyncVersionWithDriver(input.driver, candidate.nodeId, input.hostName, updatedAt);
      if (!versionId) throw new Error(`repair_version_flush_failed:${candidate.nodeId}`);
      versions.push({ nodeId: candidate.nodeId, versionId });
      input.afterCandidate?.(candidate.nodeId);
    });
    const residual = input.driver.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.deleted_at IS NULL AND (CASE WHEN NULLIF(TRIM(n.body_blob_hash), '') IS NULL THEN n.content
                   WHEN cbd.hash IS NOT NULL THEN CAST(cbd.data AS TEXT) ELSE '' END)
             GLOB '*asset://????????????????????????????????????????????????????????????????.jpeg*'`
    );
    if ((residual?.count ?? 0) !== 0) throw new Error('jpeg_body_references_remain');
  });
  return versions;
}
