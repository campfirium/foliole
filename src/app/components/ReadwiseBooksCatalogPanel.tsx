import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksRuntimeRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { ImportCatalogLayout } from './ImportCatalogLayout';
import type { ImportCatalogSortOption } from './ImportCatalogSortControls';
import { ReadwiseBookInventoryItem } from './ImportInventoryListItems';
import type { ImportInventoryCatalogState } from './ImportInventoryState';

export function ReadwiseBooksCatalogPanel(props: {
  books: RuntimeReadwiseBooksInventory['books'];
  catalogAriaLabel: string;
  countLabel: string;
  disabledState?: ImportInventoryCatalogState;
  errorState?: ImportInventoryCatalogState & { onRetry: () => void };
  isLoading: boolean;
  nodesById: ReturnType<typeof useWorkspaceStore.getState>['nodesById'];
  onChangeQuery: (value: string) => void;
  onChangeSortDirection: (sortDirection: 'asc' | 'desc') => void;
  onChangeSortKey: (value: string) => void;
  onOpenBookNode: (nodeId: string) => void;
  onResetBookImport: (input: { nodeId: string; title: string }) => void;
  query: string;
  resettingNodeId: string | null;
  scannedAt: string;
  sortDirection: 'asc' | 'desc';
  sortKey: string;
  sortOptions: ImportCatalogSortOption[];
}) {
  const t = useTranslation();
  return (
    <ImportCatalogLayout
      catalogAriaLabel={props.catalogAriaLabel}
      countLabel={props.countLabel}
      {...definedProps({
        disabledState: props.disabledState
      })}
      emptyState={{ description: t('desktop.readwiseBooks.empty.description'), title: t('desktop.readwiseBooks.empty.title') }}
      {...definedProps({
        errorState: props.errorState
      })}
      hasItems={props.books.length > 0}
      isLoading={props.isLoading}
      onChangeQuery={props.onChangeQuery}
      onChangeSortDirection={props.onChangeSortDirection}
      onChangeSortKey={props.onChangeSortKey}
      query={props.query}
      searchLabel={t('desktop.readwiseBooks.search.label')}
      searchPlaceholder={t('desktop.readwiseBooks.search.placeholder')}
      sortDirection={props.sortDirection}
      sortKey={props.sortKey}
      sortOptions={props.sortOptions}
      title={t('desktop.readwiseBooks.title')}
    >
      {props.books.map((book) => (
        <ReadwiseBookInventoryItem
          book={book}
          key={book.bookKey}
          nodesById={props.nodesById}
          onOpenBookNode={props.onOpenBookNode}
          onResetBookImport={props.onResetBookImport}
          resettingNodeId={props.resettingNodeId}
          scannedAt={props.scannedAt}
        />
      ))}
    </ImportCatalogLayout>
  );
}
