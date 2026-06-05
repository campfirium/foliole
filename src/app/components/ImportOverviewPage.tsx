import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppEmptyState, AppErrorState, AppLoadingState } from '../../shared/ui';

import { ImportCatalogHeader } from './ImportCatalogLayout';
import { getImportCatalogSortOptions } from './importCatalogOrdering';
import { createImportInventoryErrorState, createImportInventoryUnavailableState } from './ImportInventoryState';
import { ImportOverviewContent } from './ImportOverviewContent';
import { useImportOverviewState } from './importOverviewState';

function ImportOverviewBody(props: {
  onOpenNode: (nodeId: string) => void;
  state: ReturnType<typeof useImportOverviewState>;
}) {
  const t = useTranslation();

  if (props.state.isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center px-6 py-10">
        <AppLoadingState />
      </div>
    );
  }
  if (props.state.loadIssue?.kind === 'failed') {
    return <ImportOverviewErrorState state={props.state} />;
  }
  if (props.state.loadIssue?.kind === 'unavailable') {
    return <ImportOverviewUnavailableState />;
  }
  if (props.state.totalVisibleCount === 0) {
    return (
      <div className="flex min-h-[240px] items-center justify-center px-6 py-10">
        <AppEmptyState description={t('desktop.importOverview.empty.description')} title={t('desktop.importOverview.empty.title')} />
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

function ImportOverviewErrorState(props: { state: ReturnType<typeof useImportOverviewState> }) {
  const t = useTranslation();

  if (props.state.loadIssue?.kind !== 'failed') {
    return null;
  }
  const errorState = createImportInventoryErrorState({
    issue: props.state.loadIssue,
    onRetry: props.state.refresh,
    title: t('desktop.importCatalog.error.title', { catalogName: t('desktop.importOverview.catalogName') })
  });
  return (
    <div className="flex min-h-[240px] items-center justify-center px-6 py-10">
      <AppErrorState
        action={
          <AppButton onClick={props.state.refresh} variant="primary">
            {t('desktop.importOverview.retry')}
          </AppButton>
        }
        description={errorState.description}
        title={errorState.title}
      />
    </div>
  );
}

function ImportOverviewUnavailableState() {
  const t = useTranslation();
  const disabledState = createImportInventoryUnavailableState({
    description: t('desktop.importCatalog.unavailable.description', { catalogName: t('desktop.importOverview.catalogName') }),
    title: t('desktop.importCatalog.unavailable.title')
  });
  return (
    <div className="flex min-h-[240px] items-center justify-center px-6 py-10">
      <AppEmptyState description={disabledState.description} title={disabledState.title} />
    </div>
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
  const t = useTranslation();
  const state = useImportOverviewState({ onOpenChange, ...(onSelectNode ? { onSelectNode } : {}), open });

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <section aria-label={t('desktop.importOverview.catalog')} className="mx-auto flex w-full max-w-[var(--document-max-width)] flex-col">
        <ImportCatalogHeader
          countLabel={String(state.totalVisibleCount)}
          onChangeQuery={state.setQuery}
          onChangeSortDirection={state.setSortDirection}
          onChangeSortKey={(value) => state.setSortKey(value as typeof state.sortKey)}
          query={state.query}
          searchResultLabel={state.query.trim() ? String(state.totalVisibleCount) : null}
          searchLabel={t('desktop.importOverview.search')}
          searchPlaceholder={t('desktop.importOverview.search')}
          sortDirection={state.sortDirection}
          sortKey={state.sortKey}
          sortOptions={getImportCatalogSortOptions(t)}
          title={t('desktop.importOverview.title')}
        />
        <ImportOverviewBody onOpenNode={onSelectNode ?? (() => undefined)} state={state} />
        <p aria-live="polite" className="px-1 pt-3 text-xs text-foreground/65">
          {state.actionMessage}
        </p>
      </section>
    </div>
  );
}
