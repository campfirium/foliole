import { createHash } from 'node:crypto';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

import { validateAnchorInContent } from './readwise-body-recovery-anchors.js';
import type { RecoveryPlan } from './readwise-body-recovery-selection.js';

function placeholders(values: unknown[]) {
  return values.map(() => '?').join(', ');
}

function stableRows(rows: DatabaseRow[]) {
  return rows.map((row) => JSON.stringify(row)).sort();
}

export function captureRecoveryInvariants(driver: DatabaseDriver, plan: RecoveryPlan) {
  const parentIds = plan.apply.map((item) => item.nodeId);
  const sourceIds = plan.apply.map((item) => item.sourceFingerprint);
  const childIds = plan.apply.flatMap((item) => item.anchors.map((anchor) => anchor.childId));
  const parents = parentIds.length ? driver.queryAll(
    `SELECT id, parent_id, kind, title, is_title_manual, hide_title_heading, created_at, deleted_at,
            import_source_fingerprint, import_content_fingerprint
     FROM nodes WHERE id IN (${placeholders(parentIds)})`, parentIds
  ) : [];
  const children = childIds.length ? driver.queryAll(
    `SELECT id, parent_id, kind, title, content, is_title_manual, hide_title_heading,
            created_at, deleted_at, import_source_fingerprint, import_content_fingerprint
     FROM nodes WHERE id IN (${placeholders(childIds)})`, childIds
  ) : [];
  const sources = sourceIds.length ? driver.queryAll(
    `SELECT * FROM import_sources WHERE source_fingerprint IN (${placeholders(sourceIds)})`, sourceIds
  ) : [];
  const runs = sourceIds.length ? driver.queryAll(
    `SELECT * FROM import_runs WHERE source_fingerprint IN (${placeholders(sourceIds)})`, sourceIds
  ) : [];
  const payload = { children: stableRows(children), parents: stableRows(parents),
    runs: stableRows(runs), sources: stableRows(sources) };
  return {
    counts: { children: children.length, importRuns: runs.length, parents: parents.length, sources: sources.length },
    digest: createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  };
}

export function verifyRecoveredState(driver: DatabaseDriver, plan: RecoveryPlan, before: ReturnType<typeof captureRecoveryInvariants>) {
  const after = captureRecoveryInvariants(driver, plan);
  if (after.digest !== before.digest) throw new Error('recovery_invariant_digest_changed');
  for (const candidate of plan.apply) {
    const row = driver.queryOne<{
      blob: string; body_blob_hash: string; body_text: string; content: string; current_version_id: string; version_object_id: string;
      opening_text: string | null; search_content: string; snapshot_json: string;
    }>(
      `SELECT n.content, n.body_blob_hash, n.opening_text, n.current_version_id,
              CAST(cbd.data AS TEXT) AS blob, v.body_text, v.snapshot_json, v.object_id AS version_object_id,
              (SELECT content FROM search.node_search WHERE node_id = n.id LIMIT 1) AS search_content
       FROM nodes n JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       JOIN node_sync_versions v ON v.version_id = n.current_version_id WHERE n.id = ?`, [candidate.nodeId]
    );
    if (!row || row.content !== candidate.recoveryContent || row.blob !== candidate.recoveryContent ||
      row.body_text !== candidate.recoveryContent || row.search_content !== candidate.recoveryContent ||
      row.version_object_id !== candidate.nodeId || !row.opening_text) {
      throw new Error(`recovered_body_verification_failed:${candidate.nodeId}`);
    }
    const snapshot = JSON.parse(row.snapshot_json) as { body_blob_hash?: unknown };
    if (snapshot.body_blob_hash !== row.body_blob_hash) throw new Error(`recovered_snapshot_hash_failed:${candidate.nodeId}`);
    for (const anchor of candidate.anchors) {
      const child = driver.queryOne<{ anchor_link: string; body: string; body_text: string; version_object_id: string }>(
        `SELECT n.anchor_link, COALESCE(CAST(cbd.data AS TEXT), n.content) AS body,
                v.body_text, v.object_id AS version_object_id
         FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
         JOIN node_sync_versions v ON v.version_id = n.current_version_id WHERE n.id = ?`, [anchor.childId]
      );
      if (!child || child.version_object_id !== anchor.childId || child.body_text !== child.body ||
        !validateAnchorInContent(child.anchor_link, candidate.recoveryContent)) {
        throw new Error(`recovered_anchor_verification_failed:${anchor.childId}`);
      }
    }
  }
  return { after, bodyCount: plan.apply.length,
    syncPackCurrentVersionCount: plan.apply.reduce((count, item) => count + 1 + item.anchors.length, 0) };
}
