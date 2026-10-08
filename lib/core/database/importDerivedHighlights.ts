import { randomUUID } from 'node:crypto';

import type { PreparedImportHighlightRecord } from '../import/contract.js';
import { createImportedClozePrompt, deriveImportedHighlightTitle, deriveImportedHighlightTitleCandidate, toImportedAnchorLink } from '../import/importGeneratedHighlightText.js';
export { toImportedAnchorLink } from '../import/importGeneratedHighlightText.js';
import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';
import { isNodeTitleTruncated } from '../nodes/nodeTitleBudget.js';

import type { DatabaseDriver } from './driver.js';
import { parseImageSources, serializeImageSources, type ImageSources } from './imageSources.js';
import { deriveImportedHighlightImageRegions } from './importedHighlightImageRegions.js';
import type { AnchoredImportedHighlightRecord } from './importHighlightAnchors.js';
import { filterImportHighlightsWithinBudget } from './importHighlightTextBudget.js';
import { ensureNodeParentMembership } from './nodeOrderMutations.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';
import { hashTextBody } from './textBodyHash.js';

function toImportedImageRegions(
  parentContent: string,
  highlight: PreparedImportHighlightRecord | AnchoredImportedHighlightRecord
) {
  if (!('anchorId' in highlight) || typeof highlight.from !== 'number' || typeof highlight.to !== 'number') {
    return null;
  }
  const regions = deriveImportedHighlightImageRegions({
    anchorId: highlight.anchorId,
    content: parentContent,
    locators: [{ from: highlight.from, to: highlight.to }]
  });
  return regions ? JSON.stringify(regions) : null;
}

export function insertImportedHighlightNodes(input: {
  driver: DatabaseDriver;
  highlights: Array<PreparedImportHighlightRecord | AnchoredImportedHighlightRecord> | undefined;
  importedAt: string;
  imageSources?: ImageSources;
  parentNodeId: string;
  parentContent: string;
  budgetFailures?: string[];
}) {
  if (!input.highlights?.length) {
    return 0;
  }

  const insertNode = input.driver.prepare(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual,
       content, body_blob_hash, opening_text, reveal, anchor_link, image_regions, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'topic', NULL, NULL, ?, 0, ?, ?, ?, NULL, ?, ?, ?, ?, NULL)`
  );
  const insertClozeNode = input.driver.prepare(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual,
       content, body_blob_hash, opening_text, reveal, anchor_link, image_regions, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'item', NULL, NULL, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  );
  const insertedNodeIds: string[] = [];

  const bounded = filterImportHighlightsWithinBudget(input.highlights, input.parentContent, input.budgetFailures);
  bounded.highlights.forEach((highlight) => {
    const nodeId = insertImportedHighlight(input, highlight, insertNode, insertClozeNode);
    if (nodeId) {
      const sources = Object.fromEntries(Object.entries(parseImageSources(input.imageSources))
        .filter(([key]) => highlight.content.includes(`asset://${key}`)));
      if (Object.keys(sources).length) input.driver.execute(
        "UPDATE nodes SET image_sources = json_patch(COALESCE(image_sources, '{}'), ?) WHERE id = ?",
        [serializeImageSources(sources), nodeId]
      );
      insertedNodeIds.push(nodeId);
    }
  });

  for (const nodeId of insertedNodeIds) ensureNodeParentMembership(input.driver, nodeId);
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
  const imageRegions = toImportedImageRegions(input.parentContent, highlight);
  const existing = highlight.nodeId ? reuseImportedHighlightNode({
    anchorLink: toImportedAnchorLink(highlight), driver: input.driver, imageRegions,
    importedAt: input.importedAt, nodeId, parentNodeId: input.parentNodeId
  }) : 'missing';
  if (existing === 'blocked') return null;
  if (existing === 'reused') return nodeId;
  const content = 'kind' in highlight && highlight.kind === 'cloze'
    ? createImportedClozePrompt(input.parentContent, highlight) : highlight.content;
  if (isNodeTitleTruncated(deriveImportedHighlightTitleCandidate(content))) input.budgetFailures?.push(
    `Imported ${'kind' in highlight && highlight.kind === 'cloze' ? 'cloze' : 'highlight'} ${nodeId} title was shortened to the first 100 characters.`);
  const bodyHash = hashTextBody(content);
  if ('kind' in highlight && highlight.kind === 'cloze') {
    const promptContent = createImportedClozePrompt(input.parentContent, highlight);
    const title = deriveImportedHighlightTitle(promptContent);
    insertClozeNode.run([
      nodeId, input.parentNodeId, title, content, bodyHash, resolveNodeOpeningText(promptContent, title),
      highlight.content, toImportedAnchorLink(highlight), imageRegions, input.importedAt, input.importedAt
    ]);
  } else {
    const title = deriveImportedHighlightTitle(highlight.content);
    insertNode.run([
      nodeId, input.parentNodeId, title, content, bodyHash, resolveNodeOpeningText(highlight.content, title),
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
