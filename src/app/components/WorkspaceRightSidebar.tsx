import { memo } from 'react';

import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { recordComponentRender } from '../../shared/platform/performanceDiagnosticsProbe';
import { AppPanel } from '../../shared/ui';

import { WorkspaceRightSidebarBacklinksPanel } from './WorkspaceRightSidebarBacklinksPanel';
import { WorkspaceRightSidebarDevPanel } from './WorkspaceRightSidebarDevPanel';
import { WorkspaceRightSidebarHighlightsPanel } from './WorkspaceRightSidebarHighlightsPanel';
import { WorkspaceRightSidebarPerformancePanel } from './WorkspaceRightSidebarPerformancePanel';
import { WorkspaceRightSidebarReviewQueuePanel } from './WorkspaceRightSidebarReviewQueuePanel';
import { WorkspaceRightSidebarSourcePanel } from './WorkspaceRightSidebarSourcePanel';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

function getPanelTitle(panelId: WorkspaceRightPanelId) {
  if (panelId === 'dev') {
    return 'Dev panel';
  }
  if (panelId === 'performance') {
    return 'Flow diagnostics';
  }
  if (panelId === 'source-info') {
    return 'Source info';
  }
  if (panelId === 'highlights') {
    return 'Highlights';
  }
  if (panelId === 'backlinks') {
    return 'Backlinks';
  }
  return 'Review queue';
}

type WorkspaceRightSidebarNodesById = Record<string, Node>;

interface WorkspaceRightSidebarPanelProps {
  activeNodeId: string | null;
  activePanelId: WorkspaceRightPanelId;
  nodeOrder: string[];
  nodesById: WorkspaceRightSidebarNodesById;
  onRevealAnchorInDocument: (anchor: NodeAnchorLink) => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  reviewCurrentNodeId: string | null;
  reviewQueueNodeIds: string[];
  reviewSchedulerSettings: ReviewSchedulerSettings;
  trashedNodeIds: string[];
}

function renderPanel(props: WorkspaceRightSidebarPanelProps) {
  if (props.activePanelId === 'dev') {
    return renderDevPanel(props);
  }
  if (props.activePanelId === 'performance') {
    return renderPerformancePanel(props);
  }
  if (props.activePanelId === 'source-info') {
    return renderSourceInfoPanel(props);
  }
  if (props.activePanelId === 'highlights') {
    return renderHighlightsPanel(props);
  }
  if (props.activePanelId === 'backlinks') {
    return renderBacklinksPanel(props);
  }
  return renderReviewQueuePanel(props);
}

const SourceInfoSidebarPanel = memo(function SourceInfoSidebarPanel(props: {
  activeNodeId: string | null;
  hasActiveNode: boolean;
}) {
  return <WorkspaceRightSidebarSourcePanel {...props} />;
}, (previousProps, nextProps) =>
  previousProps.activeNodeId === nextProps.activeNodeId &&
  previousProps.hasActiveNode === nextProps.hasActiveNode
);

const ReviewQueueSidebarPanel = memo(function ReviewQueueSidebarPanel(props: {
  currentNodeId: string | null;
  nodesById: WorkspaceRightSidebarNodesById;
  queueNodeIds: string[];
}) {
  return <WorkspaceRightSidebarReviewQueuePanel {...props} />;
}, (previousProps, nextProps) => {
  if (previousProps.currentNodeId !== nextProps.currentNodeId) {
    return false;
  }
  if (previousProps.queueNodeIds.length !== nextProps.queueNodeIds.length) {
    return false;
  }
  return previousProps.queueNodeIds.every((nodeId, index) => {
    if (nodeId !== nextProps.queueNodeIds[index]) {
      return false;
    }
    const previousNode = previousProps.nodesById[nodeId];
    const nextNode = nextProps.nodesById[nodeId];
    return (
      previousNode?.title === nextNode?.title &&
      previousNode?.createdAt === nextNode?.createdAt &&
      previousNode?.review?.due === nextNode?.review?.due &&
      previousNode?.review?.state === nextNode?.review?.state &&
      previousNode?.reading?.nextAt === nextNode?.reading?.nextAt
    );
  });
});

