import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  loadRuntimeReadwiseBooksInventory,
  resetRuntimeReadwiseBookImport,
  type RuntimeReadwiseBooksInventory
} from '../../shared/platform/readwiseBooksRuntimeRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { IMPORT_CATALOG_SORT_OPTIONS, resolveImportLastOpened, sortImportCatalogItems, type ImportCatalogSortKey } from './importCatalogOrdering';
import { matchesImportSearch } from './importManagementSearch';
import { applyResetReadwiseBookImportToWorkspace, selectReadwiseBookNode } from './importSourceWorkspaceReadwiseBooks';
import { ReadwiseBooksCatalogPanel } from './ReadwiseBooksCatalogPanel';

function useReadwiseBooksInventoryState(enabled: boolean) {
  const [booksInventory, setBooksInventory] = useState<RuntimeReadwiseBooksInventory | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const refreshBooksInventory = useCallback(async () => {
    setErrorMessage('');
    setIsLoading(true);
    try {
      setBooksInventory(await loadRuntimeReadwiseBooksInventory());
    } catch {
      setErrorMessage('Readwise Books could not be loaded.');
    } finally {
      setIsLoading(false);
    }
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

  return { booksInventory, errorMessage, isLoading, refreshBooksInventory };
}

async function runReadwiseBookReset(input: { nodeId: string; title: string }) {
  const result = await resetRuntimeReadwiseBookImport(input.nodeId);
  if (result?.status === 'blocked_secondary') {
    throw new Error('Readwise actions run on the current primary device.');
  }
  if (!result || result.status !== 'reset' || !result.node_id || result.content === null || !result.updated_at) {
    throw new Error(`Could not import ${input.title}.`);
  }

  applyResetReadwiseBookImportToWorkspace({
    content: result.content,
    node_id: result.node_id,
    removed_node_ids: result.removed_node_ids,
    title: result.title ?? input.title,
    updated_at: result.updated_at
  });
  await useWorkspaceStore.persist.rehydrate();
  return result.node_id;
}

export const readwiseSortOptions = IMPORT_CATALOG_SORT_OPTIONS;
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

function useReadwiseBookActions(props: {
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
  refreshBooksInventory: () => Promise<void>;
}) {
  const [resettingNodeId, setResettingNodeId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const handleOpenBookNode = useCallback(
    (nodeId: string) => {
      selectReadwiseBookNode(nodeId, props.onSelectNode);
      props.onOpenChange(false);
    },
    [props.onOpenChange, props.onSelectNode]
  );
  const handleReimportBook = useCallback(
    async (input: { nodeId: string; title: string }) => {
      setResettingNodeId(input.nodeId);
      try {
        const nodeId = await runReadwiseBookReset(input);
        setActionMessage('');
        handleOpenBookNode(nodeId);
      } catch {
        setActionMessage(`Could not import ${input.title}.`);
      } finally {
        setResettingNodeId(null);
        await props.refreshBooksInventory();
      }
    },
    [handleOpenBookNode, props.refreshBooksInventory]
  );

  return { actionMessage, handleOpenBookNode, handleReimportBook, resettingNodeId };
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
  const { booksInventory, errorMessage, isLoading, refreshBooksInventory } = useReadwiseBooksInventoryState(open);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const catalog = useReadwiseBookCatalogState(booksInventory, nodeViewById);
  const actions = useReadwiseBookActions({ onOpenChange, onSelectNode, refreshBooksInventory });

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <div className="flex min-h-0 w-full flex-1 flex-col gap-3">
        <ReadwiseBooksCatalogPanel
          books={catalog.filteredBooks}
          countLabel={catalog.countLabel}
          errorMessage={errorMessage}
          isLoading={isLoading}
          nodesById={nodesById}
          onChangeQuery={catalog.setQuery}
          onChangeSortDirection={catalog.setSortDirection}
          onChangeSortKey={(value) => catalog.setSortKey(value as ReadwiseSortKey)}
          onOpenBookNode={actions.handleOpenBookNode}
          onRetry={refreshBooksInventory}
          onResetBookImport={actions.handleReimportBook}
          query={catalog.query}
          resettingNodeId={actions.resettingNodeId}
          scannedAt={(booksInventory?.scannedAt ?? '').replace('T', ' ').slice(0, 16)}
          sortDirection={catalog.sortDirection}
          sortKey={catalog.sortKey}
          sortOptions={[...readwiseSortOptions]}
        />
        <p aria-live="polite" className="px-1 text-xs text-foreground/65">
          {actions.actionMessage}
        </p>
      </div>
    </div>
  );
}
