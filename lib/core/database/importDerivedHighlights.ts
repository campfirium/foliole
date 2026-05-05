import { randomUUID } from 'node:crypto';

import type { PreparedImportHighlightRecord } from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';
import type { AnchoredImportedHighlightRecord } from './importHighlightAnchors.js';

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

export function insertImportedHighlightNodes(input: {
  driver: DatabaseDriver;
  highlights: Array<PreparedImportHighlightRecord | AnchoredImportedHighlightRecord> | undefined;
  importedAt: string;
  parentNodeId: string;
  startPosition: number;
}) {
  if (!input.highlights?.length) {
    return 0;
  }

  const insertNode = input.driver.prepare(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual,
       content, reveal, anchor_link, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'topic', NULL, NULL, ?, 0, ?, NULL, ?, ?, ?, NULL)`
  );
  const insertOrder = input.driver.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');

  input.highlights.forEach((highlight, index) => {
    const nodeId = `node-${randomUUID()}`;
    insertNode.run([
      nodeId,
      input.parentNodeId,
      deriveImportedHighlightTitle(highlight.content),
      highlight.content,
      'anchorId' in highlight ? JSON.stringify({ id: highlight.anchorId, kind: 'highlight' }) : null,
      input.importedAt,
      input.importedAt
    ]);
    insertOrder.run([nodeId, input.startPosition + index]);
  });

  return input.highlights.length;
}
