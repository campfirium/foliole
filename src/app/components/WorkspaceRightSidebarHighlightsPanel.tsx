import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
import { buildNodeTreeRows } from '../../features/nodes/model/nodeTree';
import { getTextAnchorLocators, type Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { InspectorSection } from '../../shared/ui';

interface WorkspaceRightSidebarHighlightsPanelProps {
  activeNodeId: string | null;
  nodeOrder: string[];
  trashedNodeIds: string[];
  nodesById: Record<string, Node>;
  onRevealHighlight: (nodeId: string) => void;
}

function EmptyHighlightsState({ description }: { description: string }) {
  return <InspectorSection description={description} title="Highlights" />;
}

interface NodeHighlightItem {
  kind: 'highlight';
  nodeId: string;
  text: string;
}

function collectOrderedSubtreeNodeIds(
  rootNodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  trashedNodeIds: string[]
) {
  const trashedSet = new Set(trashedNodeIds);
  const visibleNodeOrder = nodeOrder.filter((nodeId) => !trashedSet.has(nodeId) && Boolean(nodesById[nodeId]));
  const rows = buildNodeTreeRows(visibleNodeOrder, toWorkspaceListNodesById(nodesById));
  const rootIndex = rows.findIndex((row) => row.node.id === rootNodeId);
  if (rootIndex < 0) {
    return [];
  }
  const rootDepth = rows[rootIndex]?.depth ?? 0;
  const subtreeIds = [rootNodeId];
  for (let index = rootIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) {
      continue;
    }
    if (row.depth <= rootDepth) {
      break;
    }
    subtreeIds.push(row.node.id);
  }
  return subtreeIds;
}

function normalizeNodeHighlightText(node: Node) {
  const trimmed = node.content.replace(/\s+/g, ' ').trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return node.title.trim();
}

function isSidebarAnchorKind(node: Node) {
  return node.anchorLink?.kind === 'highlight';
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

function collectSubtreeHighlights(
  activeNodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  trashedNodeIds: string[]
): NodeHighlightItem[] {
  const subtreeNodeIds = collectOrderedSubtreeNodeIds(activeNodeId, nodeOrder, nodesById, trashedNodeIds);
  const highlights: NodeHighlightItem[] = [];

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
      kind: 'highlight',
      nodeId: node.id,
      text
    });
  }

  return highlights;
}

export function WorkspaceRightSidebarHighlightsPanel(props: WorkspaceRightSidebarHighlightsPanelProps) {
  if (!props.activeNodeId) {
    return <EmptyHighlightsState description="Select a document to browse its highlights." />;
  }

  const node = props.nodesById[props.activeNodeId];
  if (!node) {
    return null;
  }

  const highlights = collectSubtreeHighlights(node.id, props.nodeOrder, props.nodesById, props.trashedNodeIds);
  if (highlights.length === 0) {
    return <EmptyHighlightsState description="This node and its child nodes have no highlight nodes yet." />;
  }

  return (
    <div className="px-1">
      <p className="px-1 pb-2 text-xs font-medium uppercase tracking-[0.08em] text-foreground/55">
        Total highlights: {highlights.length}
      </p>
      <ol aria-label="Document highlights" className="flex flex-col">
        {highlights.map((highlight) => (
          <li className="border-b border-border/35 last:border-b-0" key={highlight.nodeId}>
            <button
              className="flex w-full flex-col items-start px-1 py-4 text-left transition-colors hover:bg-black/[0.015] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              onClick={() => props.onRevealHighlight(highlight.nodeId)}
              type="button"
            >
              <span className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">
                Highlight
              </span>
              <span className="text-sm leading-7 text-foreground">{highlight.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