function renderDevPanel(props: Pick<WorkspaceRightSidebarPanelProps, 'activeNodeId' | 'nodesById' | 'reviewSchedulerSettings'>) {
  return (
    <WorkspaceRightSidebarDevPanel
      activeNodeId={props.activeNodeId}
      nodesById={props.nodesById}
      reviewSchedulerSettings={props.reviewSchedulerSettings}
    />
  );
}

function renderPerformancePanel(props: Pick<WorkspaceRightSidebarPanelProps, 'activeNodeId' | 'nodesById'>) {
  return <WorkspaceRightSidebarPerformancePanel activeNodeId={props.activeNodeId} nodesById={props.nodesById} />;
}

function renderSourceInfoPanel(props: Pick<WorkspaceRightSidebarPanelProps, 'activeNodeId' | 'nodesById'>) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : null;
  return (
    <SourceInfoSidebarPanel
      activeNodeId={props.activeNodeId}
      hasActiveNode={Boolean(activeNode)}
    />
  );
}

function renderBacklinksPanel(
  props: Pick<WorkspaceRightSidebarPanelProps, 'activeNodeId' | 'nodeOrder' | 'nodesById' | 'onSelectNode' | 'trashedNodeIds'>
) {
  return (
    <WorkspaceRightSidebarBacklinksPanel
      activeNodeId={props.activeNodeId}
      nodeOrder={props.nodeOrder}
      nodesById={props.nodesById}
      onSelectNode={props.onSelectNode}
      trashedNodeIds={props.trashedNodeIds}
    />
  );
}

function renderReviewQueuePanel(
  props: Pick<WorkspaceRightSidebarPanelProps, 'reviewCurrentNodeId' | 'nodesById' | 'reviewQueueNodeIds'>
) {
  return (
    <ReviewQueueSidebarPanel
      currentNodeId={props.reviewCurrentNodeId}
      nodesById={props.nodesById}
      queueNodeIds={props.reviewQueueNodeIds}
    />
  );
}

function renderHighlightsPanel(
  props: Pick<
    WorkspaceRightSidebarPanelProps,
    'activeNodeId' | 'nodeOrder' | 'trashedNodeIds' | 'nodesById' | 'onSelectNode'
  >
) {
  return (
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId={props.activeNodeId}
      nodeOrder={props.nodeOrder}
      trashedNodeIds={props.trashedNodeIds}
      nodesById={props.nodesById}
      onRevealHighlight={(nodeId) => {
        const highlightNode = props.nodesById[nodeId];
        if (
          (highlightNode?.anchorLink?.kind === 'highlight' || highlightNode?.anchorLink?.kind === 'cloze') &&
          highlightNode.parentNodeId
        ) {
          props.onSelectNode(highlightNode.parentNodeId, highlightNode.anchorLink as NodeAnchorLink);
          return;
        }
        props.onSelectNode(nodeId);
      }}
    />
  );
}

export interface WorkspaceRightSidebarProps {
  activeNodeId: string | null;
  activePanelId: WorkspaceRightPanelId;
  nodeOrder: string[];
  nodesById: WorkspaceRightSidebarNodesById;
  onRevealAnchorInDocument: (anchor: NodeAnchorLink) => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  reviewCurrentNodeId: string | null;
  reviewQueueNodeIds: string[];
  reviewSchedulerSettings: ReviewSchedulerSettings;
  trashedNodeIds: string[];
}

export function WorkspaceRightSidebar(props: WorkspaceRightSidebarProps) {
  recordComponentRender('rightSidebar');
  return (
    <AppPanel
      aria-label="Inspector"
      as="aside"
      bodyClassName="app-scrollbar overflow-y-auto px-3 py-3"
      className="workspace-region-main-sidebar hidden min-h-0 h-full flex-col overflow-hidden text-foreground xl:flex"
      headerClassName="min-h-[var(--workspace-top-toolbar-height)] px-4 py-2"
      title={<span className="text-sm font-semibold uppercase tracking-[0.04em]">{getPanelTitle(props.activePanelId)}</span>}
    >
      {renderPanel(props)}
    </AppPanel>
  );
}
