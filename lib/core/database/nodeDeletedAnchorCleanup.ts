import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';

interface DeletedNodeAnchorCleanupRow extends DatabaseRow {
  anchor_link: string | null;
  parent_id: string | null;
}

interface ParentContentRow extends DatabaseRow {
  content: string;
  title: string;
}

interface NodeAnchorLinkPayload {
  id: string;
  kind: 'highlight' | 'cloze';
  locator?: {
    attachmentId?: string;
    height?: number;
    page?: number;
    width?: number;
    x: number;
    y: number;
  };
}

function removeAnchorTagsForLink(content: string, anchor: { id: string; kind: 'highlight' | 'cloze' }) {
  return content
    .replaceAll(`<${anchor.kind} id="${anchor.id}">`, '')
    .replaceAll(`</${anchor.kind} id="${anchor.id}">`, '');
}

function parseAnchorLinkPayload(value: string | null) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as NodeAnchorLinkPayload;
    if (!parsed || (parsed.kind !== 'highlight' && parsed.kind !== 'cloze') || typeof parsed.id !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function cleanupDeletedTextAnchors(driver: DatabaseDriver, nodeIds: string[], deletedAt: string) {
  const deletedNodeIds = new Set(nodeIds);
  const selectDeletedNodeStatement = driver.prepare('SELECT parent_id, anchor_link FROM nodes WHERE id = ?');
  const selectParentContentStatement = driver.prepare('SELECT content, title FROM nodes WHERE id = ?');
  const updateParentContentStatement = driver.prepare(
    'UPDATE nodes SET content = ?, opening_text = ?, updated_at = ? WHERE id = ?'
  );
  const affectedParentNodeIds = new Set<string>();

  for (const nodeId of nodeIds) {
    const deletedNode = selectDeletedNodeStatement.get([nodeId]) as DeletedNodeAnchorCleanupRow | undefined;
    if (!deletedNode?.parent_id || deletedNodeIds.has(deletedNode.parent_id)) {
      continue;
    }
    const anchorLink = parseAnchorLinkPayload(deletedNode.anchor_link);
    if (!anchorLink || anchorLink.locator) {
      continue;
    }
    const parentRow = selectParentContentStatement.get([deletedNode.parent_id]) as ParentContentRow | undefined;
    if (!parentRow) {
      continue;
    }
    const cleanedContent = removeAnchorTagsForLink(parentRow.content, anchorLink);
    if (cleanedContent === parentRow.content) {
      continue;
    }
    updateParentContentStatement.run([
      cleanedContent,
      resolveNodeOpeningText(cleanedContent, parentRow.title),
      deletedAt,
      deletedNode.parent_id
    ]);
    affectedParentNodeIds.add(deletedNode.parent_id);
  }

  return [...affectedParentNodeIds];
}
