import { repairTextAnchorLocatorInContent, type TextAnchorLocator } from '../anchors/textAnchorLocator.js';

import { parseStoredAnchorLink } from './anchorLinkCodec.js';
import type { DatabaseDriver } from './driver.js';
import { resolveNodeBody, type NodeBodyRow } from './nodeBodyResolution.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';

interface CandidateRow extends NodeBodyRow {
  [column: string]: unknown;
  anchor_link: string | null;
  id: string;
}

export interface ImportedAnchorLocatorRepairResult {
  repairedNodeIds: string[];
  skipped: Array<{ nodeId: string; reason: 'ambiguous' | 'body_unavailable' | 'invalid_anchor_link' | 'non_imported' | 'non_text_locator' | 'no_locator' }>;
  write: boolean;
}

type RawAnchorRepairResult =
  | { reason: ImportedAnchorLocatorRepairResult['skipped'][number]['reason'] }
  | { value: string };

function isTextLocator(locator: unknown): locator is TextAnchorLocator {
  return Boolean(
    locator &&
      typeof locator === 'object' &&
      !('ranges' in locator) &&
      typeof (locator as { from?: unknown }).from === 'number' &&
      typeof (locator as { to?: unknown }).to === 'number' &&
      typeof (locator as { originalText?: unknown }).originalText === 'string'
  );
}

function isTextLocatorGroup(locator: unknown): locator is { ranges: TextAnchorLocator[] } {
  return Boolean(
    locator &&
      typeof locator === 'object' &&
      Array.isArray((locator as { ranges?: unknown }).ranges) &&
      (locator as { ranges: unknown[] }).ranges.every(isTextLocator)
  );
}

function readRepairCandidates(driver: DatabaseDriver, parentNodeId?: string) {
  return driver.queryAll<CandidateRow>(
    `SELECT child.id, child.anchor_link, parent.content, parent.body_blob_hash,
            cbd.data AS body_blob_data
     FROM nodes child
     INNER JOIN nodes parent ON parent.id = child.parent_id AND parent.deleted_at IS NULL
     LEFT JOIN content_blob_data cbd ON cbd.hash = parent.body_blob_hash
     WHERE child.deleted_at IS NULL
       AND child.anchor_link IS NOT NULL
       AND (? IS NULL OR child.parent_id = ?)`,
    [parentNodeId ?? null, parentNodeId ?? null]
  );
}

function repairRawAnchorLink(value: string, parentContent: string): RawAnchorRepairResult {
  const parsed = parseStoredAnchorLink(value);
  if (!parsed) {
    return { reason: 'invalid_anchor_link' as const };
  }
  const raw = JSON.parse(value) as { locator?: unknown; origin?: unknown };
  if (raw.origin !== 'imported') {
    return { reason: 'non_imported' as const };
  }
  if (!raw.locator) {
    return { reason: 'no_locator' as const };
  }
  if (isTextLocatorGroup(raw.locator)) {
    const repairedRanges = raw.locator.ranges.map((locator) => repairTextAnchorLocatorInContent(parentContent, locator));
    if (repairedRanges.some((locator) => locator === null)) {
      return { reason: 'ambiguous' as const };
    }
    raw.locator = { ranges: repairedRanges };
    return { value: JSON.stringify(raw) };
  }
  if (isTextLocator(raw.locator)) {
    const repaired = repairTextAnchorLocatorInContent(parentContent, raw.locator);
    if (!repaired) {
      return { reason: 'ambiguous' as const };
    }
    raw.locator = repaired;
    return { value: JSON.stringify(raw) };
  }
  return { reason: 'non_text_locator' as const };
}

export function repairImportedAnchorLocators(input: {
  driver: DatabaseDriver;
  parentNodeId?: string;
  repairedAt: string;
  write?: boolean;
}): ImportedAnchorLocatorRepairResult {
  const write = input.write === true;
  const repairedNodeIds: string[] = [];
  const skipped: ImportedAnchorLocatorRepairResult['skipped'] = [];

  readRepairCandidates(input.driver, input.parentNodeId).forEach((row) => {
    if (!row.anchor_link) {
      return;
    }
    const body = resolveNodeBody(row);
    if (body.status === 'unavailable') {
      skipped.push({ nodeId: row.id, reason: 'body_unavailable' });
      return;
    }
    const repaired = repairRawAnchorLink(row.anchor_link, body.content);
    if (!('value' in repaired)) {
      skipped.push({ nodeId: row.id, reason: repaired.reason });
      return;
    }
    if (repaired.value === row.anchor_link) {
      return;
    }
    repairedNodeIds.push(row.id);
    if (write) {
      input.driver.execute('UPDATE nodes SET anchor_link = ?, updated_at = ? WHERE id = ?', [
        repaired.value,
        input.repairedAt,
        row.id
      ]);
    }
  });

  if (write && repairedNodeIds.length > 0) {
    enqueueWorkspaceSearchInvalidationForNodeIds(input.driver, repairedNodeIds);
  }

  return { repairedNodeIds, skipped, write };
}
