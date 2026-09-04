import type { DatabaseDriver } from './driver.js';
import { writeNodeBody } from './nodeBodyMutation.js';
import { requireResolvedNodeBody } from './nodeBodyResolution.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';
import {
  remapRawStoredAnchorLink,
  type StoredAnchorLinkRemapSkipReason
} from './storedAnchorLinkRemap.js';

interface ParentNodeRow {
  [column: string]: unknown;
  body_blob_data: unknown;
  body_blob_hash: string | null;
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
  | { reason: StoredAnchorLinkRemapSkipReason }
  | { imageRegions: string | null; value: string };

function readParentNode(driver: DatabaseDriver, nodeId: string) {
  return driver.queryOne<ParentNodeRow>(
    `SELECT n.id, n.title, n.content, n.body_blob_hash, cbd.data AS body_blob_data
     FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ? AND n.deleted_at IS NULL`,
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

function remapRawAnchorLink(value: string, imageRegions: string | null, previousContent: string, nextContent: string): RawAnchorRemapResult {
  return remapRawStoredAnchorLink({
    imageRegions,
    nextContent,
    previousContent,
    value
  });
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
  const resolvedParent = parent ? requireResolvedNodeBody(parent, parent.id) : null;
  const previousContent = input.previousContent ?? resolvedParent?.content ?? '';
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

  writeNodeBody({
    content: input.nextContent,
    driver: input.driver,
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
    const remapped = remapRawAnchorLink(row.anchor_link, row.image_regions, previousContent, input.nextContent);
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
