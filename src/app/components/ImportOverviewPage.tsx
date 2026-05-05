import { AppEmptyState } from '../../shared/ui';

import { ImportCatalogHeader } from './ImportCatalogLayout';
import { ImportOverviewContent } from './ImportOverviewContent';
import { overviewSortOptions, useImportOverviewState } from './importOverviewState';

export function ImportOverviewPage({
  open,
  onOpenChange,
  onSelectNode
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
}) {
  const state = useImportOverviewState({ onOpenChange, onSelectNode, open });

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <section aria-label="Imports catalog" className="mx-auto flex w-full max-w-[var(--document-max-width)] flex-col">
        <ImportCatalogHeader
          countLabel={String(state.totalVisibleCount)}
          onChangeQuery={state.setQuery}
          onChangeSortDirection={state.setSortDirection}
          onChangeSortKey={(value) => state.setSortKey(value as typeof state.sortKey)}
          query={state.query}
          searchLabel="Search all imports"
          searchPlaceholder="Search in imports"
          sortDirection={state.sortDirection}
          sortKey={state.sortKey}
          sortOptions={overviewSortOptions}
          title="Imports"
        />
        {state.totalVisibleCount === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center px-6 py-10">
            <AppEmptyState description="No imported Inbox topics or recent runs yet." title="Imports are empty" />
          </div>
        ) : (
          <ImportOverviewContent
            booksInventory={state.booksInventory}
            handleOpenBookNode={state.handleOpenBookNode}
            handleReimportBook={state.handleReimportBook}
            nodesById={state.nodesById}
            onOpenNode={onSelectNode ?? (() => undefined)}
            resettingNodeId={state.resettingNodeId}
            sortedBooks={state.sortedBooks}
            sortedInboxNodes={state.sortedInboxNodes}
            sortedInboxRuns={state.sortedInboxRuns}
            sortedPdfItems={state.sortedPdfItems}
          />
        )}
        <p aria-live="polite" className="px-1 pt-3 text-xs text-foreground/65">
          {state.actionMessage}
        </p>
      </section>
    </div>
  );
}
