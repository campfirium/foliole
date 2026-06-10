const READWISE_BOOK_NODE_PREFIX = 'node-readwise-book-';
const READWISE_EPUB_NODE_PREFIX = 'node-epub-';

export interface ReadwiseCleanupCandidate {
  deleteReason?: string;
  importedAt: string | null;
  nodeId: string;
  reason?: string;
  ruleId: string;
  sourcePath: string;
  title?: string;
}

export interface ReadwiseCleanupNodeRow {
  id: string;
  parent_id: string | null;
}

export function isReadwiseBookStructureNodeId(nodeId: string) {
  return nodeId.startsWith(READWISE_BOOK_NODE_PREFIX);
}

export function isReadwiseImportedStructureNodeId(nodeId: string) {
  return nodeId.startsWith(READWISE_EPUB_NODE_PREFIX) || isReadwiseBookStructureNodeId(nodeId);
}

export function collectReadwiseCleanupSubtree<T extends ReadwiseCleanupNodeRow>(rootId: string, rows: T[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const byParent = new Map<string | null, T[]>();
  rows.forEach((row) => {
    byParent.set(row.parent_id, [...(byParent.get(row.parent_id) ?? []), row]);
  });
  const collected: T[] = [];
  const visit = (nodeId: string) => {
    const row = byId.get(nodeId);
    if (!row) {
      return;
    }
    collected.push(row);
    (byParent.get(nodeId) ?? []).forEach((child) => visit(child.id));
  };
  visit(rootId);
  return collected;
}

export function reduceReadwiseCleanupRootCandidates<T extends ReadwiseCleanupCandidate>(
  candidates: T[],
  nodes: ReadwiseCleanupNodeRow[]
) {
  const candidateIds = new Set(candidates.map((candidate) => candidate.nodeId));
  const candidateById = new Map(candidates.map((candidate) => [candidate.nodeId, candidate]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const reduced = new Map<string, T>();

  for (const candidate of candidates) {
    let rootId = candidate.nodeId;
    let parentId = nodeById.get(rootId)?.parent_id ?? null;
    while (parentId) {
      if (candidateIds.has(parentId)) {
        rootId = parentId;
      }
      parentId = nodeById.get(parentId)?.parent_id ?? null;
    }
    const rootCandidate = candidateById.get(rootId) ?? candidate;
    reduced.set(rootCandidate.nodeId, rootCandidate);
  }

  return [...reduced.values()];
}
