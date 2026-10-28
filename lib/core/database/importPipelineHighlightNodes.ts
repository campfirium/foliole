import type { PreparedImportHighlightRecord } from '../import/contract.js';

import { parseStoredAnchorLink } from './anchorLinkCodec.js';
import { bodyPartPrefix } from './bodyPartitionIdentity.js';
import type { DatabaseDriver } from './driver.js';
import { insertImportedHighlightNodes } from './importDerivedHighlights.js';
import type { AnchoredImportedHighlightRecord } from './importHighlightAnchors.js';
import { findUniqueAvailableImportedBodyOccurrence } from './importHighlightBodyMatching.js';
import { filterImportHighlightsWithinBudget } from './importHighlightTextBudget.js';
import { rewriteParentChildOrder } from './nodeOrderMutations.js';
import { readParentChildOrder } from './parentChildOrder.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';

interface ExistingChildHighlightRow {
  [column: string]: unknown;
  anchor_link: string | null;
  content: string;
  id: string;
  is_title_manual: number;
}

function isImportedAnchorLink(value: string | null) {
  if (!value) {
    return false;
  }
  try {
    const parsed = JSON.parse(value) as { id?: unknown; origin?: unknown };
    return parsed?.origin === 'imported' || (typeof parsed?.id === 'string' && parsed.id.startsWith('imported-highlight-'));
  } catch {
    return false;
  }
}

export function readExistingChildHighlights(driver: DatabaseDriver, parentNodeId: string) {
  const rows = driver.queryAll<ExistingChildHighlightRow>(
    `SELECT id, content, anchor_link, is_title_manual
     FROM nodes
     WHERE parent_id = ? AND deleted_at IS NULL AND id NOT LIKE ?`,
    [parentNodeId, `${bodyPartPrefix(parentNodeId)}%`]
  );
  return rows;
}

function isGeneratedImportedChild(row: ExistingChildHighlightRow) {
  return isImportedAnchorLink(row.anchor_link) || (!row.anchor_link && row.is_title_manual === 0);
}

function detachMissingHighlights(driver: DatabaseDriver, rows: ExistingChildHighlightRow[], importedAt: string) {
  for (const row of rows) {
    const anchor = parseStoredAnchorLink(row.anchor_link);
    driver.execute(
      `UPDATE nodes SET anchor_link = ?, image_regions = NULL, updated_at = ?, sync_dirty = 1 WHERE id = ?`,
      [anchor ? JSON.stringify({ id: anchor.id, kind: anchor.kind, origin: 'imported' }) : null, importedAt, row.id]
    );
  }
}

export function replaceImportedHighlightNodes(input: {
  driver: DatabaseDriver;
  existingChildren?: ExistingChildHighlightRow[];
  highlights: Array<PreparedImportHighlightRecord | AnchoredImportedHighlightRecord>;
  importedAt: string;
  parentNodeId: string;
  parentContent: string;
  prepareDeletionVersions?: (nodeIds: string[], deletedAt: string) => void;
  budgetFailures?: string[];
  rejectedHighlights?: PreparedImportHighlightRecord[];
}) {
  const children = input.existingChildren ?? readExistingChildHighlights(input.driver, input.parentNodeId);
  relocateLocalTextHighlights(input, children.filter(row => !isGeneratedImportedChild(row)));
  const existingChildren = children.filter(isGeneratedImportedChild);
  const bounded = filterImportHighlightsWithinBudget(input.highlights, input.parentContent, input.budgetFailures);
  const usedIds = new Set(bounded.highlights.flatMap(highlight => highlight.nodeId ? [highlight.nodeId] : []));
  const highlights = bounded.highlights.map(highlight => {
    if (highlight.nodeId) return highlight;
    const matches = existingChildren.filter(row => {
      if (usedIds.has(row.id)) return false;
      const locator = parseStoredAnchorLink(row.anchor_link)?.locator;
      const sourceText = locator && 'originalText' in locator ? locator.originalText : row.content;
      return sourceText === (highlight.locatorText ?? highlight.content);
    });
    if (matches.length !== 1) return highlight;
    usedIds.add(matches[0]!.id);
    return { ...highlight, nodeId: matches[0]!.id };
  });
  const missing = existingChildren.filter(row => !usedIds.has(row.id));
  detachMissingHighlights(input.driver, missing, input.importedAt);
  enqueueWorkspaceSearchInvalidationForNodeIds(input.driver, existingChildren.map(row => row.id));
  const count = insertImportedHighlightNodes({
    driver: input.driver,
    highlights,
    ...(input.budgetFailures ? { budgetFailures: input.budgetFailures } : {}),
    importedAt: input.importedAt,
    parentNodeId: input.parentNodeId,
    parentContent: input.parentContent
  });
  placeUnlocatedChildHighlightsLast(input.driver, input.parentNodeId, highlights
    .filter(highlight => !('from' in highlight) || typeof highlight.from !== 'number')
    .flatMap(highlight => highlight.nodeId ? [highlight.nodeId] : []));
  return count;
}

export function placeUnlocatedChildHighlightsLast(driver: DatabaseDriver, parentNodeId: string, additionalIds: string[] = []) {
  const unlocatedIds = new Set([...additionalIds, ...readExistingChildHighlights(driver, parentNodeId)
    .filter(row => row.anchor_link ? !parseStoredAnchorLink(row.anchor_link)?.locator : row.is_title_manual === 0)
    .map(row => row.id)]);
  const { childIds: order } = readParentChildOrder(driver, parentNodeId);
  rewriteParentChildOrder(driver, parentNodeId, [...order.filter(id => !unlocatedIds.has(id)),
    ...order.filter(id => unlocatedIds.has(id))]);
}

function relocateLocalTextHighlights(
  input: Pick<Parameters<typeof replaceImportedHighlightNodes>[0], 'driver' | 'parentContent' | 'importedAt'>,
  rows: ExistingChildHighlightRow[]
) {
  for (const row of rows) {
    const anchor = parseStoredAnchorLink(row.anchor_link);
    const locator = anchor?.locator;
    if (!anchor || !locator || !('originalText' in locator) || typeof locator.originalText !== 'string') continue;
    const range = findUniqueAvailableImportedBodyOccurrence(input.parentContent, locator.originalText, []);
    const nextAnchor = range ? { ...anchor, locator: { ...range, originalText: locator.originalText } }
      : { id: anchor.id, kind: anchor.kind };
    input.driver.execute(`UPDATE nodes SET anchor_link=?,updated_at=?,sync_dirty=1 WHERE id=?`,
      [JSON.stringify(nextAnchor), input.importedAt, row.id]);
    if (!range) input.driver.execute('UPDATE nodes SET image_regions=NULL WHERE id=?', [row.id]);
    enqueueWorkspaceSearchInvalidationForNodeIds(input.driver, [row.id]);
  }
}
