import { NodeListHeader } from '../../features/nodes/components/NodeListHeader';
import { AppEmptyState } from '../../shared/ui';

export function WorkspaceListLoadingState() {
  return (
    <aside
      aria-busy="true"
      aria-label="Loading workspace list"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-panel text-foreground"
    >
      <NodeListHeader
        hasCollapsibleNodes={false}
        hasCollapsedNodes={false}
        isTrashViewOpen={false}
        isVirtualViewOpen={false}
        onCreateCommand={() => undefined}
        onEmptyTrash={() => undefined}
        onOpenNotesView={() => undefined}
        onSearchQueryChange={() => undefined}
        onToggleCollapseAll={() => undefined}
        searchQuery=""
        trashCount={0}
      />
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            aria-label="Loading workspace list indicator"
            className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground/55"
          />
          <p className="m-0 text-sm text-foreground/65">Loading workspace</p>
        </div>
      </div>
    </aside>
  );
}

export function WorkspaceListEmptyState() {
  return (
    <aside aria-label="Node list panel" className="flex min-h-0 flex-1 flex-col bg-bg-panel text-foreground">
      <div className="flex min-h-[40px] items-center justify-end gap-2 px-3">
        <div className="h-8 w-8 rounded-sm bg-foreground/[0.05]" />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        <AppEmptyState
          description="Create your first document or folder from the list toolbar to start building the workspace."
          title="Nothing here yet"
        />
      </div>
    </aside>
  );
}
