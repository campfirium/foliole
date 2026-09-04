import { createHash } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import {
  classifyImportedBodyOccurrence,
  resolveImportedBodySearchFrom
} from '../../lib/core/database/importHighlightBodyMatching.js';

import type {
  AnchorRepairMutation,
  AnchorRepairPlan,
  BodyRecoveryReceipt,
  ReceiptAnchor,
  TextLocator
} from './readwise-anchor-repair-types.js';

interface ParentRow {
  [column: string]: unknown;
  body: string;
  body_blob_hash: string;
  current_version_id: string;
  title: string;
}

interface ChildRow {
  [column: string]: unknown;
  anchor_link: string;
  anchor_resolution_status: string | null;
  anchor_source_version_id: string | null;
  current_version_created_at: string;
  current_version_id: string;
  current_version_snapshot: string;
}

type RawAnchor = { locator?: unknown; [key: string]: unknown };

function parseAnchor(value: string): RawAnchor | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as RawAnchor : null;
  } catch {
    return null;
  }
}

function readLocators(value: unknown): TextLocator[] | null {
  if (!value || typeof value !== 'object') return null;
  const locator = value as { from?: unknown; originalText?: unknown; ranges?: unknown; to?: unknown };
  if (Array.isArray(locator.ranges)) {
    const ranges = locator.ranges.map(readLocators);
    return ranges.some((range) => !range || range.length !== 1) ? null : ranges.flatMap((range) => range ?? []);
  }
  return Number.isInteger(locator.from) && Number.isInteger(locator.to) && typeof locator.originalText === 'string'
    ? [{ from: locator.from as number, originalText: locator.originalText, to: locator.to as number }]
    : null;
}

function withLocators(anchor: RawAnchor, locators: TextLocator[]) {
  const current = readLocators(anchor.locator);
  const locator = current?.length === 1 ? locators[0] : { ranges: locators };
  return JSON.stringify({ ...anchor, locator });
}

function readParent(driver: DatabaseDriver, nodeId: string) {
  return driver.queryOne<ParentRow>(
    `SELECT n.title, n.body_blob_hash, n.current_version_id, CAST(cbd.data AS TEXT) AS body
     FROM nodes n JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ? AND n.deleted_at IS NULL`, [nodeId]
  );
}

function readChild(driver: DatabaseDriver, childId: string, parentId: string) {
  return driver.queryOne<ChildRow>(
    `SELECT n.anchor_link, n.anchor_resolution_status, n.anchor_source_version_id, n.current_version_id,
            v.created_at AS current_version_created_at, v.snapshot_json AS current_version_snapshot
     FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id
     WHERE n.id = ? AND n.parent_id = ? AND n.deleted_at IS NULL`, [childId, parentId]
  );
}

function sourceSnapshotMatches(row: ChildRow, anchor: ReceiptAnchor, generatedAt: string) {
  if (row.current_version_created_at !== generatedAt || row.anchor_link !== anchor.anchorLink) return false;
  try {
    const snapshot = JSON.parse(row.current_version_snapshot) as { anchor_link?: unknown };
    return snapshot.anchor_link === anchor.anchorLink;
  } catch {
    return false;
  }
}

function stablePayload(plan: Omit<AnchorRepairPlan, 'generatedAt' | 'planHash'>) {
  return { apply: plan.apply, manualReview: plan.manualReview, noRepair: plan.noRepair,
    sourcePlanHash: plan.sourcePlanHash, unmap: plan.unmap };
}

