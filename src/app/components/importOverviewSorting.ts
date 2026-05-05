import { useMemo } from 'react';

import type { RuntimePdfImportsInventory } from '../../shared/platform/pdfImportsBridge';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksBridge';
import type { NodeViewState } from '../../store/workspaceStore';
import { useFormalImport } from '../hooks/useFormalImport';

import { resolveImportLastOpened, sortImportCatalogItems, type ImportCatalogSortKey } from './importCatalogOrdering';
import { collectRecentInboxEntries } from './ImportOverviewSections';

export const sortOverviewItems = sortImportCatalogItems;

function useSortedInboxItems(input: {
  filteredInboxRuns: ReturnType<typeof useFormalImport>['overview']['recentRuns'];
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodesById: Record<string, { title: string }>;
  sortDirection: 'asc' | 'desc';
  sortKey: ImportCatalogSortKey;
}) {
  const sortedInboxNodes = useMemo(
    () =>
      sortImportCatalogItems(
        collectRecentInboxEntries(input.filteredInboxRuns).map((entry) => ({
          entry,
          sortImported: entry.importedAt,
          sortLastOpened: resolveImportLastOpened(entry.nodeId, input.nodeViewById),
          sortTitle: input.nodesById[entry.nodeId!]?.title ?? entry.sourceName
        })),
        input.sortKey,
        input.sortDirection
      ),
    [input.filteredInboxRuns, input.nodeViewById, input.nodesById, input.sortDirection, input.sortKey]
  );
  const sortedInboxRuns = useMemo(
    () =>
      sortImportCatalogItems(
        input.filteredInboxRuns.map((entry) => ({
          entry,
          sortImported: entry.importedAt,
          sortLastOpened: resolveImportLastOpened(entry.nodeId, input.nodeViewById),
          sortTitle: entry.nodeId ? input.nodesById[entry.nodeId]?.title ?? entry.sourceName : entry.sourceName
        })),
        input.sortKey,
        input.sortDirection
      ),
    [input.filteredInboxRuns, input.nodeViewById, input.nodesById, input.sortDirection, input.sortKey]
  );
  return { sortedInboxNodes, sortedInboxRuns };
}

function useSortedLibraryItems(input: {
  booksInventory: RuntimeReadwiseBooksInventory | null;
  filteredBooks: RuntimeReadwiseBooksInventory['books'];
  filteredPdfItems: RuntimePdfImportsInventory['items'];
  nodeViewById: Record<string, NodeViewState | undefined>;
  sortDirection: 'asc' | 'desc';
  sortKey: ImportCatalogSortKey;
}) {
  const sortedBooks = useMemo(
    () =>
      sortImportCatalogItems(
        input.filteredBooks.map((book) => ({
          book,
          sortImported: input.booksInventory?.scannedAt ?? '',
          sortLastOpened: resolveImportLastOpened(book.generatedNodeId, input.nodeViewById),
          sortTitle: book.title
        })),
        input.sortKey,
        input.sortDirection
      ),
    [input.booksInventory?.scannedAt, input.filteredBooks, input.nodeViewById, input.sortDirection, input.sortKey]
  );
  const sortedPdfItems = useMemo(
    () =>
      sortImportCatalogItems(
        input.filteredPdfItems.map((item) => ({
          item,
          sortImported: item.lastImportedAt,
          sortLastOpened: resolveImportLastOpened(item.latestNodeId, input.nodeViewById),
          sortTitle: item.sourceName
        })),
        input.sortKey,
        input.sortDirection
      ),
    [input.filteredPdfItems, input.nodeViewById, input.sortDirection, input.sortKey]
  );

  return { sortedBooks, sortedPdfItems };
}

export function useOverviewSorting(input: {
  booksInventory: RuntimeReadwiseBooksInventory | null;
  filteredBooks: RuntimeReadwiseBooksInventory['books'];
  filteredInboxRuns: ReturnType<typeof useFormalImport>['overview']['recentRuns'];
  filteredPdfItems: RuntimePdfImportsInventory['items'];
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodesById: Record<string, { title: string }>;
  sortDirection: 'asc' | 'desc';
  sortKey: ImportCatalogSortKey;
}) {
  const inboxItems = useSortedInboxItems({
    filteredInboxRuns: input.filteredInboxRuns,
    nodeViewById: input.nodeViewById,
    nodesById: input.nodesById,
    sortDirection: input.sortDirection,
    sortKey: input.sortKey
  });
  const libraryItems = useSortedLibraryItems({
    booksInventory: input.booksInventory,
    filteredBooks: input.filteredBooks,
    filteredPdfItems: input.filteredPdfItems,
    nodeViewById: input.nodeViewById,
    sortDirection: input.sortDirection,
    sortKey: input.sortKey
  });

  return {
    sortedBooks: libraryItems.sortedBooks,
    sortedInboxNodes: inboxItems.sortedInboxNodes,
    sortedInboxRuns: inboxItems.sortedInboxRuns,
    sortedPdfItems: libraryItems.sortedPdfItems,
    totalVisibleCount:
      inboxItems.sortedInboxNodes.length +
      inboxItems.sortedInboxRuns.length +
      libraryItems.sortedBooks.length +
      libraryItems.sortedPdfItems.length
  };
}
