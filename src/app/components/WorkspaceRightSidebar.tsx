import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';

import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceRightSidebarDevPanel } from './WorkspaceRightSidebarDevPanel';
import { WorkspaceRightSidebarHighlightsPanel } from './WorkspaceRightSidebarHighlightsPanel';
import { WorkspaceRightSidebarReviewQueuePanel } from './WorkspaceRightSidebarReviewQueuePanel';
import { WorkspaceRightSidebarSourcePanel } from './WorkspaceRightSidebarSourcePanel';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

function getPanelTitle(panelId: WorkspaceRightPanelId) {
  if (panelId === 'dev') {
    return 'Dev panel';
  }
  if (panelId === 'source-info') {
    return 'Source info';
  }
  if (panelId === 'highlights') {
    return 'Highlights';
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
  if (props.activePanelId === 'source-info') {
    return <WorkspaceRightSidebarSourcePanel activeNodeId={props.activeNodeId} nodesById={props.nodesById} />;
  }
  if (props.activePanelId === 'highlights') {
    return (
      <WorkspaceRightSidebarHighlightsPanel
        activeNodeId={props.activeNodeId}
        nodeOrder={props.nodeOrder}
        trashedNodeIds={props.trashedNodeIds}
        nodesById={props.nodesById}
        onRevealHighlight={(nodeId) => props.onSelectNode(nodeId)}
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
