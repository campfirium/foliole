import { useMemo, useRef } from 'react';

import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
import { projectNodeListLabel } from '../../features/nodes/model/nodeListLabelProjection';
import { buildNodeTreeRows } from '../../features/nodes/model/nodeTree';
import { getTextAnchorLocators, type Node } from '../../features/nodes/model/nodeTypes';
import {
  projectWorkspaceListNodesById,
  type WorkspaceListNodesById
} from '../../features/nodes/model/workspaceListNode';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppErrorState,
  InspectorList,
  InspectorListHeading,
  InspectorListRow,
  inspectorListBodyClassName,
  inspectorListDividerClassName,
  inspectorListInsetClassName
} from '../../shared/ui';

interface WorkspaceRightSidebarHighlightsPanelProps {
  activeNodeId: string | null;
  nodeOrder: string[];
  trashedNodeIds: string[];
  nodesById: Record<string, Node>;
  onRevealHighlight: (nodeId: string) => void;
}

function isHighlightPanelTopic(node: Node) {
  return node.kind === 'topic' && !node.anchorLink && !node.specialKind;
}

interface NodeHighlightItem {
  kind: 'cloze' | 'highlight';
  nodeId: string;
  text: string;
}

function collectOrderedSubtreeNodeIds(
  rootNodeId: string,
  nodeOrder: string[],
  listNodesById: WorkspaceListNodesById,
  nodesById: Record<string, Node>,
  trashedNodeIds: string[]
) {
  const trashedSet = new Set(trashedNodeIds);
  const visibleNodeOrder = nodeOrder.filter((nodeId) => !trashedSet.has(nodeId) && Boolean(nodesById[nodeId]));
  const rows = buildNodeTreeRows(visibleNodeOrder, listNodesById);
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

function collectSubtreeHighlights(
  activeNodeId: string,
  nodeOrder: string[],
  listNodesById: WorkspaceListNodesById,
  nodesById: Record<string, Node>,
  trashedNodeIds: string[]
): NodeHighlightItem[] {
  const subtreeNodeIds = collectOrderedSubtreeNodeIds(
    activeNodeId,
    nodeOrder,
    listNodesById,
    nodesById,
    trashedNodeIds
  );
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
      kind: node.anchorLink?.kind === 'cloze' ? 'cloze' : 'highlight',
      nodeId: node.id,
      text
    });
  }

  return highlights;
}

export function WorkspaceRightSidebarHighlightsPanel(props: WorkspaceRightSidebarHighlightsPanelProps) {
  const t = useTranslation();
  const previousListNodesByIdRef = useRef<WorkspaceListNodesById>({});
  const listNodesById = useMemo(() => {
    const nextProjection = projectWorkspaceListNodesById(
      props.nodesById,
      previousListNodesByIdRef.current
    );
    previousListNodesByIdRef.current = nextProjection;
    return nextProjection;
  }, [props.nodesById]);
  const node = props.activeNodeId ? props.nodesById[props.activeNodeId] : null;
  const highlights = useMemo(
    () =>
      node
        ? collectSubtreeHighlights(
            node.id,
            props.nodeOrder,
            listNodesById,
            props.nodesById,
            props.trashedNodeIds
          )
        : [],
    [listNodesById, node, props.nodeOrder, props.nodesById, props.trashedNodeIds]
  );

  if (!props.activeNodeId) {
    return null;
  }
  if (!node) {
    return <AppErrorState description={t('desktop.rightPanel.highlights.unavailableDescription')} title={t('desktop.rightPanel.highlights.unavailableTitle')} />;
  }
  if (!isHighlightPanelTopic(node)) {
    return null;
  }
  if (highlights.length === 0) {
    return null;
  }

  return (
    <div className={`min-w-0 ${inspectorListInsetClassName}`}>
      <InspectorListHeading>
        {t('desktop.rightPanel.highlights.count', { count: highlights.length })}
      </InspectorListHeading>
      <InspectorList ariaLabel={t('desktop.rightPanel.highlights.list')}>
        {highlights.map((highlight) => (
          <li className={`min-w-0 ${inspectorListDividerClassName}`} key={highlight.nodeId}>
            <InspectorListRow
              className="flex-col items-start px-0 py-4"
              onClick={() => props.onRevealHighlight(highlight.nodeId)}
              type="button"
            >
              <span className={`${inspectorListBodyClassName} max-w-full whitespace-normal break-words leading-7 text-foreground`}>
                {highlight.text}
              </span>
            </InspectorListRow>
          </li>
        ))}
      </InspectorList>
    </div>
  );
}
