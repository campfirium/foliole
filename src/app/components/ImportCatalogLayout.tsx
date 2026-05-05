import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

import { AppButton, AppEmptyState, AppErrorState, AppInput, AppLoadingState } from '../../shared/ui';

import { ImportCatalogSortControls, type ImportCatalogSortOption } from './ImportCatalogSortControls';

export function ImportCatalogHeader(props: {
  countLabel: string;
  onChangeQuery: (value: string) => void;
  onChangeSortDirection: (sortDirection: 'asc' | 'desc') => void;
  onChangeSortKey: (sortKey: string) => void;
  query: string;
  searchLabel: string;
  searchPlaceholder: string;
  sortDirection: 'asc' | 'desc';
  sortKey: string;
  sortOptions: ImportCatalogSortOption[];
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--workspace-region-main-document-content-divider)] pb-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="truncate text-base font-semibold text-foreground">{props.title}</h2>
        <p className="shrink-0 text-sm font-medium text-foreground/58">{props.countLabel}</p>
      </div>
      <div className="w-[248px] max-w-full max-[900px]:w-full max-[900px]:basis-full">
        <div className="flex h-9 w-full items-center gap-2 rounded-lg bg-bg-subtle px-3">
          <Search aria-hidden="true" className="shrink-0 text-foreground/38" size={14} strokeWidth={1.8} />
          <AppInput
            aria-label={props.searchLabel}
            className="h-8 w-full border-0 bg-transparent px-0 text-sm shadow-none placeholder:text-foreground/38 focus-visible:ring-0"
            onChange={(event) => props.onChangeQuery(event.target.value)}
            placeholder={props.searchPlaceholder}
            type="search"
            value={props.query}
          />
        </div>
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
  emptyState: { description: string; title: string };
  errorState?: { description: string; onRetry: () => void; title: string };
  hasItems: boolean;
  isLoading?: boolean;
  loadingState?: { description: string; title: string };
  onChangeQuery: (value: string) => void;
  onChangeSortDirection: (sortDirection: 'asc' | 'desc') => void;
  onChangeSortKey: (sortKey: string) => void;
  query: string;
  searchLabel: string;
  searchPlaceholder: string;
  sortDirection: 'asc' | 'desc';
  sortKey: string;
  sortOptions: ImportCatalogSortOption[];
  title: string;
}) {
  return (
    <section aria-label={`${props.title} catalog`} className="mx-auto flex w-full max-w-[var(--document-max-width)] flex-col">
      <ImportCatalogHeader
        countLabel={props.countLabel}
        onChangeQuery={props.onChangeQuery}
        onChangeSortDirection={props.onChangeSortDirection}
        onChangeSortKey={props.onChangeSortKey}
        query={props.query}
        searchLabel={props.searchLabel}
        searchPlaceholder={props.searchPlaceholder}
        sortDirection={props.sortDirection}
        sortKey={props.sortKey}
        sortOptions={props.sortOptions}
        title={props.title}
      />
      {props.isLoading && props.loadingState ? (
        <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-10">
          <AppLoadingState description={props.loadingState.description} title={props.loadingState.title} />
        </div>
      ) : props.errorState ? (
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
      ) : props.hasItems ? (
        <div className="flex flex-col divide-y divide-[var(--workspace-region-main-document-content-divider)] border-b border-[var(--workspace-region-main-document-content-divider)]">{props.children}</div>
      ) : (
        <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-10">
          <AppEmptyState description={props.emptyState.description} title={props.emptyState.title} />
        </div>
      )}
    </section>
  );
}
