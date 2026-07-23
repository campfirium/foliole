import { useMemo } from 'react';

import type { NodeOpenState } from '../../../lib/core/database/nodeOpenState';
import type { RuntimePdfImportsInventory } from '../../shared/platform/pdfImportsRuntimeRepository';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksRuntimeRepository';
import { useFormalImport } from '../hooks/useFormalImport';

import { resolveImportLastOpened, sortImportCatalogItems, type ImportCatalogSortKey } from './importCatalogOrdering';
import { collectRecentInboxEntries } from './ImportOverviewSections';

export const sortOverviewItems = sortImportCatalogItems;

function useSortedInboxItems(input: {
  filteredInboxRuns: ReturnType<typeof useFormalImport>['overview']['recentRuns'];
  nodeOpenStateById: Record<string, NodeOpenState | undefined>;
  nodesById: Record<string, { title: string }>;
  sortDirection: 'asc' | 'desc';
  sortKey: ImportCatalogSortKey;
}) {
  const sortedInboxNodes = useMemo(
    () =>
      sortImportCatalogItems(
        collectRecentInboxEntries(input.filteredInboxRuns).map((entry) => ({
          entry,
          sortLastOpened: resolveImportLastOpened(entry.nodeId, input.nodeOpenStateById),
          sortSaved: entry.importedAt,
          sortTitle: input.nodesById[entry.nodeId!]?.title ?? entry.sourceName
        })),
        input.sortKey,
        input.sortDirection
      ),
    [input.filteredInboxRuns, input.nodeOpenStateById, input.nodesById, input.sortDirection, input.sortKey]
  );
  const sortedInboxRuns = useMemo(
    () =>
      sortImportCatalogItems(
        input.filteredInboxRuns.map((entry) => ({
          entry,
          sortLastOpened: resolveImportLastOpened(entry.nodeId, input.nodeOpenStateById),
          sortSaved: entry.importedAt,
          sortTitle: entry.nodeId ? input.nodesById[entry.nodeId]?.title ?? entry.sourceName : entry.sourceName
        })),
        input.sortKey,
        input.sortDirection
      ),
    [input.filteredInboxRuns, input.nodeOpenStateById, input.nodesById, input.sortDirection, input.sortKey]
  );
  return { sortedInboxNodes, sortedInboxRuns };
}

function useSortedLibraryItems(input: {
  booksInventory: RuntimeReadwiseBooksInventory | null;
  filteredBooks: RuntimeReadwiseBooksInventory['books'];
  filteredPdfItems: RuntimePdfImportsInventory['items'];
  nodeOpenStateById: Record<string, NodeOpenState | undefined>;
  sortDirection: 'asc' | 'desc';
  sortKey: ImportCatalogSortKey;
}) {
  const sortedBooks = useMemo(
    () =>
      sortImportCatalogItems(
        input.filteredBooks.map((book) => ({
          book,
          sortLastOpened: resolveImportLastOpened(book.generatedNodeId, input.nodeOpenStateById),
          sortSaved: input.booksInventory?.scannedAt ?? '',
          sortTitle: book.title
        })),
        input.sortKey,
        input.sortDirection
      ),
    [input.booksInventory?.scannedAt, input.filteredBooks, input.nodeOpenStateById, input.sortDirection, input.sortKey]
  );
  const sortedPdfItems = useMemo(
    () =>
      sortImportCatalogItems(
        input.filteredPdfItems.map((item) => ({
          item,
          sortLastOpened: resolveImportLastOpened(item.latestNodeId, input.nodeOpenStateById),
          sortSaved: item.lastImportedAt,
          sortTitle: item.sourceName
        })),
        input.sortKey,
        input.sortDirection
      ),
    [input.filteredPdfItems, input.nodeOpenStateById, input.sortDirection, input.sortKey]
  );

  return { sortedBooks, sortedPdfItems };
}

export function useOverviewSorting(input: {
  booksInventory: RuntimeReadwiseBooksInventory | null;
  filteredBooks: RuntimeReadwiseBooksInventory['books'];
  filteredInboxRuns: ReturnType<typeof useFormalImport>['overview']['recentRuns'];
  filteredPdfItems: RuntimePdfImportsInventory['items'];
  nodeOpenStateById: Record<string, NodeOpenState | undefined>;
  nodesById: Record<string, { title: string }>;
  sortDirection: 'asc' | 'desc';
  sortKey: ImportCatalogSortKey;
}) {
  const inboxItems = useSortedInboxItems({
    filteredInboxRuns: input.filteredInboxRuns,
    nodeOpenStateById: input.nodeOpenStateById,
    nodesById: input.nodesById,
    sortDirection: input.sortDirection,
    sortKey: input.sortKey
  });
  const libraryItems = useSortedLibraryItems({
    booksInventory: input.booksInventory,
    filteredBooks: input.filteredBooks,
    filteredPdfItems: input.filteredPdfItems,
    nodeOpenStateById: input.nodeOpenStateById,
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
