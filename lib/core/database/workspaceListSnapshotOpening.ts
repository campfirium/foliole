import {
  extractNodeOpeningPreview,
  NODE_OPENING_PREVIEW_FALLBACK
} from '../nodes/nodeOpeningPreview.js';

interface PdfOpeningRowLike {
  node_id: string;
  text: string;
}

type SnapshotNodeRecord = Record<string, unknown> & {
  kind?: unknown;
  opening?: unknown;
  parentNodeId?: unknown;
  title?: unknown;
};

function isUsableOpening(opening: string | null | undefined) {
  return Boolean(opening && opening !== NODE_OPENING_PREVIEW_FALLBACK);
}

function buildChildrenByParentId(
  nodeOrder: string[],
  nodesById: Record<string, SnapshotNodeRecord>
) {
  const childrenByParentId = new Map<string, string[]>();
  for (const nodeId of nodeOrder) {
    const parentNodeId =
      typeof nodesById[nodeId]?.parentNodeId === 'string'
        ? String(nodesById[nodeId].parentNodeId)
        : null;
    if (!parentNodeId) {
      continue;
    }
    const children = childrenByParentId.get(parentNodeId) ?? [];
    children.push(nodeId);
    childrenByParentId.set(parentNodeId, children);
  }
  return childrenByParentId;
}

export function buildPdfOpeningById(
  pdfOpeningRows: PdfOpeningRowLike[],
  nodesById: Record<string, SnapshotNodeRecord>
) {
  const pdfOpeningById = new Map<string, string>();
  for (const row of pdfOpeningRows) {
    if (pdfOpeningById.has(row.node_id)) {
      continue;
    }
    const node = nodesById[row.node_id];
    if (!node || typeof row.text !== 'string' || row.text.trim().length === 0) {
      continue;
    }
    const opening = extractNodeOpeningPreview(row.text, String(node.title ?? ''));
    if (isUsableOpening(opening)) {
      pdfOpeningById.set(row.node_id, opening);
    }
  }
  return pdfOpeningById;
}

export function applyResolvedOpenings(input: {
  directOpeningById: Map<string, string | null>;
  nodeOrder: string[];
  nodesById: Record<string, SnapshotNodeRecord>;
  pdfOpeningById: Map<string, string>;
}) {
  const childrenByParentId = buildChildrenByParentId(input.nodeOrder, input.nodesById);
  const resolvedOpeningById = new Map<string, string | null>();

  const resolveNodeOpening = (nodeId: string, visiting = new Set<string>()): string | null => {
    if (resolvedOpeningById.has(nodeId)) {
      return resolvedOpeningById.get(nodeId) ?? null;
    }
    if (visiting.has(nodeId)) {
      return null;
    }
    visiting.add(nodeId);
    const node = input.nodesById[nodeId];
    if (!node || node.kind === 'folder') {
      resolvedOpeningById.set(nodeId, null);
      visiting.delete(nodeId);
      return null;
    }

    const directOpening = input.directOpeningById.get(nodeId);
    if (isUsableOpening(directOpening)) {
      const resolvedDirectOpening = directOpening ?? null;
      resolvedOpeningById.set(nodeId, resolvedDirectOpening);
      visiting.delete(nodeId);
      return resolvedDirectOpening;
    }

    const pdfOpening = input.pdfOpeningById.get(nodeId);
    if (pdfOpening) {
      resolvedOpeningById.set(nodeId, pdfOpening);
      visiting.delete(nodeId);
      return pdfOpening;
    }

    for (const childNodeId of childrenByParentId.get(nodeId) ?? []) {
      const childOpening = resolveNodeOpening(childNodeId, visiting);
      if (childOpening) {
        resolvedOpeningById.set(nodeId, childOpening);
        visiting.delete(nodeId);
        return childOpening;
      }
    }

    resolvedOpeningById.set(nodeId, null);
    visiting.delete(nodeId);
    return null;
  };

  for (const nodeId of input.nodeOrder) {
    input.nodesById[nodeId].opening = resolveNodeOpening(nodeId);
  }
}
