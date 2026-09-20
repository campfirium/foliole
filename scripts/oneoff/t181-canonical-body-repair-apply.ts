import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';

import {
  captureChildAnchorRows,
  captureNodeRowDigest,
  countJpegBodyAddresses,
  hashValue,
  type RepairPlan
} from './t181-canonical-body-repair-plan.js';
import { captureSyncGroupDigest } from './t181-jpeg-body-repair-plan.js';

interface VersionReceipt {
  afterVersionId: string;
  beforeVersionId: string | null;
  nodeId: string;
}

function assertFrozen(driver: DatabaseDriver, plan: RepairPlan) {
  if (captureSyncGroupDigest(driver) !== plan.syncGroupDigest) throw new Error('sync_group_state_drifted');
  for (const candidate of plan.candidates) {
    const body = loadNodeBodyResolution(driver, candidate.nodeId);
    if (!body || body.status !== 'resolved' || body.content !== candidate.beforeBody ||
        body.bodyBlobHash !== candidate.bodyBlobHash ||
        captureNodeRowDigest(driver, candidate.nodeId) !== candidate.rowDigest ||
        hashValue(captureChildAnchorRows(driver, candidate.nodeId)) !== candidate.anchorSnapshotDigest) {
      throw new Error(`repair_candidate_drifted:${candidate.nodeId}`);
    }
    for (const child of candidate.children) {
      if (captureNodeRowDigest(driver, child.nodeId) !== child.rowDigest) {
        throw new Error(`repair_candidate_drifted:${child.nodeId}`);
      }
    }
  }
}

function assertNoRemainingAddresses(driver: DatabaseDriver) {
  const rows = driver.queryAll<{ body_blob_data: unknown; body_blob_hash: string | null; content: string; id: string }>(
    `SELECT n.id, n.content, n.body_blob_hash, cbd.data AS body_blob_data
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.deleted_at IS NULL`
  );
  for (const row of rows) {
    const body = loadNodeBodyResolution(driver, row.id);
    if (!body || body.status !== 'resolved') throw new Error(`node_body_unavailable:${row.id}`);
    if (countJpegBodyAddresses(body.content) !== 0) throw new Error(`jpeg_body_references_remain:${row.id}`);
  }
}

export function applyCanonicalBodyRepairPlan(input: {
  driver: DatabaseDriver;
  hostName: string;
  now: string;
  plan: RepairPlan;
  afterCandidate?: (nodeId: string) => void;
  verifyBeforeCommit?: () => void;
}) {
  if (input.plan.candidates.length === 0) return [] as VersionReceipt[];
  const versions: VersionReceipt[] = [];
  input.driver.transaction(() => {
    assertFrozen(input.driver, input.plan);
    input.plan.candidates.forEach((candidate, index) => {
      const updatedAt = new Date(Date.parse(input.now) + index).toISOString();
      const mutation = applyParentContentChange({
        driver: input.driver, nodeId: candidate.nodeId,
        previousContent: candidate.beforeBody, nextContent: candidate.afterBody, updatedAt
      });
      const expectedChildIds = candidate.children.map((child) => child.nodeId).sort();
      if (!mutation.written || mutation.skippedAnchors.length !== 0 ||
          JSON.stringify([...mutation.affectedChildIds].sort()) !== JSON.stringify(expectedChildIds)) {
        throw new Error(`repair_anchor_mutation_drifted:${candidate.nodeId}`);
      }
      input.driver.execute(
        'UPDATE nodes SET last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?',
        [input.hostName, candidate.nodeId]
      );
      const versionId = flushNodeSyncVersionWithDriver(
        input.driver, candidate.nodeId, input.hostName, updatedAt
      );
      if (!versionId) throw new Error(`repair_version_flush_failed:${candidate.nodeId}`);
      versions.push({ nodeId: candidate.nodeId,
        beforeVersionId: candidate.currentVersionId, afterVersionId: versionId });
      for (const child of candidate.children) {
        const row = input.driver.queryOne<{
          anchor_link: string; image_regions: string | null; current_version_id: string | null;
        }>('SELECT anchor_link, image_regions, current_version_id FROM nodes WHERE id = ?', [child.nodeId]);
        if (!row || row.anchor_link !== child.afterAnchor || row.image_regions !== child.afterRegions ||
            row.current_version_id !== child.currentVersionId) {
          throw new Error(`repair_child_anchor_drifted:${child.nodeId}`);
        }
        input.driver.execute(
          'UPDATE nodes SET last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?',
          [input.hostName, child.nodeId]
        );
        const childVersionId = flushNodeSyncVersionWithDriver(
          input.driver, child.nodeId, input.hostName, updatedAt
        );
        if (!childVersionId) throw new Error(`repair_child_version_flush_failed:${child.nodeId}`);
        versions.push({ nodeId: child.nodeId,
          beforeVersionId: child.currentVersionId, afterVersionId: childVersionId });
      }
      input.afterCandidate?.(candidate.nodeId);
    });
    assertNoRemainingAddresses(input.driver);
    input.verifyBeforeCommit?.();
  });
  return versions;
}
