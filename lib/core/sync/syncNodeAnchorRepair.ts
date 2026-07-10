import { deriveMarkdownImageTextAnchorRegions } from '../anchors/markdownImageTextAnchor.js';
import {
  repairTextAnchorLocatorInContent,
  type TextAnchorLocator
} from '../anchors/textAnchorLocator.js';
import { parseStoredAnchorLink } from '../database/anchorLinkCodec.js';

import type { DbPort, DbRow } from './dbPort.js';

export type SyncNodeAnchorUnmappedReason =
  | 'ambiguous_text'
  | 'invalid_anchor_link'
  | 'missing_text'
  | 'no_locator'
  | 'non_text_locator';

export interface SyncNodeAnchorRepairRecord {
  anchorId: string | null;
  nodeId: string;
  parentNodeId: string;
}

export interface SyncNodeAnchorUnmappedRecord {
  anchorId: string | null;
  nodeId: string;
  parentNodeId: string;
  reason: SyncNodeAnchorUnmappedReason;
}

interface ChildAnchorRow extends DbRow {
  anchor_link: string | null;
  id: string;
  image_regions: string | null;
}

interface AnchorRepairResult {
  imageRegions: string | null;
  value: string;
}

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

function readTextLocators(locator: unknown) {
  if (isTextLocator(locator)) {
    return [locator];
  }
  if (
    locator &&
    typeof locator === 'object' &&
    Array.isArray((locator as { ranges?: unknown }).ranges) &&
    (locator as { ranges: unknown[] }).ranges.every(isTextLocator)
  ) {
    return (locator as { ranges: TextAnchorLocator[] }).ranges;
  }
  return [];
}

function createLocatorValue(locators: TextAnchorLocator[]) {
  const [locator] = locators;
  return locators.length === 1 && locator ? locator : { ranges: locators };
}

function textMatches(content: string, locator: TextAnchorLocator) {
  return content.slice(locator.from, locator.to) === locator.originalText;
}

function countOriginalTextMatches(content: string, originalText: string) {
  if (originalText.length === 0) {
    return 0;
  }
  let count = 0;
  let index = content.indexOf(originalText);
  while (index >= 0) {
    count += 1;
    index = content.indexOf(originalText, index + 1);
  }
  return count;
}

function resolveRepairFailureReason(content: string, locators: TextAnchorLocator[]): SyncNodeAnchorUnmappedReason {
  return locators.some((locator) => countOriginalTextMatches(content, locator.originalText) === 0)
    ? 'missing_text'
    : 'ambiguous_text';
}

function toImageRegions(anchorId: string, content: string, locators: TextAnchorLocator[]) {
  const regions = deriveMarkdownImageTextAnchorRegions({ anchorId, content, locators });
  return regions ? JSON.stringify(regions) : null;
}

function remapRawAnchorLinkInContent(input: {
  content: string;
  value: string;
}): AnchorRepairResult | SyncNodeAnchorUnmappedReason | null {
  const parsed = parseStoredAnchorLink(input.value);
  if (!parsed) {
    return 'invalid_anchor_link';
  }
  if (!parsed.locator) {
    return 'no_locator';
  }
  const locators = readTextLocators(parsed.locator);
  if (locators.length === 0) {
    return 'non_text_locator';
  }
  if (locators.every((locator) => textMatches(input.content, locator))) {
    return null;
  }
  const repairedLocators = locators
    .map((locator) => repairTextAnchorLocatorInContent(input.content, locator))
    .filter((locator): locator is TextAnchorLocator => locator !== null);
  if (repairedLocators.length !== locators.length) {
    return resolveRepairFailureReason(input.content, locators);
  }
  const raw = JSON.parse(input.value) as { id: string; locator?: unknown };
  raw.locator = createLocatorValue(repairedLocators);
  return {
    imageRegions: toImageRegions(raw.id, input.content, repairedLocators),
    value: JSON.stringify(raw)
  };
}

export async function repairDirectChildAnchorsForAppliedParent(input: {
  content: string;
  parentNodeId: string;
  port: DbPort;
  updatedAt: string;
}) {
  const repaired: SyncNodeAnchorRepairRecord[] = [];
  const unmapped: SyncNodeAnchorUnmappedRecord[] = [];
  const rows = await input.port.query<ChildAnchorRow>(
    `SELECT id, anchor_link, image_regions
     FROM nodes
     WHERE parent_id = ?
       AND deleted_at IS NULL
       AND anchor_link IS NOT NULL`,
    [input.parentNodeId]
  );

  for (const row of rows) {
    if (!row.anchor_link) {
      continue;
    }
    const anchorId = parseStoredAnchorLink(row.anchor_link)?.id ?? null;
    const result = remapRawAnchorLinkInContent({ content: input.content, value: row.anchor_link });
    if (!result) {
      continue;
    }
    if (typeof result === 'string') {
      unmapped.push({ anchorId, nodeId: row.id, parentNodeId: input.parentNodeId, reason: result });
      continue;
    }
    if (result.value === row.anchor_link && result.imageRegions === row.image_regions) {
      continue;
    }
    await input.port.run('UPDATE nodes SET anchor_link = ?, image_regions = ?, updated_at = ? WHERE id = ?', [
      result.value,
      result.imageRegions,
      input.updatedAt,
      row.id
    ]);
    repaired.push({ anchorId, nodeId: row.id, parentNodeId: input.parentNodeId });
  }

  return { repaired, unmapped };
}
