import { parseStoredAnchorLink, type StoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { applyImportedHighlightAnchors } from '../../lib/core/database/importHighlightAnchors.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import type { ReadwiseApiAnnotationState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { buildReadwiseUnlocatedNodeId } from '../../lib/core/readwise/readwiseBookUnlocated.js';
import { openDatabaseConnection } from '../database/connection.js';

import {
  ensureReadwiseUnlocatedNode,
  placeReadwiseUnlocatedNodeLast
} from './readwiseBookUnlocated.js';

interface LocalAnchorRow extends DatabaseRow {
  anchor_link: string | null;
  content: string;
  id: string;
  is_title_manual: number;
  title: string;
}

function originalText(anchor: StoredAnchorLink) {
  const locator = anchor.locator;
  return locator && 'originalText' in locator && typeof locator.originalText === 'string'
    ? locator.originalText
    : null;
}

function locateAnchor(
  bodies: Array<{ content: string; id: string }>, row: LocalAnchorRow,
  anchor: StoredAnchorLink, text: string | null
) {
  if (!text) return null;
  const matches = bodies.map((body) => ({
    anchored: applyImportedHighlightAnchors({
      content: body.content,
      highlights: [{ content: row.content.trim() || text, label: null, locatorText: text, nodeId: row.id }]
    }).highlights[0] ?? null,
    body
  })).filter((candidate) => candidate.anchored !== null);
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  return {
    anchorLink: JSON.stringify({
      id: anchor.id,
      kind: anchor.kind,
      locator: {
        from: match.anchored!.from,
        originalText: text,
        to: match.anchored!.to
      }
    }),
    parentId: match.body.id
  };
}

export function relocateReadwiseBookLocalAnchors(input: {
  annotationStates: ReadwiseApiAnnotationState[];
  bodies: Array<{ content: string; id: string }>;
  connectionRef: string;
  documentId: string;
  importedAt: string;
  preservedRootTexts?: ReadonlyMap<string, string | null>;
  rootNodeId: string;
}) {
  const driver = openDatabaseConnection().driver;
  const trackedIds = new Set(input.annotationStates.map((state) => state.nodeId));
  const rows = readLocalAnchorRows(input.rootNodeId).filter((row) => !trackedIds.has(row.id));
  const placements = rows.map((row) => {
    const anchor = parseStoredAnchorLink(row.anchor_link) ?? legacyAnchor(row);
    const text = input.preservedRootTexts?.get(row.id)
      ?? originalText(anchor) ?? (row.content.trim() || row.title.trim() || null);
    return { anchor, located: locateAnchor(input.bodies, row, anchor, text), row };
  });
  const unlocatedNodeId = placements.some((placement) => !placement.located)
    ? ensureReadwiseUnlocatedNode({
      connectionRef: input.connectionRef,
      documentId: input.documentId,
      driver,
      importedAt: input.importedAt,
      rootNodeId: input.rootNodeId
    })
    : null;
  for (const placement of placements) {
    const anchorLink = placement.located?.anchorLink ?? (placement.anchor
      ? JSON.stringify({ id: placement.anchor.id, kind: placement.anchor.kind })
      : null);
    driver.execute(
      `UPDATE nodes SET parent_id = ?, anchor_link = ?, image_regions = NULL, updated_at = ?, sync_dirty = 1
       WHERE id = ?`,
      [placement.located?.parentId ?? unlocatedNodeId, anchorLink, input.importedAt, placement.row.id]
    );
  }
  placeReadwiseUnlocatedNodeLast(
    driver,
    input.rootNodeId,
    unlocatedNodeId ?? buildReadwiseUnlocatedNodeId(input.connectionRef, input.documentId)
  );
  return rows.length;
}

export function captureReadwiseBookRootTexts(rootNodeId: string) {
  const rows = readLocalAnchorRows(rootNodeId);
  return new Map(rows.map((row) => {
    const anchor = parseStoredAnchorLink(row.anchor_link) ?? legacyAnchor(row);
    return [row.id, originalText(anchor) ?? (row.content.trim() || row.title.trim() || null)];
  }));
}

function readLocalAnchorRows(rootNodeId: string) {
  return openDatabaseConnection().driver.queryAll<LocalAnchorRow & NodeBodyRow>(
    `SELECT n.id, n.title, n.content, n.body_blob_hash, cbd.data AS body_blob_data,
       n.anchor_link, n.is_title_manual FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.parent_id = ? AND n.deleted_at IS NULL
       AND (n.anchor_link IS NOT NULL OR n.is_title_manual = 0)`, [rootNodeId]
  ).map((row) => ({ ...row, content: requireResolvedNodeBody(row, row.id).content }));
}

function legacyAnchor(row: LocalAnchorRow): StoredAnchorLink {
  return { id: `imported-highlight-${row.id}`, kind: 'highlight' };
}
