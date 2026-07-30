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

function isVirtualResultCandidate(node: VirtualNodeResultCandidate | undefined) {
  return Boolean(node && !node.specialKind && !node.anchorLink && node.kind !== 'folder');
}

function matchesVirtualNodeFilter(
  node: VirtualNodeResultCandidate,
  searchableText: string,
  conditions: ReturnType<typeof getRunnableConditions>
) {
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

export function createVirtualNodeResultResolver(args: {
  nodeOrder: readonly string[];
  nodesById: Record<string, VirtualNodeResultCandidate | undefined>;
}) {
  const candidateIds = args.nodeOrder.filter((nodeId) => isVirtualResultCandidate(args.nodesById[nodeId]));
  let searchableTextById: Map<string, string> | null = null;

  function getSearchableTextById() {
    searchableTextById ??= new Map(candidateIds.map((nodeId) => {
      const node = args.nodesById[nodeId]!;
      return [nodeId, `${node.title}\n${node.content ?? ''}`.toLocaleLowerCase()];
    }));
    return searchableTextById;
  }

  return (request: {
    activeNodeId: string;
    filter: VirtualNodeFilter | null | undefined;
    manualChildOrder?: readonly string[] | null | undefined;
  }) => {
    const availableIds = candidateIds.filter((nodeId) => nodeId !== request.activeNodeId);
    const conditions = getRunnableConditions(request.filter);
    const matchedIds = isManualVirtualNodeFilter(request.filter)
      ? (request.manualChildOrder ?? []).filter((nodeId) => availableIds.includes(nodeId))
      : conditions.length === 0
        ? []
        : availableIds.filter((nodeId) => {
          const preparedTextById = getSearchableTextById();
          const node = args.nodesById[nodeId];
          const searchableText = preparedTextById.get(nodeId);
          return Boolean(node && searchableText && matchesVirtualNodeFilter(node, searchableText, conditions));
        });
    return applyVirtualNodeManualOrder(matchedIds, request.manualChildOrder);
  };
}

export function resolveVirtualNodeResultIds(args: {
  activeNodeId: string;
  filter: VirtualNodeFilter | null | undefined;
  manualChildOrder?: readonly string[] | null | undefined;
  nodeOrder: readonly string[];
  nodesById: Record<string, VirtualNodeResultCandidate | undefined>;
}) {
  return createVirtualNodeResultResolver({ nodeOrder: args.nodeOrder, nodesById: args.nodesById })({
    activeNodeId: args.activeNodeId,
    filter: args.filter,
    manualChildOrder: args.manualChildOrder
  });
}
