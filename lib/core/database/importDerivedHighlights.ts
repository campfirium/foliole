import { randomUUID } from 'node:crypto';

import type { PreparedImportHighlightRecord } from '../import/contract.js';
import { projectImageOnlyMarkdownLabel } from '../import/markdownImageLabel.js';
import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';

import { resolveAttachmentIdFromDriver } from './attachmentResourceLookup.js';
import type { DatabaseDriver } from './driver.js';
import { deriveImportedHighlightImageRegions } from './importedHighlightImageRegions.js';
import type { AnchoredImportedHighlightRecord } from './importHighlightAnchors.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';

function deriveImportedHighlightTitle(content: string) {
  const imageOnlyTitle = projectImageOnlyMarkdownLabel(content);
  if (imageOnlyTitle) {
    return imageOnlyTitle;
  }
  const firstLine = content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '').replace(/^#{1,6}\s+/, ''))
    .find((line) => line.length > 0);
  if (!firstLine) {
    return 'Untitled';
  }
  return firstLine.replace(/\s+/g, ' ').slice(0, 120);
}

export function toImportedAnchorLink(highlight: PreparedImportHighlightRecord | AnchoredImportedHighlightRecord) {
  if (!('anchorId' in highlight)) {
    return null;
  }
  if (typeof highlight.from !== 'number' || typeof highlight.to !== 'number') {
    return JSON.stringify({ id: highlight.anchorId, kind: highlight.kind, origin: 'imported' });
  }
  return JSON.stringify({
    id: highlight.anchorId,
    kind: highlight.kind,
    origin: 'imported',
    locator: {
      from: highlight.from,
      to: highlight.to,
      originalText: highlight.locatorText ?? highlight.content
    }
  });
}

function createImportedClozePrompt(parentContent: string, highlight: AnchoredImportedHighlightRecord) {
  if (typeof highlight.from !== 'number' || typeof highlight.to !== 'number') {
    return '[...]';
  }
  return `${parentContent.slice(0, highlight.from)}[...]${parentContent.slice(highlight.to)}`.trim() || '[...]';
}

function toImportedImageRegions(
  driver: DatabaseDriver,
  parentContent: string,
  highlight: PreparedImportHighlightRecord | AnchoredImportedHighlightRecord
) {
  if (!('anchorId' in highlight) || typeof highlight.from !== 'number' || typeof highlight.to !== 'number') {
    return null;
  }
  const regions = deriveImportedHighlightImageRegions({
    anchorId: highlight.anchorId,
    content: parentContent,
    locators: [{ from: highlight.from, to: highlight.to }],
    resolveAttachmentId: (storageKey) => resolveAttachmentIdFromDriver(driver, storageKey)
  });
  return regions ? JSON.stringify(regions) : null;
}

export function insertImportedHighlightNodes(input: {
  driver: DatabaseDriver;
  highlights: Array<PreparedImportHighlightRecord | AnchoredImportedHighlightRecord> | undefined;
  importedAt: string;
  parentNodeId: string;
  parentContent: string;
}) {
  if (!input.highlights?.length) {
    return 0;
  }

  const insertNode = input.driver.prepare(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual,
       content, opening_text, reveal, anchor_link, image_regions, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'topic', NULL, NULL, ?, 0, ?, ?, NULL, ?, ?, ?, ?, NULL)`
  );
  const insertClozeNode = input.driver.prepare(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual,
       content, opening_text, reveal, anchor_link, image_regions, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'item', NULL, NULL, ?, 0, ?, ?, ?, ?, ?, ?, ?, NULL)`
  );
  const insertedNodeIds: string[] = [];

  input.highlights.forEach((highlight) => {
    const nodeId = insertImportedHighlight(input, highlight, insertNode, insertClozeNode);
    if (nodeId) insertedNodeIds.push(nodeId);
  });

  enqueueWorkspaceSearchInvalidationForNodeIds(input.driver, insertedNodeIds);

  return insertedNodeIds.length;
}

function insertImportedHighlight(
  input: Parameters<typeof insertImportedHighlightNodes>[0],
  highlight: PreparedImportHighlightRecord | AnchoredImportedHighlightRecord,
  insertNode: ReturnType<DatabaseDriver['prepare']>,
  insertClozeNode: ReturnType<DatabaseDriver['prepare']>
) {
  const nodeId = highlight.nodeId ?? `node-${randomUUID()}`;
  const imageRegions = toImportedImageRegions(input.driver, input.parentContent, highlight);
  const existing = highlight.nodeId ? reuseImportedHighlightNode({
    anchorLink: toImportedAnchorLink(highlight), driver: input.driver, imageRegions,
    importedAt: input.importedAt, nodeId, parentNodeId: input.parentNodeId
  }) : 'missing';
  if (existing === 'blocked') return null;
  if (existing === 'reused') return nodeId;
  if ('kind' in highlight && highlight.kind === 'cloze') {
    const promptContent = createImportedClozePrompt(input.parentContent, highlight);
    const title = deriveImportedHighlightTitle(promptContent);
    insertClozeNode.run([
      nodeId, input.parentNodeId, title, promptContent, resolveNodeOpeningText(promptContent, title),
      highlight.content, toImportedAnchorLink(highlight), imageRegions, input.importedAt, input.importedAt
    ]);
  } else {
    const title = deriveImportedHighlightTitle(highlight.content);
    insertNode.run([
      nodeId, input.parentNodeId, title, highlight.content, resolveNodeOpeningText(highlight.content, title),
      toImportedAnchorLink(highlight), imageRegions, input.importedAt, input.importedAt
    ]);
  }
  return nodeId;
}

function reuseImportedHighlightNode(input: {
  anchorLink: string | null;
  driver: DatabaseDriver;
  imageRegions: string | null;
  importedAt: string;
  nodeId: string;
  parentNodeId: string;
}): 'blocked' | 'missing' | 'reused' {
  const row = input.driver.queryOne<{ deleted_at: string | null }>(
    'SELECT deleted_at FROM nodes WHERE id = ?', [input.nodeId]
  );
  if (!row) return 'missing';
  if (row.deleted_at && row.deleted_at !== input.importedAt) return 'blocked';
  input.driver.execute(
    `UPDATE nodes SET parent_id = ?, anchor_link = ?, image_regions = ?, deleted_at = NULL, updated_at = ?
     WHERE id = ?`,
    [input.parentNodeId, input.anchorLink, input.imageRegions, input.importedAt, input.nodeId]
  );
  return 'reused';
}
