import type { ReactNode } from 'react';

import { AppButton, AppEmptyState, AppErrorState, AppLoadingState } from '../../shared/ui';

import { FolderListSearchBox } from './FolderListViewLayout';
import { ImportCatalogSortControls, type ImportCatalogSortOption } from './ImportCatalogSortControls';

export function ImportCatalogHeader(props: {
  countLabel: string;
  onChangeQuery: (value: string) => void;
  onChangeSortDirection: (sortDirection: 'asc' | 'desc') => void;
  onChangeSortKey: (sortKey: string) => void;
  query: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchResultLabel: string | null;
  sortDirection: 'asc' | 'desc';
  sortKey: string;
  sortOptions: ImportCatalogSortOption[];
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--workspace-region-main-document-content-divider)] pb-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="truncate text-[13px] font-medium text-foreground">{props.title}</h2>
        <p className="shrink-0 text-sm font-medium text-foreground/58">{props.countLabel}</p>
      </div>
      <div className="w-[248px] max-w-full max-[900px]:w-full max-[900px]:basis-full">
        <FolderListSearchBox
          ariaLabel={props.searchLabel}
          onChangeSearchQuery={props.onChangeQuery}
          placeholder={props.searchPlaceholder}
          searchQuery={props.query}
          searchResultLabel={props.searchResultLabel ?? (props.query.trim() ? props.countLabel : null)}
        />
      </div>
      <div className="ml-auto shrink-0">
        <ImportCatalogSortControls
          onChangeSortDirection={props.onChangeSortDirection}
          onChangeSortKey={props.onChangeSortKey}
          options={props.sortOptions}
          sortDirection={props.sortDirection}
          sortKey={props.sortKey}
        />
      </div>
    </div>
  );
}

export function ImportCatalogLayout(props: {
  children: ReactNode;
  countLabel: string;
  disabledState?: { description: string; title: string };
  emptyState: { description: string; title: string };
  errorState?: { description: string; onRetry: () => void; title: string };
  hasItems: boolean;
  isLoading?: boolean;
  onChangeQuery: (value: string) => void;
  onChangeSortDirection: (sortDirection: 'asc' | 'desc') => void;
  onChangeSortKey: (sortKey: string) => void;
  query: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchResultLabel?: string | null;
  sortDirection: 'asc' | 'desc';
  sortKey: string;
  sortOptions: ImportCatalogSortOption[];
  title: string;
}) {
  const body = renderImportCatalogBody(props);

  return (
    <section aria-label={`${props.title} catalog`} className="mx-auto flex min-h-0 w-full max-w-[var(--document-max-width)] flex-1 flex-col">
      <ImportCatalogHeader
        countLabel={props.countLabel}
        onChangeQuery={props.onChangeQuery}
        onChangeSortDirection={props.onChangeSortDirection}
        onChangeSortKey={props.onChangeSortKey}
        query={props.query}
        searchLabel={props.searchLabel}
        searchPlaceholder={props.searchPlaceholder}
        searchResultLabel={props.searchResultLabel ?? null}
        sortDirection={props.sortDirection}
        sortKey={props.sortKey}
        sortOptions={props.sortOptions}
        title={props.title}
      />
      {body}
    </section>
  );
}

function renderImportCatalogBody(props: Parameters<typeof ImportCatalogLayout>[0]) {
  if (props.isLoading) {
    return (
      <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-10">
        <AppLoadingState />
      </div>
    );
  }
  if (props.errorState) {
    return (
      <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-10">
        <AppErrorState
          action={
            <AppButton onClick={props.errorState.onRetry} variant="primary">
              Retry
            </AppButton>
          }
          description={props.errorState.description}
          title={props.errorState.title}
        />
      </div>
    );
  }
  if (props.disabledState) {
    return (
      <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-10">
        <AppEmptyState description={props.disabledState.description} title={props.disabledState.title} />
      </div>
    );
  }
  if (props.hasItems) {
    return <ul className="flex flex-col divide-y divide-[var(--workspace-region-main-document-content-divider)] border-b border-[var(--workspace-region-main-document-content-divider)]">{props.children}</ul>;
  }
  return (
    <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-10">
      <AppEmptyState description={props.emptyState.description} title={props.emptyState.title} />
    </div>
  );
}
