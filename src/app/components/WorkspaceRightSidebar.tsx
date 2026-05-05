import { DocumentPanelNodeReviewSettings } from './DocumentPanelNodeReviewSettings';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

function formatTimestampLabel(timestamp: string) {
  return timestamp.replace('T', ' ').slice(0, 16);
}

function NodeInfoSummary({
  activeNodeId,
  nodesById
}: Pick<WorkspaceLayoutProps, 'activeNodeId' | 'nodesById'>) {
  if (!activeNodeId) {
    return (
      <section className="rounded-lg border border-border bg-white/90 p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
        <h3 className="text-sm font-semibold text-foreground">Node info</h3>
        <p className="mt-2 text-sm text-foreground/70">Select a node to inspect its details.</p>
      </section>
    );
  }

  const node = nodesById[activeNodeId];
  if (!node) {
    return null;
  }

  const parentTitle = node.parentNodeId ? nodesById[node.parentNodeId]?.title ?? node.parentNodeId : 'Root';

  return (
    <section className="rounded-lg border border-border bg-white/90 p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">Node info</h3>
        <p className="text-xs text-foreground/70">Low-frequency details live here instead of taking over the document area.</p>
      </div>
      <dl className="mt-4 grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-foreground/60">Title</dt>
        <dd className="min-w-0 break-words text-foreground">{node.title}</dd>
        <dt className="text-foreground/60">Parent</dt>
        <dd className="min-w-0 break-words text-foreground">{parentTitle}</dd>
        <dt className="text-foreground/60">Node ID</dt>
        <dd className="min-w-0 break-all font-mono text-xs text-foreground/80">{node.id}</dd>
        <dt className="text-foreground/60">Updated</dt>
        <dd className="text-foreground">{formatTimestampLabel(node.updatedAt)}</dd>
      </dl>
    </section>
  );
}

export function WorkspaceRightSidebar(props: Pick<
  WorkspaceLayoutProps,
  | 'activeNodeId'
  | 'editorNodeId'
  | 'nodesById'
  | 'onNodeDesiredRetentionChange'
  | 'onNodePriorityChange'
  | 'reviewSchedulerSettings'
>) {
  return (
    <aside
      aria-label="Inspector"
      className="hidden min-h-0 flex-col gap-3 overflow-y-auto border-l border-border bg-bg-panel px-3 py-4 text-foreground xl:flex xl:[width:var(--workspace-right-sidebar-width,320px)]"
    >
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/40">Inspector</p>
          <h2 className="text-sm font-semibold text-foreground">Node details</h2>
        </div>
      </div>
      <NodeInfoSummary activeNodeId={props.activeNodeId} nodesById={props.nodesById} />
      <DocumentPanelNodeReviewSettings
        activeNodeId={props.activeNodeId}
        editableNodeId={props.editorNodeId}
        nodesById={props.nodesById}
        onDesiredRetentionChange={props.onNodeDesiredRetentionChange}
        onPriorityChange={props.onNodePriorityChange}
        reviewSchedulerSettings={props.reviewSchedulerSettings}
      />
    </aside>
  );
}
