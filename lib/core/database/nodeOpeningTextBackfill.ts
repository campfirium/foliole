import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';

import { applyResolvedOpenings, buildPdfOpeningById } from './workspaceListSnapshotOpening.js';

interface BackfillNodeRowLike {
  content: string;
  id: string;
  kind: string | null;
  parent_id: string | null;
  title: string;
}

interface BackfillNodeOrderRowLike {
  node_id: string;
}

interface BackfillPdfOpeningRowLike {
  node_id: string;
  text: string;
}

type BackfillNodeRecord = {
  kind: string | null;
  openingText: string | null;
  parentNodeId: string | null;
  title: string;
};

export function resolveBackfilledNodeOpeningTextById(input: {
  nodeOrderRows: BackfillNodeOrderRowLike[];
  nodeRows: BackfillNodeRowLike[];
  pdfOpeningRows: BackfillPdfOpeningRowLike[];
}) {
  const nodesById: Record<string, BackfillNodeRecord> = {};
  const directOpeningById = new Map<string, string | null>();

  for (const row of input.nodeRows) {
    const directOpening =
      row.kind === 'folder' ? null : resolveNodeOpeningText(row.content, row.title);
    directOpeningById.set(row.id, directOpening);
    nodesById[row.id] = {
      kind: row.kind,
      openingText: null,
      parentNodeId: row.parent_id,
      title: row.title
    };
  }

  const nodeOrder = input.nodeOrderRows
    .map((row) => row.node_id)
    .filter((nodeId) => Boolean(nodesById[nodeId]));
  const orderedNodeIds = new Set(nodeOrder);
  for (const row of input.nodeRows) {
    if (!orderedNodeIds.has(row.id)) {
      nodeOrder.push(row.id);
    }
  }

  applyResolvedOpenings({
    directOpeningById,
    nodeOrder,
    nodesById,
    pdfOpeningById: buildPdfOpeningById(input.pdfOpeningRows, nodesById)
  });

  return new Map(
    Object.entries(nodesById).map(([nodeId, node]) => [nodeId, node.openingText ?? null] as const)
  );
}
