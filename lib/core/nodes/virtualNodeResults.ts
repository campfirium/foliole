import { readTopicCollections } from './topicCollectionsFrontmatter.js';
import { isManualVirtualNodeFilter, type VirtualNodeFilter } from './virtualNodeFilter.js';

export interface VirtualNodeResultCandidate {
  anchorLink?: unknown;
  collections?: readonly string[];
  content?: string;
  id: string;
  kind: string;
  specialKind?: string;
  title: string;
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function getRunnableConditions(filter: VirtualNodeFilter | null | undefined) {
  if (!filter || filter.match !== 'all') return [];
  return filter.conditions
    .map((condition) => ({ ...condition, value: condition.value.trim() }))
    .filter((condition) => condition.value.length > 0);
}

function readCandidateCollections(node: Pick<VirtualNodeResultCandidate, 'collections' | 'content'>) {
  if (node.content) {
    try {
      return readTopicCollections(node.content);
    } catch {
      return [];
    }
  }
  return [...(node.collections ?? [])];
}

function isVirtualResultCandidate(node: VirtualNodeResultCandidate | undefined, activeNodeId: string) {
  return Boolean(node && node.id !== activeNodeId && !node.specialKind && !node.anchorLink && node.kind !== 'folder');
}

function matchesVirtualNodeFilter(node: VirtualNodeResultCandidate, filter: VirtualNodeFilter | null | undefined) {
  const conditions = getRunnableConditions(filter);
  if (conditions.length === 0) return false;
  const searchableText = `${node.title}\n${node.content ?? ''}`.toLocaleLowerCase();
  return conditions.every((condition) => {
    if (condition.field === 'collection') return readCandidateCollections(node).includes(condition.value);
    if (condition.field === 'manual') return false;
    return searchableText.includes(normalizeSearchText(condition.value));
  });
}

export function applyVirtualNodeManualOrder(resultIds: readonly string[], manualChildOrder: readonly string[] | null | undefined) {
  const remaining = new Set(resultIds);
  const ordered = (manualChildOrder ?? []).filter((id) => remaining.delete(id));
  return [...ordered, ...resultIds.filter((id) => remaining.has(id))];
}

export function resolveVirtualNodeResultIds(args: {
  activeNodeId: string;
  filter: VirtualNodeFilter | null | undefined;
  manualChildOrder?: readonly string[] | null | undefined;
  nodeOrder: readonly string[];
  nodesById: Record<string, VirtualNodeResultCandidate | undefined>;
}) {
  const candidateIds = args.nodeOrder.filter((nodeId) => isVirtualResultCandidate(args.nodesById[nodeId], args.activeNodeId));
  const matchedIds = isManualVirtualNodeFilter(args.filter)
    ? (args.manualChildOrder ?? []).filter((nodeId) => candidateIds.includes(nodeId))
    : candidateIds.filter((nodeId) => {
      const node = args.nodesById[nodeId];
      return Boolean(node && matchesVirtualNodeFilter(node, args.filter));
    });
  return applyVirtualNodeManualOrder(matchedIds, args.manualChildOrder);
}
