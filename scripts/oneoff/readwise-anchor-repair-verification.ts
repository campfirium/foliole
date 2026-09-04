import { createHash } from 'node:crypto';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { resolveImportedBodySearchFrom } from '../../lib/core/database/importHighlightBodyMatching.js';

import type { AnchorRepairPlan, TextLocator } from './readwise-anchor-repair-types.js';

function placeholders(values: unknown[]) {
  return values.map(() => '?').join(', ');
}

function stableRows(rows: DatabaseRow[]) {
  return rows.map((row) => JSON.stringify(row)).sort();
}

export function captureAnchorRepairInvariants(driver: DatabaseDriver, plan: AnchorRepairPlan) {
  const mutations = [...plan.apply, ...plan.unmap];
  const parentIds = Array.from(new Set(mutations.map((item) => item.parentId)));
  const childIds = mutations.map((item) => item.childId);
  const parents = parentIds.length ? driver.queryAll(
    `SELECT id, parent_id, kind, title, content, body_blob_hash, opening_text, current_version_id,
            created_at, deleted_at, import_source_fingerprint, import_content_fingerprint
     FROM nodes WHERE id IN (${placeholders(parentIds)})`, parentIds
  ) : [];
  const children = childIds.length ? driver.queryAll(
    `SELECT id, parent_id, kind, title, content, body_blob_hash, reveal, image_regions,
            created_at, deleted_at, import_source_fingerprint, import_content_fingerprint
     FROM nodes WHERE id IN (${placeholders(childIds)})`, childIds
  ) : [];
  const payload = { children: stableRows(children), parents: stableRows(parents) };
  return { counts: { children: children.length, parents: parents.length },
    digest: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}

function readLocators(anchorLink: string): TextLocator[] {
  const parsed = JSON.parse(anchorLink) as { locator?: TextLocator | { ranges?: TextLocator[] } };
  if (!parsed.locator) return [];
  return 'ranges' in parsed.locator ? parsed.locator.ranges ?? [] : [parsed.locator];
}

export function verifyAnchorRepairState(
  driver: DatabaseDriver,
  plan: AnchorRepairPlan,
  before: ReturnType<typeof captureAnchorRepairInvariants>
) {
  const after = captureAnchorRepairInvariants(driver, plan);
  if (after.digest !== before.digest) throw new Error('anchor_repair_invariant_digest_changed');
  for (const mutation of [...plan.apply, ...plan.unmap]) {
    const row = driver.queryOne<{
      anchor_link: string;
      anchor_resolution_status: string;
      anchor_source_version_id: string;
      body: string;
      body_text: string;
      parent_body: string;
      snapshot_json: string;
      version_object_id: string;
    }>(
      `SELECT c.anchor_link, c.anchor_resolution_status, c.anchor_source_version_id,
              COALESCE(CAST(cbd.data AS TEXT), c.content) AS body,
              cv.body_text, cv.snapshot_json, cv.object_id AS version_object_id,
              CAST(pbd.data AS TEXT) AS parent_body
       FROM nodes c LEFT JOIN content_blob_data cbd ON cbd.hash = c.body_blob_hash
       JOIN node_sync_versions cv ON cv.version_id = c.current_version_id
       JOIN nodes p ON p.id = c.parent_id JOIN content_blob_data pbd ON pbd.hash = p.body_blob_hash
       WHERE c.id = ? AND p.id = ?`, [mutation.childId, mutation.parentId]
    );
    if (!row || row.anchor_link !== mutation.nextAnchorLink || row.anchor_resolution_status !== mutation.nextStatus ||
      row.anchor_source_version_id !== mutation.expectedParentVersionId || row.body_text !== row.body ||
      row.version_object_id !== mutation.childId) {
      throw new Error(`anchor_repair_state_failed:${mutation.childId}`);
    }
    const snapshot = JSON.parse(row.snapshot_json) as {
      anchor_link?: unknown;
      anchor_resolution_status?: unknown;
      anchor_source_version_id?: unknown;
    };
    if (snapshot.anchor_link !== row.anchor_link || snapshot.anchor_resolution_status !== row.anchor_resolution_status ||
      snapshot.anchor_source_version_id !== row.anchor_source_version_id) {
      throw new Error(`anchor_repair_snapshot_failed:${mutation.childId}`);
    }
    if (mutation.nextStatus === 'resolved') {
      const visibleFrom = resolveImportedBodySearchFrom(row.parent_body);
      const valid = readLocators(row.anchor_link).every((range) => range.from >= visibleFrom &&
        row.parent_body.slice(range.from, range.to) === range.originalText);
      if (!valid) throw new Error(`anchor_repair_visible_locator_failed:${mutation.childId}`);
    }
  }
  return { after, syncPackCurrentVersionCount: plan.apply.length + plan.unmap.length };
}
