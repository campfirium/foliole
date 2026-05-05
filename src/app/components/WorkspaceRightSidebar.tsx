import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceRightSidebarDevPanel } from './WorkspaceRightSidebarDevPanel';
import { WorkspaceRightSidebarImportPanel } from './WorkspaceRightSidebarImportPanel';
import { WorkspaceRightSidebarReviewQueuePanel } from './WorkspaceRightSidebarReviewQueuePanel';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export function WorkspaceRightSidebar(props: Pick<
  WorkspaceLayoutProps,
  | 'activeNodeId'
  | 'nodesById'
  | 'reviewCurrentNodeId'
  | 'reviewQueueNodeIds'
  | 'reviewSchedulerSettings'
> & {
  activePanelId: WorkspaceRightPanelId;
}) {
  const panelTitle = props.activePanelId === 'dev' ? 'Dev panel' : props.activePanelId === 'import' ? 'Import' : 'Review queue';

  return (
    <aside
      aria-label="Inspector"
      className="hidden min-h-0 flex-col overflow-hidden border-l border-border bg-bg-panel text-foreground xl:flex xl:[width:var(--workspace-right-sidebar-width,320px)]"
    >
      <header className="px-4 pt-4">
        <div className="px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/40">Inspector</p>
          <h2 className="text-sm font-semibold text-foreground">{panelTitle}</h2>
        </div>
      </header>
      <div className="app-scrollbar flex-1 overflow-y-auto px-3 py-3">
        {props.activePanelId === 'dev' ? (
          <WorkspaceRightSidebarDevPanel
            activeNodeId={props.activeNodeId}
            nodesById={props.nodesById}
            reviewSchedulerSettings={props.reviewSchedulerSettings}
          />
        ) : props.activePanelId === 'import' ? (
          <WorkspaceRightSidebarImportPanel />
        ) : (
          <WorkspaceRightSidebarReviewQueuePanel
            currentNodeId={props.reviewCurrentNodeId}
            nodesById={props.nodesById}
            queueNodeIds={props.reviewQueueNodeIds}
          />
        )}
      </div>
    </aside>
  );
}
