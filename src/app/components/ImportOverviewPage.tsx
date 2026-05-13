import { AppButton, AppEmptyState, AppErrorState, AppLoadingState } from '../../shared/ui';

import { ImportCatalogHeader } from './ImportCatalogLayout';
import { ImportOverviewContent } from './ImportOverviewContent';
import { overviewSortOptions, useImportOverviewState } from './importOverviewState';

function ImportOverviewBody(props: {
  onOpenNode: (nodeId: string) => void;
  state: ReturnType<typeof useImportOverviewState>;
}) {
  if (props.state.isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center px-6 py-10">
        <AppLoadingState description="Checking watched sources and recent import runs." title="Loading recent imports" />
      </div>
    );
  }
  if (props.state.errorMessage) {
    return (
      <div className="flex min-h-[240px] items-center justify-center px-6 py-10">
        <AppErrorState
          action={
            <AppButton onClick={props.state.refresh} variant="primary">
              Retry
            </AppButton>
          }
          description="Try again to load recent imports, Readwise Books, and PDF imports."
          title={props.state.errorMessage}
        />
      </div>
    );
  }
  if (props.state.totalVisibleCount === 0) {
    return (
      <div className="flex min-h-[240px] items-center justify-center px-6 py-10">
        <AppEmptyState description="No recent import runs yet." title="Recent imports are empty" />
      </div>
    );
  }
  return (
    <ImportOverviewContent
      booksInventory={props.state.booksInventory}
      handleOpenBookNode={props.state.handleOpenBookNode}
      handleReimportBook={props.state.handleReimportBook}
      nodesById={props.state.nodesById}
      onOpenNode={props.onOpenNode}
      resettingNodeId={props.state.resettingNodeId}
      sortedBooks={props.state.sortedBooks}
      sortedInboxNodes={props.state.sortedInboxNodes}
      sortedInboxRuns={props.state.sortedInboxRuns}
      sortedPdfItems={props.state.sortedPdfItems}
    />
  );
}

export function ImportOverviewPage({
  open,
  onOpenChange,
  onSelectNode
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
}) {
  const state = useImportOverviewState({ onOpenChange, ...(onSelectNode ? { onSelectNode } : {}), open });

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <section aria-label="Recent Imports catalog" className="mx-auto flex w-full max-w-[var(--document-max-width)] flex-col">
        <ImportCatalogHeader
          countLabel={String(state.totalVisibleCount)}
          onChangeQuery={state.setQuery}
          onChangeSortDirection={state.setSortDirection}
          onChangeSortKey={(value) => state.setSortKey(value as typeof state.sortKey)}
          query={state.query}
          searchResultLabel={state.query.trim() ? String(state.totalVisibleCount) : null}
          searchLabel="Search recent imports"
          searchPlaceholder="Search recent imports"
          sortDirection={state.sortDirection}
          sortKey={state.sortKey}
          sortOptions={overviewSortOptions}
          title="Recent Imports"
        />
        <ImportOverviewBody onOpenNode={onSelectNode ?? (() => undefined)} state={state} />
        <p aria-live="polite" className="px-1 pt-3 text-xs text-foreground/65">
          {state.actionMessage}
        </p>
      </section>
    </div>
  );
}
