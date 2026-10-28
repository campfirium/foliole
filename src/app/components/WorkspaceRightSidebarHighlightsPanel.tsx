import { useMemo, useRef, type RefObject } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppErrorState,
  InspectorListHeading,
  inspectorListInsetClassName
} from '../../shared/ui';

import { WorkspaceRightSidebarHighlightsList } from './WorkspaceRightSidebarHighlightsList';
import { collectSubtreeHighlights } from './workspaceSidebarHighlights';

interface WorkspaceRightSidebarHighlightsPanelProps {
  activeNodeId: string | null;
  nodeOrder: string[];
  trashedNodeIds: string[];
  nodesById: Record<string, Node>;
  onRevealHighlight: (nodeId: string) => void;
  scrollElementRef?: RefObject<HTMLElement>;
}

function isHighlightPanelTopic(node: Node) {
  return node.kind === 'topic' && !node.anchorLink && !node.specialKind;
}

export function WorkspaceRightSidebarHighlightsPanel(props: WorkspaceRightSidebarHighlightsPanelProps) {
  const t = useTranslation();
  const fallbackScrollElementRef = useRef<HTMLElement>(null);
  const node = props.activeNodeId ? props.nodesById[props.activeNodeId] : null;
  const highlights = useMemo(
    () =>
      node && isHighlightPanelTopic(node)
        ? collectSubtreeHighlights(
            node.id,
            props.nodeOrder,
            props.nodesById,
            props.trashedNodeIds
          )
        : [],
    [node, props.nodeOrder, props.nodesById, props.trashedNodeIds]
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
      <WorkspaceRightSidebarHighlightsList
        ariaLabel={t('desktop.rightPanel.highlights.list')}
        highlights={highlights}
        onRevealHighlight={props.onRevealHighlight}
        scrollElementRef={props.scrollElementRef ?? fallbackScrollElementRef}
      />
    </div>
  );
}
