import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
import { projectNodeListLabel } from '../../features/nodes/model/nodeListLabelProjection';
import { getTextAnchorLocators, type Node } from '../../features/nodes/model/nodeTypes';

import type { SidebarHighlightItem } from './WorkspaceRightSidebarHighlightsList';

function collectOrderedSubtreeNodeIds(
  rootNodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  trashedNodeIds: string[]
) {
  const trashedIds = new Set(trashedNodeIds);
  nodeOrder = nodeOrder.filter((nodeId) => !trashedIds.has(nodeId));
  const knownIds = new Set(nodeOrder.filter((nodeId) => Boolean(nodesById[nodeId])));
  if (!knownIds.has(rootNodeId)) return [];

  // The tree exposes nodes in a disconnected cycle as individual root rows.
  const ancestorIds = new Set<string>();
  let ancestorId: string | null = rootNodeId;
  while (ancestorId && knownIds.has(ancestorId)) {
    if (ancestorIds.has(ancestorId)) return [rootNodeId];
    ancestorIds.add(ancestorId);
    ancestorId = nodesById[ancestorId]?.parentNodeId ?? null;
  }

  const childrenByParent = new Map<string, string[]>();
  for (const nodeId of nodeOrder) {
    const parentId = nodesById[nodeId]?.parentNodeId;
    if (!parentId || !knownIds.has(parentId)) continue;
    const siblings = childrenByParent.get(parentId);
    if (siblings) siblings.push(nodeId);
    else childrenByParent.set(parentId, [nodeId]);
  }

  const subtreeIds: string[] = [];
  const visited = new Set<string>();
  const pending = [rootNodeId];
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    subtreeIds.push(nodeId);
    const children = childrenByParent.get(nodeId) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index]!);
    }
  }
  return subtreeIds;
}

function normalizeHighlightTextFromLocator(node: Node) {
  if (node.anchorLink?.kind !== 'highlight') {
    return '';
  }
  const text = getTextAnchorLocators(node.anchorLink.locator)
    .map((locator) => projectHighlightSummaryText(locator.originalText))
    .filter(Boolean)
    .join(' ');
  return text.replace(/\s+/g, ' ').trim();
}

function projectHighlightSummaryText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => projectNodeListLabel(line))
    .filter(Boolean)
    .join(' ');
}

function normalizeNodeHighlightText(node: Node) {
  const locatorText = normalizeHighlightTextFromLocator(node);
  if (locatorText) {
    return locatorText;
  }
  const trimmed = projectHighlightSummaryText(node.content).replace(/\s+/g, ' ').trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return projectNodeListLabel(node.title);
}

function isSidebarAnchorKind(node: Node) {
  return node.anchorLink?.kind === 'cloze' || node.anchorLink?.kind === 'highlight';
}

function shouldIncludeHighlightInSidebar(node: Node, nodesById: Record<string, Node>) {
  if (!isSidebarAnchorKind(node)) {
    return false;
  }
  const anchorLink = node.anchorLink;
  if (!anchorLink?.locator) {
    return false;
  }
  const textLocators = getTextAnchorLocators(anchorLink.locator);
  if (anchorLink.kind === 'cloze') {
    return textLocators.some((locator) => {
      if (locator.from !== locator.to) {
        return false;
      }
      const originalText = locator.originalText?.trim();
      return Boolean(originalText);
    });
  }
  if (textLocators.length === 0) {
    return true;
  }
  const parentNode = node.parentNodeId ? nodesById[node.parentNodeId] : null;
  if (!parentNode) {
    return true;
  }
  if (parentNode.hasContent === true && parentNode.content.length === 0) {
    return true;
  }
  return textLocators.some((locator) => Boolean(findAnchorSelection(parentNode.content, { ...anchorLink, locator })));
}

export function collectSubtreeHighlights(
  activeNodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  trashedNodeIds: string[]
): SidebarHighlightItem[] {
  const subtreeNodeIds = collectOrderedSubtreeNodeIds(
    activeNodeId,
    nodeOrder,
    nodesById,
    trashedNodeIds
  );
  const highlights: SidebarHighlightItem[] = [];

  for (const nodeId of subtreeNodeIds) {
    if (nodeId === activeNodeId) {
      continue;
    }
    const node = nodesById[nodeId];
    if (!node || !shouldIncludeHighlightInSidebar(node, nodesById)) {
      continue;
    }

    const text = normalizeNodeHighlightText(node);
    if (!text) {
      continue;
    }

    highlights.push({
      kind: node.anchorLink?.kind === 'cloze' ? 'cloze' : 'highlight',
      nodeId: node.id,
      text
    });
  }

  return highlights;
}
