import type { PreparedImportHighlightRecord, PreparedImportRecord } from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';
import { insertImportedHighlightNodes, toImportedAnchorLink } from './importDerivedHighlights.js';
import type { AnchoredImportedHighlightRecord } from './importHighlightAnchors.js';
import { readExistingChildHighlights } from './importPipelineHighlightNodes.js';
import { updateExistingNode } from './importPipelineNodes.js';
import { resolveReadwiseHighlightUpdate } from './importReadwiseHighlightUpdates.js';

function normalizeImportedHighlightContent(content: string) {
  return content.replace(/\r\n?/g, '\n').trim();
}

function isAnchoredHighlight(
  highlight: PreparedImportHighlightRecord | AnchoredImportedHighlightRecord
): highlight is AnchoredImportedHighlightRecord {
  return 'anchorId' in highlight;
}

function findUnanchoredChildByContent(
  existingChildren: ReturnType<typeof readExistingChildHighlights>,
  usedChildIds: Set<string>,
  content: string
) {
  const normalized = normalizeImportedHighlightContent(content);
  if (!normalized) {
    return null;
  }
  return (
    existingChildren.find(
      (child) =>
        !child.anchor_link &&
        !usedChildIds.has(child.id) &&
        normalizeImportedHighlightContent(child.content) === normalized
    ) ?? null
  );
}

export function persistReadwiseHighlightUpdates(input: {
  driver: DatabaseDriver;
  highlights: Array<PreparedImportHighlightRecord | AnchoredImportedHighlightRecord>;
  importedAt: string;
  parentContent: string;
  parentNodeId: string;
}) {
  if (input.highlights.length === 0) {
    return 0;
  }
  const existingChildren = readExistingChildHighlights(input.driver, input.parentNodeId);
  const usedChildIds = new Set<string>();
  const highlightsToInsert: Array<PreparedImportHighlightRecord | AnchoredImportedHighlightRecord> = [];
  let repairedCount = 0;

  input.highlights.forEach((highlight) => {
    const repairTarget = isAnchoredHighlight(highlight)
      ? findUnanchoredChildByContent(existingChildren, usedChildIds, highlight.content)
      : null;
    if (!repairTarget) {
      highlightsToInsert.push(highlight);
      return;
    }
    usedChildIds.add(repairTarget.id);
    repairedCount += 1;
    input.driver.execute('UPDATE nodes SET anchor_link = ?, updated_at = ? WHERE id = ?', [
      toImportedAnchorLink(highlight),
      input.importedAt,
      repairTarget.id
    ]);
  });

  return (
    repairedCount +
    insertImportedHighlightNodes({
      driver: input.driver,
      highlights: highlightsToInsert,
      importedAt: input.importedAt,
      parentContent: input.parentContent,
      parentNodeId: input.parentNodeId
    })
  );
}

export function updateExistingReadwiseNode(input: {
  driver: DatabaseDriver;
  existingNode: { content: string; created_at: string; deleted_at: string | null; id: string; parent_id: string | null };
  hideTitleHeading: boolean;
  importedAt: string;
  prepared: PreparedImportRecord;
}) {
  const existingChildren = readExistingChildHighlights(input.driver, input.existingNode.id);
  const readwiseUpdate = resolveReadwiseHighlightUpdate({
    existingAnchoredChildContents: existingChildren.filter((row) => row.anchor_link).map((row) => row.content),
    existingChildContents: existingChildren.map((row) => row.content),
    existingContent: input.existingNode.content,
    prepared: input.prepared
  });
  const nodeId = updateExistingNode({
    content: readwiseUpdate.content,
    driver: input.driver,
    existingNode: input.existingNode,
    hideTitleHeading: input.hideTitleHeading,
    importedAt: input.importedAt,
    title: input.prepared.nodeTitle
  });
  persistReadwiseHighlightUpdates({
    driver: input.driver,
    highlights: readwiseUpdate.highlights,
    importedAt: input.importedAt,
    parentContent: readwiseUpdate.content,
    parentNodeId: nodeId
  });
  return nodeId;
}
