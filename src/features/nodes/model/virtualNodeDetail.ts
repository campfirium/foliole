import { VIRTUAL_NODE_FILTER_VERSION, type VirtualNodeFilter } from '../../../../lib/core/nodes/virtualNodeFilter';

import type { Node } from './nodeTypes';
import { VIRTUAL_ROOT_NODE_ID, isVirtualNode } from './specialNodes';

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function isVirtualNodeResultCandidate(node: Node, activeNodeId: string) {
  return node.id !== activeNodeId && !node.specialKind && !node.anchorLink && node.kind !== 'folder';
}

export interface VirtualNodeResultReference {
  sourceNodeId: string;
}

export function createVirtualNodeFilterFromKeyword(value: string): VirtualNodeFilter {
  const trimmedValue = value.trim();
  return {
    version: VIRTUAL_NODE_FILTER_VERSION,
    match: 'all',
    conditions: trimmedValue
      ? [
          {
            field: 'text',
            operator: 'contains',
            value: trimmedValue
          }
        ]
      : []
  };
}

export function getVirtualNodePrimaryKeyword(filter: VirtualNodeFilter | null | undefined) {
  return filter?.conditions.find((condition) => condition.field === 'text' && condition.operator === 'contains')?.value ?? '';
}

function getRunnableConditions(filter: VirtualNodeFilter | null | undefined) {
  if (!filter || filter.match !== 'all') {
    return [];
  }
  return filter.conditions
    .map((condition) => ({ ...condition, value: condition.value.trim() }))
    .filter((condition) => condition.value.length > 0);
}

function matchesVirtualNodeFilter(node: Node, filter: VirtualNodeFilter | null | undefined) {
  const runnableConditions = getRunnableConditions(filter);
  if (runnableConditions.length === 0) {
    return false;
  }
  const searchableText = `${node.title}\n${node.content}`.toLocaleLowerCase();
  return runnableConditions.every((condition) => searchableText.includes(normalizeSearchText(condition.value)));
}

function isVirtualResultCandidate(node: Node | undefined) {
  return Boolean(node && !node.specialKind && !node.anchorLink && node.kind !== 'folder');
}

function matchesPreparedVirtualNodeFilter(
  searchableText: string,
  conditions: Array<{ value: string }>
) {
  return conditions.every((condition) => searchableText.includes(normalizeSearchText(condition.value)));
}

export interface VirtualNodeResultIndex {
  countById: Map<string, number>;
  resultIdsByVirtualId: Map<string, string[]>;
  rootResultIds: string[];
}

export function buildVirtualNodeResultIndex(args: {
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds?: readonly string[];
}): VirtualNodeResultIndex {
  const trashedNodeIdSet = new Set(args.trashedNodeIds ?? []);
  const candidateIds: string[] = [];
  const searchableTextById = new Map<string, string>();
  for (const nodeId of args.nodeOrder) {
    const node = args.nodesById[nodeId];
    if (!isVirtualResultCandidate(node)) continue;
    candidateIds.push(nodeId);
    searchableTextById.set(nodeId, `${node!.title}\n${node!.content}`.toLocaleLowerCase());
  }

  const countById = new Map<string, number>();
  const resultIdsByVirtualId = new Map<string, string[]>();
  const rootResultIdSet = new Set<string>();
  for (const nodeId of args.nodeOrder) {
    const node = args.nodesById[nodeId];
    if (!isVirtualNode(node)) continue;
    const conditions = getRunnableConditions(node.virtualFilter);
    const resultIds = conditions.length === 0
      ? []
      : candidateIds.filter((candidateId) => {
          const searchableText = searchableTextById.get(candidateId);
          return Boolean(searchableText && matchesPreparedVirtualNodeFilter(searchableText, conditions));
        });
    resultIdsByVirtualId.set(nodeId, resultIds);
    if (resultIds.length > 0) countById.set(nodeId, resultIds.length);
    if (!trashedNodeIdSet.has(nodeId) && node.parentNodeId === VIRTUAL_ROOT_NODE_ID) {
      resultIds.forEach((resultId) => rootResultIdSet.add(resultId));
    }
  }

  const rootResultIds = args.nodeOrder.filter((nodeId) => !trashedNodeIdSet.has(nodeId) && rootResultIdSet.has(nodeId));
  if (rootResultIds.length > 0) countById.set(VIRTUAL_ROOT_NODE_ID, rootResultIds.length);
  return { countById, resultIdsByVirtualId, rootResultIds };
}

export function getVirtualNodeResultReferences(
  activeNodeId: string,
  nodesById: Record<string, Node>,
  filter: VirtualNodeFilter | null | undefined
) {
  const runnableConditions = getRunnableConditions(filter);
  if (runnableConditions.length === 0) {
    return [];
  }

  return Object.values(nodesById).filter(
    (node): node is Node =>
      Boolean(
        node &&
          isVirtualNodeResultCandidate(node, activeNodeId) &&
          matchesVirtualNodeFilter(node, filter)
      )
  ).map((node) => ({ sourceNodeId: node.id }));
}

export function resolveVirtualNodeResultNodes(
  references: VirtualNodeResultReference[],
  nodesById: Record<string, Node>
) {
  return references
    .map((reference) => nodesById[reference.sourceNodeId])
    .filter((node): node is Node => Boolean(isVirtualResultCandidate(node)));
}

export function getVirtualNodeResultNodes(
  activeNodeId: string,
  nodesById: Record<string, Node>,
  filter: VirtualNodeFilter | null | undefined
) {
  return resolveVirtualNodeResultNodes(getVirtualNodeResultReferences(activeNodeId, nodesById, filter), nodesById);
}

export function getOrderedVirtualNodeResultNodes(
  activeNodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  filter: VirtualNodeFilter | null | undefined
) {
  const resultIds = new Set(
    getVirtualNodeResultReferences(activeNodeId, nodesById, filter).map((reference) => reference.sourceNodeId)
  );

  return nodeOrder
    .map((nodeId) => nodesById[nodeId])
    .filter((node): node is Node => Boolean(node && resultIds.has(node.id)));
}

export function getVirtualRootResultNodes(
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  trashedNodeIds: string[] = []
) {
  const resultIds = new Set<string>();

  nodeOrder.forEach((nodeId) => {
    if (trashedNodeIds.includes(nodeId)) {
      return;
    }
    const node = nodesById[nodeId];
    if (!isVirtualNode(node) || node.parentNodeId !== VIRTUAL_ROOT_NODE_ID) {
      return;
    }

    getVirtualNodeResultReferences(node.id, nodesById, node.virtualFilter).forEach((reference) => {
      resultIds.add(reference.sourceNodeId);
    });
  });

  return nodeOrder
    .map((nodeId) => nodesById[nodeId])
    .filter((node): node is Node => Boolean(node && !trashedNodeIds.includes(node.id) && resultIds.has(node.id)));
}
