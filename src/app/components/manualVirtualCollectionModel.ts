import type { WorkspaceManualVirtualCollection } from '../../store/workspaceStore';

export const MANUAL_VIRTUAL_COLLECTION_ID_PREFIX = 'manual-virtual:';

export function toManualVirtualCollectionNodeId(collectionId: string) {
  return `${MANUAL_VIRTUAL_COLLECTION_ID_PREFIX}${collectionId}`;
}

export function parseManualVirtualCollectionNodeId(nodeId: string | null | undefined) {
  return nodeId?.startsWith(MANUAL_VIRTUAL_COLLECTION_ID_PREFIX)
    ? nodeId.slice(MANUAL_VIRTUAL_COLLECTION_ID_PREFIX.length)
    : null;
}

export function isManualVirtualCollectionNodeId(nodeId: string | null | undefined) {
  return parseManualVirtualCollectionNodeId(nodeId) !== null;
}

export function findManualVirtualCollection(
  collections: readonly WorkspaceManualVirtualCollection[] | undefined,
  nodeId: string | null | undefined
) {
  const collectionId = parseManualVirtualCollectionNodeId(nodeId);
  return collectionId ? collections?.find((collection) => collection.id === collectionId) : undefined;
}

export function collectManualVirtualCollectionTopicIds(
  collection: WorkspaceManualVirtualCollection | undefined,
  nodesById: Record<string, { anchorLink?: unknown; kind?: string | null; specialKind?: unknown } | undefined>
) {
  if (!collection) return [];
  return collection.availableMaterialNodeIds.filter((nodeId) => {
    const node = nodesById[nodeId];
    return Boolean(node && node.kind === 'topic' && !node.anchorLink && !node.specialKind);
  });
}