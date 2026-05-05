import { isPdfAnchorLocator, type NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { requestPdfAnchorJump } from '../../features/pdf/model/pdfSystemBridge';
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
    return (
      <WorkspaceRightSidebarDevPanel
        activeNodeId={props.activeNodeId}
        nodesById={props.nodesById}
        reviewSchedulerSettings={props.reviewSchedulerSettings}
      />
    );
  }
  if (props.activePanelId === 'performance') {
    return <WorkspaceRightSidebarPerformancePanel activeNodeId={props.activeNodeId} nodesById={props.nodesById} />;
  }
  if (props.activePanelId === 'source-info') {
    return <WorkspaceRightSidebarSourcePanel activeNodeId={props.activeNodeId} nodesById={props.nodesById} />;
  }
  if (props.activePanelId === 'highlights') {
    return renderHighlightsPanel(props);
  }
  if (props.activePanelId === 'backlinks') {
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
  return (
    <WorkspaceRightSidebarReviewQueuePanel
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
  > & {
    onRevealAnchorInDocument: (anchor: NodeAnchorLink) => void;
  }
) {
  return (
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId={props.activeNodeId}
      nodeOrder={props.nodeOrder}
      trashedNodeIds={props.trashedNodeIds}
      nodesById={props.nodesById}
      onRevealHighlight={(nodeId) => {
        const highlightNode = props.nodesById[nodeId];
        if (highlightNode?.anchorLink?.kind === 'highlight' && highlightNode.parentNodeId) {
          if (props.activeNodeId === highlightNode.parentNodeId) {
            props.onRevealAnchorInDocument(highlightNode.anchorLink as NodeAnchorLink);
            return;
          }
          props.onSelectNode(highlightNode.parentNodeId);
          if (isPdfAnchorLocator(highlightNode.anchorLink.locator)) {
            requestPdfAnchorJump(highlightNode.parentNodeId, highlightNode.anchorLink.locator);
          }
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
  | 'onSelectNode'
  | 'reviewCurrentNodeId'
  | 'reviewQueueNodeIds'
  | 'reviewSchedulerSettings'
> & {
  activePanelId: WorkspaceRightPanelId;
  onRevealAnchorInDocument: (anchor: NodeAnchorLink) => void;
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
