import { createHash } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';

interface ProtectionDetails {
  attachmentRows: Array<Record<string, unknown>>;
  immutableNodeRows: Array<Record<string, unknown>>;
  nodeIds: string[];
  nodeReviewRows: Array<Record<string, unknown>>;
  reviewLogRows: Array<Record<string, unknown>>;
}

export function captureRepairProtection(driver: DatabaseDriver, rootNodeIds: string[]) {
  const ids = descendants(driver, rootNodeIds);
  const protectedIds = ids.filter((id) => !id.startsWith('node-epub-') && !rootNodeIds.includes(id));
  const details: ProtectionDetails = {
    attachmentRows: rowsByIds(driver, 'node_attachments', 'node_id', ids),
    immutableNodeRows: immutableNodes(driver, protectedIds),
    nodeIds: protectedIds.sort(),
    nodeReviewRows: rowsByIds(driver, 'node_review', 'node_id', ids),
    reviewLogRows: rowsByIds(driver, 'review_log', 'node_id', ids)
  };
  return {
    details,
    summary: {
      attachmentRelations: details.attachmentRows.length,
      attachmentRelationsHash: hashRows(details.attachmentRows),
      immutableNodesHash: hashRows(details.immutableNodeRows),
      nonReadwiseRoots: rootNodeIds.filter((id) => !id.startsWith('node-readwise-')).length,
      nodeReviewRows: details.nodeReviewRows.length,
      nodeReviewRowsHash: hashRows(details.nodeReviewRows),
      otherChildren: protectedIds.filter((id) => !id.startsWith('node-readwise-')).length,
      otherFactsIncludingNonReadwiseRoots: protectedIds.filter((id) => !id.startsWith('node-readwise-')).length
        + rootNodeIds.filter((id) => !id.startsWith('node-readwise-')).length,
      readwiseChildren: protectedIds.filter((id) => id.startsWith('node-readwise-')).length,
      reviewLogRows: details.reviewLogRows.length,
      reviewLogRowsHash: hashRows(details.reviewLogRows)
    }
  };
}

export function assertRepairProtectionPreserved(before: ProtectionDetails, after: ProtectionDetails) {
  assertEqual('protected_node_ids', before.nodeIds, after.nodeIds);
  assertEqual('protected_node_fields', before.immutableNodeRows, after.immutableNodeRows);
  assertEqual('node_review', before.nodeReviewRows, after.nodeReviewRows);
  assertEqual('review_log', before.reviewLogRows, after.reviewLogRows);
  const afterAttachments = new Set(after.attachmentRows.map(stableJson));
  before.attachmentRows.forEach((row) => {
    if (!afterAttachments.has(stableJson(row))) throw new Error('readwise_epub_repair_attachment_relation_lost');
  });
}

export function coverageHash(value: string) {
  return createHash('sha256').update(normalizeCoverage(value)).digest('hex');
}

export function rootSourceContent(value: string) {
  const blocks = value.trim().split(/\n{2,}/u);
  if (/^#\s/u.test(blocks[0] ?? '')) blocks.shift();
  if (/^\[Open in Reader\]/u.test(blocks.at(-1) ?? '')) blocks.pop();
  return blocks.join('\n\n');
}

function descendants(driver: DatabaseDriver, rootNodeIds: string[]) {
  if (rootNodeIds.length === 0) return [];
  const marks = rootNodeIds.map(() => '?').join(', ');
  return driver.queryAll<{ id: string }>(`WITH RECURSIVE tree(id) AS (
    SELECT id FROM nodes WHERE id IN (${marks}) AND deleted_at IS NULL
    UNION ALL SELECT child.id FROM nodes child JOIN tree ON child.parent_id = tree.id
    WHERE child.deleted_at IS NULL
  ) SELECT id FROM tree ORDER BY id`, rootNodeIds).map((row) => row.id);
}

function immutableNodes(driver: DatabaseDriver, ids: string[]) {
  if (ids.length === 0) return [];
  const marks = ids.map(() => '?').join(', ');
  return driver.queryAll<Record<string, unknown>>(`SELECT id, kind, priority, desired_retention, title,
    is_title_manual, hide_title_heading, content, body_blob_hash, opening_text, virtual_filter, reveal,
    position, created_at, enable_short_term, sequential_reading_enabled, manual_child_order, shelved_at,
    import_source_fingerprint, import_content_fingerprint, anchor_resolution_status, anchor_source_version_id
    FROM nodes WHERE id IN (${marks}) AND deleted_at IS NULL ORDER BY id`, ids);
}

function rowsByIds(
  driver: DatabaseDriver,
  table: 'node_attachments' | 'node_review' | 'review_log',
  column: string,
  ids: string[]
) {
  if (ids.length === 0) return [];
  const marks = ids.map(() => '?').join(', ');
  return driver.queryAll<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE ${column} IN (${marks}) ORDER BY ${column}`, ids
  ).sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

export function normalizeCoverage(value: string) {
  return value.replace(/\blink(?=(?:!\[|[A-Z*]))/gu, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, '')
    .replace(/\*\*Image unavailable\.\*\*/gu, '')
    .replace(/\s+/gu, ' ').trim();
}

export function describeCoverageDifference(left: string, right: string) {
  const normalizedLeft = normalizeCoverage(left);
  const normalizedRight = normalizeCoverage(right);
  let index = 0;
  while (normalizedLeft[index] === normalizedRight[index] && index < normalizedLeft.length) index += 1;
  return {
    index,
    leftContext: normalizedLeft.slice(Math.max(0, index - 40), index + 80),
    leftLength: normalizedLeft.length,
    rightContext: normalizedRight.slice(Math.max(0, index - 40), index + 80),
    rightLength: normalizedRight.length
  };
}

function hashRows(rows: Array<Record<string, unknown>>) {
  return createHash('sha256').update(stableJson(rows)).digest('hex');
}

function assertEqual(label: string, before: unknown, after: unknown) {
  if (stableJson(before) !== stableJson(after)) throw new Error(`readwise_epub_repair_${label}_changed`);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
