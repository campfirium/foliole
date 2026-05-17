import { remapTextAnchorLocator, type TextAnchorLocator } from '../anchors/textAnchorLocator.js';
import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';

import { parseStoredAnchorLink } from './anchorLinkCodec.js';
import { upsertTextBodyBlob } from './contentBodyBlobs.js';
import type { DatabaseDriver } from './driver.js';
import { deriveImportedHighlightImageRegions } from './importedHighlightImageRegions.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';

interface ParentNodeRow {
  [column: string]: unknown;
  content: string;
  id: string;
  title: string;
}

interface ChildAnchorRow {
  [column: string]: unknown;
  anchor_link: string | null;
  id: string;
  image_regions: string | null;
}

export interface ParentContentChangeResult {
  affectedChildIds: string[];
  finalContent: string;
  skippedAnchors: Array<{ nodeId: string; reason: 'invalid_anchor_link' | 'non_text_locator' | 'no_locator' }>;
  unmappedAnchorIds: string[];
  written: boolean;
}

type RawAnchorRemapResult =
  | { reason: ParentContentChangeResult['skippedAnchors'][number]['reason'] }
  | { imageRegions: string | null; value: string };

function readParentNode(driver: DatabaseDriver, nodeId: string) {
  return driver.queryOne<ParentNodeRow>(
    `SELECT id, title, content
     FROM nodes
     WHERE id = ? AND deleted_at IS NULL`,
    [nodeId]
  ) ?? null;
}

function readChildAnchors(driver: DatabaseDriver, parentNodeId: string) {
  return driver.queryAll<ChildAnchorRow>(
    `SELECT id, anchor_link, image_regions
     FROM nodes
     WHERE parent_id = ? AND deleted_at IS NULL AND anchor_link IS NOT NULL`,
    [parentNodeId]
  );
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

function isTextLocatorGroup(locator: unknown): locator is { ranges: TextAnchorLocator[] } {
  return Boolean(
    locator &&
      typeof locator === 'object' &&
      Array.isArray((locator as { ranges?: unknown }).ranges) &&
      (locator as { ranges: unknown[] }).ranges.every(isTextLocator)
  );
}

function remapRawAnchorLink(value: string, previousContent: string, nextContent: string): RawAnchorRemapResult {
  const parsed = parseStoredAnchorLink(value);
  if (!parsed) {
    return { reason: 'invalid_anchor_link' as const };
  }
  const raw = JSON.parse(value) as { id?: unknown; locator?: unknown };
  if (!raw.locator) {
    return { reason: 'no_locator' as const };
  }
  if (isTextLocatorGroup(raw.locator)) {
    const remappedRanges = raw.locator.ranges.map((locator) => remapTextAnchorLocator(nextContent, locator, previousContent));
    raw.locator = { ranges: remappedRanges };
    return {
      imageRegions: toDerivedImageRegionsJson(nextContent, raw.id, remappedRanges),
      value: JSON.stringify(raw)
    };
  }
  if (isTextLocator(raw.locator)) {
    const remappedLocator = remapTextAnchorLocator(nextContent, raw.locator, previousContent);
    raw.locator = remappedLocator;
    return {
      imageRegions: toDerivedImageRegionsJson(nextContent, raw.id, [remappedLocator]),
      value: JSON.stringify(raw)
    };
  }
  return { reason: 'non_text_locator' as const };
}

function toDerivedImageRegionsJson(content: string, anchorId: unknown, locators: TextAnchorLocator[]) {
  if (typeof anchorId !== 'string' || anchorId.trim().length === 0) {
    return null;
  }
  const regions = deriveImportedHighlightImageRegions({ anchorId, content, locators });
  return regions ? JSON.stringify(regions) : null;
}

function writeParentContent(input: {
  driver: DatabaseDriver;
  nextContent: string;
  nodeId: string;
  title: string;
  updatedAt: string;
}) {
  const bodyBlobHash = upsertTextBodyBlob(input.driver, input.nextContent, input.updatedAt);
  input.driver.execute(
    `UPDATE nodes
     SET content = ?, body_blob_hash = ?, opening_text = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.nextContent,
      bodyBlobHash,
      resolveNodeOpeningText(input.nextContent, input.title),
      input.updatedAt,
      input.nodeId
    ]
  );
}

export function applyParentContentChange(input: {
  driver: DatabaseDriver;
  nextContent: string;
  nodeId: string;
  previousContent?: string;
  title?: string;
  updatedAt: string;
}): ParentContentChangeResult {
  const parent = readParentNode(input.driver, input.nodeId);
  const previousContent = input.previousContent ?? parent?.content ?? '';
  const title = input.title ?? parent?.title ?? '';
  if (previousContent === input.nextContent) {
    return {
      affectedChildIds: [],
      finalContent: input.nextContent,
      skippedAnchors: [],
      unmappedAnchorIds: [],
      written: false
    };
  }

  writeParentContent({
    driver: input.driver,
    nextContent: input.nextContent,
    nodeId: input.nodeId,
    title,
    updatedAt: input.updatedAt
  });

  const affectedChildIds: string[] = [];
  const skippedAnchors: ParentContentChangeResult['skippedAnchors'] = [];
  readChildAnchors(input.driver, input.nodeId).forEach((row) => {
    if (!row.anchor_link) {
      return;
    }
    const remapped = remapRawAnchorLink(row.anchor_link, previousContent, input.nextContent);
    if (!('value' in remapped)) {
      skippedAnchors.push({ nodeId: row.id, reason: remapped.reason });
      return;
    }
    if (remapped.value === row.anchor_link && remapped.imageRegions === row.image_regions) {
      return;
    }
    input.driver.execute('UPDATE nodes SET anchor_link = ?, image_regions = ?, updated_at = ? WHERE id = ?', [
      remapped.value,
      remapped.imageRegions,
      input.updatedAt,
      row.id
    ]);
    affectedChildIds.push(row.id);
  });

  enqueueWorkspaceSearchInvalidationForNodeIds(input.driver, [input.nodeId, ...affectedChildIds]);

  return {
    affectedChildIds,
    finalContent: input.nextContent,
    skippedAnchors,
    unmappedAnchorIds: [],
    written: true
  };
}
