import { placeReadwiseApiEpubHighlight } from '../../electron/import/readwiseApiEpubHighlightPlacement.js';
import { deriveImportedHighlightImageRegions } from '../../lib/core/database/importedHighlightImageRegions.js';
import { applyImportedHighlightAnchors } from '../../lib/core/database/importHighlightAnchors.js';
import { requireResolvedNodeBody } from '../../lib/core/database/nodeBodyResolution.js';

import type { RepairHighlight } from './readwise-epub-structure-repair-types.js';

interface HighlightRow {
  anchor_link: string | null;
  body_blob_data: unknown;
  body_blob_hash: string | null;
  content: string;
  id: string;
  image_regions: string | null;
  parent_id: string | null;
}

export function relocateRepairHighlight(
  row: HighlightRow,
  bodies: Array<{ content: string; nodeId: string }>,
  rootId: string,
  unlocatedNodeId: string
): RepairHighlight {
  const stored = parseAnchor(row.anchor_link);
  const content = requireResolvedNodeBody(row, row.id).content;
  const existingParent = bodies.find((body) => body.nodeId === row.parent_id);
  if (existingParent && stored.locator && locatorStillMatches(existingParent.content, stored.locator)) {
    return {
      anchorLink: row.anchor_link!, imageRegions: row.image_regions,
      nodeId: row.id, parentId: row.parent_id!
    };
  }
  const locatorText = stored.locator?.originalText ?? content;
  const available = bodies.map((item) => ({ content: item.content, id: item.nodeId }));
  const placement = placeReadwiseApiEpubHighlight({
    bodies: available, highlight: { content, label: null, locatorText, nodeId: row.id }, rootNodeId: rootId
  });
  const parentBody = available.find((item) => item.id === placement.parentId)?.content ?? '';
  const anchored = applyImportedHighlightAnchors({
    ambiguityPolicy: 'first', content: parentBody, highlights: [placement.highlight]
  }).highlights[0];
  if (stored.locator && !anchored) throw new Error(`readwise_epub_resolved_highlight_regressed:${row.id}`);
  const anchorId = typeof stored.id === 'string' ? stored.id : `imported-highlight-${row.id}`;
  const anchorLink = anchored ? JSON.stringify({
    id: anchorId, kind: 'highlight', locator: {
      from: anchored.from, originalText: anchored.locatorText ?? content, to: anchored.to
    }, origin: 'imported'
  }) : JSON.stringify({ id: anchorId, kind: 'highlight', origin: 'imported' });
  const regions = anchored && typeof anchored.from === 'number' && typeof anchored.to === 'number'
    ? deriveImportedHighlightImageRegions({
      anchorId, content: parentBody, locators: [{ from: anchored.from, to: anchored.to }]
    }) : null;
  return {
    anchorLink, imageRegions: regions ? JSON.stringify(regions) : null,
    nodeId: row.id, parentId: anchored ? placement.parentId : unlocatedNodeId
  };
}

export function hasResolvedRepairHighlight(highlight: RepairHighlight) {
  return Boolean(parseAnchor(highlight.anchorLink).locator);
}

function locatorStillMatches(
  content: string,
  locator: { from?: number; originalText?: string; to?: number }
) {
  return typeof locator.from === 'number' && typeof locator.to === 'number'
    && typeof locator.originalText === 'string'
    && content.slice(locator.from, locator.to) === locator.originalText;
}

function parseAnchor(value: string | null): {
  id?: unknown; locator?: { from?: number; originalText?: string; to?: number };
} {
  try {
    return value ? JSON.parse(value) as {
      id?: unknown; locator?: { from?: number; originalText?: string; to?: number };
    } : {};
  } catch {
    return {};
  }
}
