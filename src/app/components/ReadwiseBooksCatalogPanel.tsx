import { definedProps } from '../../shared/lib/definedProps';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksRuntimeRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { ImportCatalogLayout } from './ImportCatalogLayout';
import type { ImportCatalogSortOption } from './ImportCatalogSortControls';
import { ReadwiseBookInventoryItem } from './ImportInventoryListItems';
import type { ImportInventoryCatalogState } from './ImportInventoryState';

export function ReadwiseBooksCatalogPanel(props: {
  books: RuntimeReadwiseBooksInventory['books'];
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
  return (
    <ImportCatalogLayout
      countLabel={props.countLabel}
      {...definedProps({
        disabledState: props.disabledState
      })}
      emptyState={{ description: 'No books discovered yet.', title: 'Readwise Books is empty' }}
      {...definedProps({
        errorState: props.errorState
      })}
      hasItems={props.books.length > 0}
      isLoading={props.isLoading}
      onChangeQuery={props.onChangeQuery}
      onChangeSortDirection={props.onChangeSortDirection}
      onChangeSortKey={props.onChangeSortKey}
      query={props.query}
      searchLabel="Search imported books"
      searchPlaceholder="Search in this folder"
      sortDirection={props.sortDirection}
      sortKey={props.sortKey}
      sortOptions={props.sortOptions}
      title="Readwise Books"
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
