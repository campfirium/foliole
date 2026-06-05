import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { loadRuntimeReadwiseBooksInventoryResult } from '../../shared/platform/readwiseBooksInventoryLoadResult';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksRuntimeRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { getImportCatalogSortOptions, parseImportCatalogSortKey, resolveImportLastOpened, sortImportCatalogItems, type ImportCatalogSortKey } from './importCatalogOrdering';
import { createImportInventoryErrorState, createImportInventoryUnavailableState, type ImportInventoryLoadIssue } from './ImportInventoryState';
import { matchesImportSearch } from './importManagementSearch';
import { useReadwiseBookActions } from './ImportSourceWorkspaceReadwiseBooksActions';
import { ReadwiseBooksCatalogPanel } from './ReadwiseBooksCatalogPanel';

function useReadwiseBooksInventoryState(enabled: boolean) {
  const [booksInventory, setBooksInventory] = useState<RuntimeReadwiseBooksInventory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadIssue, setLoadIssue] = useState<ImportInventoryLoadIssue | null>(null);
  const refreshBooksInventory = useCallback(async () => {
    setLoadIssue(null);
    setIsLoading(true);
    const result = await loadRuntimeReadwiseBooksInventoryResult();
    if (result.status === 'loaded') {
      setBooksInventory(result.inventory);
    } else {
      setBooksInventory(null);
      setLoadIssue(result.status === 'unavailable' ? { kind: 'unavailable' } : { kind: 'failed', message: result.message });
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refreshBooksInventory();
  }, [enabled, refreshBooksInventory]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handleFocus = () => {
      void refreshBooksInventory();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled, refreshBooksInventory]);

  return { booksInventory, isLoading, loadIssue, refreshBooksInventory };
}

type ReadwiseSortKey = ImportCatalogSortKey;

export function filterBooksInventory(query: string, booksInventory: RuntimeReadwiseBooksInventory | null) {
  if (!booksInventory) {
    return null;
  }

  return {
    ...booksInventory,
    books: booksInventory.books.filter((book) =>
      matchesImportSearch(query, [
        book.title,
        book.bookKey,
        book.importStatus,
        book.nodeStatus,
        book.annotationStatus
      ])
    )
  };
}

export function sortBooks(
  books: RuntimeReadwiseBooksInventory['books'],
  sortKey: ReadwiseSortKey,
  sortDirection: 'asc' | 'desc',
  input: {
    nodeViewById?: ReturnType<typeof useWorkspaceStore.getState>['nodeViewById'];
    scannedAt: string;
  }
) {
  return sortImportCatalogItems(
    books.map((book) => ({
      book,
      sortLastOpened: resolveImportLastOpened(book.generatedNodeId, input.nodeViewById ?? {}),
      sortSaved: input.scannedAt,
      sortTitle: book.title
    })),
    sortKey,
    sortDirection
  ).map((entry) => entry.book);
}

function formatCountLabel(filteredCount: number, totalCount: number) {
  return filteredCount === totalCount ? String(totalCount) : `${filteredCount} / ${totalCount}`;
}

function useReadwiseBookCatalogState(
  booksInventory: RuntimeReadwiseBooksInventory | null,
  nodeViewById: ReturnType<typeof useWorkspaceStore.getState>['nodeViewById']
) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<ReadwiseSortKey>('dateImported');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const filteredInventory = filterBooksInventory(query, booksInventory);
  const filteredBooks = useMemo(
    () => sortBooks(filteredInventory?.books ?? [], sortKey, sortDirection, { nodeViewById, scannedAt: booksInventory?.scannedAt ?? '' }),
    [booksInventory?.scannedAt, filteredInventory?.books, nodeViewById, sortDirection, sortKey]
  );

  return {
    countLabel: formatCountLabel(filteredBooks.length, booksInventory?.books.length ?? 0),
    filteredBooks,
    query,
    setQuery,
    setSortDirection,
    setSortKey,
    sortDirection,
    sortKey
  };
}

export function ImportSourceWorkspaceReadwiseBooksPage({
  open,
  onOpenChange,
  onSelectNode
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
}) {
  const t = useTranslation();
  const { booksInventory, isLoading, loadIssue, refreshBooksInventory } = useReadwiseBooksInventoryState(open);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const catalog = useReadwiseBookCatalogState(booksInventory, nodeViewById);
  const actions = useReadwiseBookActions({ onOpenChange, ...(onSelectNode ? { onSelectNode } : {}), refreshBooksInventory, t });

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <div className="flex min-h-0 w-full flex-1 flex-col gap-3">
        <ReadwiseBooksCatalogPanel
          books={catalog.filteredBooks}
          countLabel={catalog.countLabel}
          catalogAriaLabel={t('desktop.importOverview.books.aria')}
          {...(loadIssue?.kind === 'unavailable'
            ? {
                disabledState: createImportInventoryUnavailableState({
                  description: t('desktop.importCatalog.unavailable.description', { catalogName: t('desktop.importInventory.readwise.catalogName') }),
                  title: t('desktop.importCatalog.unavailable.title')
                })
              }
            : {})}
          {...(loadIssue?.kind === 'failed'
            ? {
                errorState: createImportInventoryErrorState({
                  issue: loadIssue,
                  onRetry: refreshBooksInventory,
                  title: t('desktop.importCatalog.error.title', { catalogName: t('desktop.importInventory.readwise.catalogName') })
                })
              }
            : {})}
          isLoading={isLoading}
          nodesById={nodesById}
          onChangeQuery={catalog.setQuery}
          onChangeSortDirection={catalog.setSortDirection}
          onChangeSortKey={(value) => catalog.setSortKey(parseImportCatalogSortKey(value) ?? catalog.sortKey)}
          onOpenBookNode={actions.handleOpenBookNode}
          onResetBookImport={actions.handleReimportBook}
          query={catalog.query}
          resettingNodeId={actions.resettingNodeId}
          scannedAt={(booksInventory?.scannedAt ?? '').replace('T', ' ').slice(0, 16)}
          sortDirection={catalog.sortDirection}
          sortKey={catalog.sortKey}
          sortOptions={getImportCatalogSortOptions(t)}
        />
        <p aria-live="polite" className="px-1 text-xs text-foreground/65">
          {actions.actionMessage}
        </p>
      </div>
    </div>
  );
}
