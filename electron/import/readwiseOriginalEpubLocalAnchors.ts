import { parseStoredAnchorLink, type StoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { applyImportedHighlightAnchors } from '../../lib/core/database/importHighlightAnchors.js';
import type { ReadwiseApiAnnotationState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { openDatabaseConnection } from '../database/connection.js';

import {
  ensureReadwiseUnlocatedNode,
  placeReadwiseUnlocatedNodeLast
} from './readwiseOriginalEpubUnlocated.js';

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

export function relocateReadwiseOriginalEpubLocalAnchors(input: {
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
  const rows = driver.queryAll<LocalAnchorRow>(
    `SELECT id, title, content, anchor_link, is_title_manual FROM nodes
     WHERE parent_id = ? AND deleted_at IS NULL
       AND (anchor_link IS NOT NULL OR is_title_manual = 0)`, [input.rootNodeId]
  ).filter((row) => !trackedIds.has(row.id));
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
  if (unlocatedNodeId) {
    placeReadwiseUnlocatedNodeLast(driver, input.rootNodeId, unlocatedNodeId);
  }
  return rows.length;
}

export function captureReadwiseOriginalEpubRootTexts(rootNodeId: string) {
  const rows = openDatabaseConnection().driver.queryAll<LocalAnchorRow>(
    `SELECT id, title, content, anchor_link, is_title_manual FROM nodes
     WHERE parent_id = ? AND deleted_at IS NULL
       AND (anchor_link IS NOT NULL OR is_title_manual = 0)`, [rootNodeId]
  );
  return new Map(rows.map((row) => {
    const anchor = parseStoredAnchorLink(row.anchor_link) ?? legacyAnchor(row);
    return [row.id, originalText(anchor) ?? (row.content.trim() || row.title.trim() || null)];
  }));
}

function legacyAnchor(row: LocalAnchorRow): StoredAnchorLink {
  return { id: `imported-highlight-${row.id}`, kind: 'highlight' };
}
