import { resolveFolderSourceTopicIds } from './folderSourceTopics.js';
import { readTopicCollections } from './topicCollectionsFrontmatter.js';
import { isManualVirtualNodeFilter, type VirtualNodeFilter } from './virtualNodeFilter.js';

export interface VirtualNodeResultCandidate {
  anchorLink?: unknown;
  collections?: readonly string[];
  content?: string;
  id: string;
  kind: string;
  parentNodeId?: string | null;
  deletedAt?: string | null;
  virtualFilter?: VirtualNodeFilter | null;
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
  trashedNodeIds?: ReadonlySet<string>;
}) {
  const candidateIds = args.nodeOrder.filter((nodeId) => isVirtualResultCandidate(args.nodesById[nodeId]));
  const available = new Set(args.nodeOrder);
  let childrenByParent: Map<string, string[]> | undefined;
  function getChildren(id: string) {
    if (!childrenByParent) {
      childrenByParent = new Map();
      for (const nodeId of available) {
        const node = args.nodesById[nodeId];
        const parent = node?.parentNodeId;
        if (!parent || node.deletedAt || args.trashedNodeIds?.has(nodeId)) continue;
        const siblings = childrenByParent.get(parent);
        if (siblings) siblings.push(nodeId);
        else childrenByParent.set(parent, [nodeId]);
      }
    }
    return childrenByParent.get(id) ?? [];
  }
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
    if (isManualVirtualNodeFilter(request.filter)) {
      return resolveFolderSourceTopicIds(request.manualChildOrder ?? [], {
        childrenOf: getChildren,
        kindOf: (id) => {
          const node = args.nodesById[id];
          if (!node || id === request.activeNodeId || !available.has(id)) return undefined;
          if (node.kind === 'folder' && !node.specialKind && !node.virtualFilter &&
            !node.deletedAt && !args.trashedNodeIds?.has(id)) return 'folder';
          return isVirtualResultCandidate(node) ? 'topic' : undefined;
        }
      });
    }
    const conditions = getRunnableConditions(request.filter);
    const matchedIds = conditions.length === 0 ? [] : candidateIds.filter((nodeId) => {
      if (nodeId === request.activeNodeId) return false;
      const node = args.nodesById[nodeId];
      const searchableText = getSearchableTextById().get(nodeId);
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