function addAnchorDecision(input: {
  anchor: ReceiptAnchor;
  child: ChildRow;
  parent: ParentRow;
  parentId: string;
  partial: Omit<AnchorRepairPlan, 'generatedAt' | 'planHash'>;
  sourceGeneratedAt: string;
  trustCurrentBaseline: boolean;
}) {
  const parsed = parseAnchor(input.child.anchor_link);
  const locators = parsed ? readLocators(parsed.locator) : null;
  const visibleFrom = resolveImportedBodySearchFrom(input.parent.body);
  const manual = (reason: string) => input.partial.manualReview.push({
    childId: input.anchor.childId, parentId: input.parentId, reason, title: input.parent.title
  });
  if (!parsed || !locators?.length || visibleFrom === 0) return manual('invalid_anchor_or_frontmatter');
  const allRawMatch = locators.every((range) => input.parent.body.slice(range.from, range.to) === range.originalText);
  const insideFrontmatter = locators.some((range) => range.from < visibleFrom);
  if (!insideFrontmatter) {
    input.partial.noRepair.push({ childId: input.anchor.childId, parentId: input.parentId,
      reason: 'locator_already_in_visible_body', title: input.parent.title });
    return;
  }
  if (!allRawMatch) return manual('frontmatter_locator_text_mismatch');
  const alreadyUnmapped = input.child.anchor_link === input.anchor.anchorLink &&
    input.child.anchor_source_version_id === input.parent.current_version_id &&
    input.child.anchor_resolution_status?.startsWith('unmapped_');
  if (alreadyUnmapped) {
    input.partial.noRepair.push({ childId: input.anchor.childId, parentId: input.parentId,
      reason: 'already_unmapped', title: input.parent.title });
    return;
  }
  if (!input.trustCurrentBaseline && !sourceSnapshotMatches(input.child, input.anchor, input.sourceGeneratedAt)) {
    return manual('child_changed_after_t175_3');
  }
  const matches = locators.map((range) => classifyImportedBodyOccurrence(input.parent.body, range.originalText));
  const missing = matches.some((match) => match.status === 'missing');
  const ambiguous = !missing && matches.some((match) => match.status === 'ambiguous');
  const nextRanges = missing || ambiguous ? null : locators.map((range, index) => ({
    ...range, from: matches[index]?.range?.from ?? -1, to: matches[index]?.range?.to ?? -1
  }));
  const nextStatus = missing ? 'unmapped_missing' : ambiguous ? 'unmapped_ambiguous' : 'resolved';
  const mutation: AnchorRepairMutation = {
    childId: input.anchor.childId, expectedAnchorLink: input.child.anchor_link,
    expectedChildVersionId: input.child.current_version_id, expectedParentBodyHash: input.parent.body_blob_hash,
    expectedParentVersionId: input.parent.current_version_id, expectedStatus: input.child.anchor_resolution_status,
    nextAnchorLink: nextRanges ? withLocators(parsed, nextRanges) : input.child.anchor_link,
    nextStatus, oldRanges: locators, newRanges: nextRanges, parentId: input.parentId,
    reason: missing ? 'visible_match_missing' : ambiguous ? 'visible_match_ambiguous' : 'unique_visible_match',
    title: input.parent.title
  };
  input.partial[nextRanges ? 'apply' : 'unmap'].push(mutation);
}

export function buildAnchorRepairPlan(
  driver: DatabaseDriver,
  receipt: BodyRecoveryReceipt,
  generatedAt = new Date().toISOString(),
  options: { trustCurrentBaseline?: boolean } = {}
): AnchorRepairPlan {
  const partial: Omit<AnchorRepairPlan, 'generatedAt' | 'planHash'> = {
    apply: [], manualReview: [], noRepair: [], sourcePlanHash: receipt.plan.planHash, unmap: []
  };
  const recovered = new Map(receipt.result.applied.recovered.map((item) => [item.nodeId, item]));
  for (const candidate of receipt.plan.apply) {
    const expected = recovered.get(candidate.nodeId);
    const parent = readParent(driver, candidate.nodeId);
    const historicalParentMismatch = !expected || !parent || parent.body !== candidate.recoveryContent ||
      parent.body_blob_hash !== expected.bodyHash || parent.current_version_id !== expected.versionId;
    if (!parent || (!options.trustCurrentBaseline && historicalParentMismatch)) {
      candidate.anchors.forEach((anchor) => partial.manualReview.push({ childId: anchor.childId,
        parentId: candidate.nodeId, reason: 'parent_changed_after_t175_3', title: parent?.title ?? candidate.nodeId }));
      continue;
    }
    for (const anchor of candidate.anchors) {
      const child = readChild(driver, anchor.childId, candidate.nodeId);
      if (!child) {
        partial.manualReview.push({ childId: anchor.childId, parentId: candidate.nodeId,
          reason: 'child_missing_or_version_unavailable', title: parent.title });
        continue;
      }
      addAnchorDecision({ anchor, child, parent, parentId: candidate.nodeId, partial,
        sourceGeneratedAt: receipt.plan.generatedAt, trustCurrentBaseline: options.trustCurrentBaseline === true });
    }
  }
  const planHash = createHash('sha256').update(JSON.stringify(stablePayload(partial))).digest('hex');
  return { ...partial, generatedAt, planHash };
}
