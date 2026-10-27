import { useMemo, useRef } from 'react';

import { getImageClozeLocator } from '../../features/image-cloze/model/imageCloze';
import type { Node } from '../../features/nodes/model/nodeTypes';

function hasPresentedRegions(node: Node) {
  return Boolean(node.imageRegions?.some((group) => group.regions.length) || getImageClozeLocator(node.anchorLink));
}

function selectImageNodes(nodeId: string | undefined, nodesById: Record<string, Node>, trashedNodeIds: string[]) {
  if (!nodeId) return [];
  const trashed = new Set(trashedNodeIds);
  const visibleNodes = Object.values(nodesById).filter((node) => !trashed.has(node.id));
  const childIds = new Set(visibleNodes.filter((node) => node.parentNodeId === nodeId).map((node) => node.id));
  return visibleNodes.filter((node) => (
    (node.parentNodeId === nodeId || (node.parentNodeId && childIds.has(node.parentNodeId))) &&
    hasPresentedRegions(node)
  ));
}

function sameImageInputs(left: Node[], right: Node[]) {
  return left.length === right.length && left.every((node, index) => {
    const other = right[index];
    return other !== undefined && node.id === other.id && node.parentNodeId === other.parentNodeId &&
      node.anchorLink === other.anchorLink && node.imageRegions === other.imageRegions;
  });
}

export function useDocumentPanelImageInputs(
  activeNode: Node | undefined,
  nodesById: Record<string, Node>,
  trashedNodeIds: string[]
) {
  // Keep immutable image inputs stable across scheduling and other unrelated node updates.
  const previousNodes = useRef<Node[]>([]);
  const imageNodesById = useMemo(() => {
    const nodeId = getImageClozeLocator(activeNode?.anchorLink) ? undefined : activeNode?.id;
    const next = selectImageNodes(nodeId, nodesById, trashedNodeIds);
    if (!sameImageInputs(previousNodes.current, next)) previousNodes.current = next;
    return previousNodes.current;
  }, [activeNode?.id, activeNode?.anchorLink, nodesById, trashedNodeIds]);
  const selectedNodesById = useMemo(() => Object.fromEntries(imageNodesById.map((node) => [node.id, node])), [imageNodesById]);
  const source = useMemo(() => activeNode ? {
    id: activeNode.id,
    content: activeNode.content,
    anchorLink: activeNode.anchorLink ?? null,
    imageRegions: activeNode.imageRegions ?? null
  } : undefined, [activeNode?.id, activeNode?.content, activeNode?.anchorLink, activeNode?.imageRegions]);
  return { source, selectedNodesById };
}
