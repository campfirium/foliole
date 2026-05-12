import { randomUUID } from 'node:crypto';

import type { PreparedImportHighlightRecord } from '../import/contract.js';
import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';

import type { DatabaseDriver } from './driver.js';
import type { AnchoredImportedHighlightRecord } from './importHighlightAnchors.js';
import { syncWorkspaceSearchIndexForNodeIds } from './workspaceSearchIndex.js';

function deriveImportedHighlightTitle(content: string) {
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

function toImportedAnchorLink(highlight: PreparedImportHighlightRecord | AnchoredImportedHighlightRecord) {
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
       content, opening_text, reveal, anchor_link, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'topic', NULL, NULL, ?, 0, ?, ?, NULL, ?, ?, ?, NULL)`
  );
  const insertClozeNode = input.driver.prepare(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual,
       content, opening_text, reveal, anchor_link, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'item', NULL, NULL, ?, 0, ?, ?, ?, ?, ?, ?, NULL)`
  );
  const insertedNodeIds: string[] = [];

  input.highlights.forEach((highlight) => {
    const nodeId = `node-${randomUUID()}`;
    insertedNodeIds.push(nodeId);
    if ('kind' in highlight && highlight.kind === 'cloze') {
      const promptContent = createImportedClozePrompt(input.parentContent, highlight);
      const title = deriveImportedHighlightTitle(promptContent);
      insertClozeNode.run([
        nodeId,
        input.parentNodeId,
        title,
        promptContent,
        resolveNodeOpeningText(promptContent, title),
        highlight.content,
        toImportedAnchorLink(highlight),
        input.importedAt,
        input.importedAt
      ]);
    } else {
      const title = deriveImportedHighlightTitle(highlight.content);
      insertNode.run([
        nodeId,
        input.parentNodeId,
        title,
        highlight.content,
        resolveNodeOpeningText(highlight.content, title),
        toImportedAnchorLink(highlight),
        input.importedAt,
        input.importedAt
      ]);
    }
  });

  syncWorkspaceSearchIndexForNodeIds(input.driver, insertedNodeIds);

  return input.highlights.length;
}
