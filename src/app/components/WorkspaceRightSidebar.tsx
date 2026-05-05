import { memo } from 'react';

import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { recordComponentRender } from '../../shared/platform/performanceDiagnosticsProbe';

import type { WorkspaceLayoutProps } from './WorkspaceLayout';
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

function renderPanel(
  props: Pick<
    WorkspaceLayoutProps,
    | 'activeNodeId'
    | 'nodeOrder'
    | 'trashedNodeIds'
    | 'nodesById'
    | 'onSelectBreadcrumbNode'
    | 'onSelectNode'
    | 'reviewCurrentNodeId'
    | 'reviewQueueNodeIds'
    | 'reviewSchedulerSettings'
  > & {
    activePanelId: WorkspaceRightPanelId;
    onRevealAnchorInDocument: (anchor: NodeAnchorLink) => void;
  }
) {
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
  nodesById: WorkspaceLayoutProps['nodesById'];
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

function renderDevPanel(
  props: Pick<WorkspaceLayoutProps, 'activeNodeId' | 'nodesById' | 'reviewSchedulerSettings'>
) {
  return (
    <WorkspaceRightSidebarDevPanel
      activeNodeId={props.activeNodeId}
      nodesById={props.nodesById}
      reviewSchedulerSettings={props.reviewSchedulerSettings}
    />
  );
}

function renderPerformancePanel(
  props: Pick<WorkspaceLayoutProps, 'activeNodeId' | 'nodesById'>
) {
  return <WorkspaceRightSidebarPerformancePanel activeNodeId={props.activeNodeId} nodesById={props.nodesById} />;
}

function renderSourceInfoPanel(
  props: Pick<WorkspaceLayoutProps, 'activeNodeId' | 'nodesById'>
) {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : null;
  return (
    <SourceInfoSidebarPanel
      activeNodeId={props.activeNodeId}
      hasActiveNode={Boolean(activeNode)}
    />
  );
}

function renderBacklinksPanel(
  props: Pick<WorkspaceLayoutProps, 'activeNodeId' | 'nodeOrder' | 'nodesById' | 'onSelectNode' | 'trashedNodeIds'>
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
  props: Pick<WorkspaceLayoutProps, 'reviewCurrentNodeId' | 'nodesById' | 'reviewQueueNodeIds'>
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
    WorkspaceLayoutProps,
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

export function WorkspaceRightSidebar(props: Pick<
  WorkspaceLayoutProps,
  | 'activeNodeId'
  | 'nodeOrder'
  | 'trashedNodeIds'
  | 'nodesById'
  | 'onSelectBreadcrumbNode'
  | 'onSelectNode'
  | 'reviewCurrentNodeId'
  | 'reviewQueueNodeIds'
  | 'reviewSchedulerSettings'
> & {
  activePanelId: WorkspaceRightPanelId;
  onRevealAnchorInDocument: (anchor: NodeAnchorLink) => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
}) {
  recordComponentRender('rightSidebar');
  return (
    <aside
      aria-label="Inspector"
      className="hidden min-h-0 flex-col overflow-hidden border-l border-border bg-bg-panel text-foreground xl:flex xl:[width:var(--workspace-right-sidebar-width,320px)]"
    >
      <header className="px-4 pt-4">
        <div className="px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/40">Inspector</p>
          <h2 className="text-sm font-semibold text-foreground">{getPanelTitle(props.activePanelId)}</h2>
        </div>
      </header>
      <div className="app-scrollbar flex-1 overflow-y-auto px-3 py-3">{renderPanel(props)}</div>
    </aside>
  );
}
