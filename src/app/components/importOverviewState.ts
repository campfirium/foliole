import { useCallback, useEffect, useMemo, useState } from 'react';

import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { loadRuntimePdfImportsInventoryResult } from '../../shared/platform/pdfImportsInventoryLoadResult';
import type { RuntimePdfImportsInventory } from '../../shared/platform/pdfImportsRuntimeRepository';
import { loadRuntimeReadwiseBooksInventoryResult } from '../../shared/platform/readwiseBooksInventoryLoadResult';
import {
  resetRuntimeReadwiseBookImport,
  type RuntimeReadwiseBooksInventory
} from '../../shared/platform/readwiseBooksRuntimeRepository';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useFormalImport } from '../hooks/useFormalImport';

import type { ImportCatalogSortKey } from './importCatalogOrdering';
import type { ImportInventoryLoadIssue } from './ImportInventoryState';
import { matchesImportSearch } from './importManagementSearch';
import { useOverviewSorting } from './importOverviewSorting';
import { applyResetReadwiseBookImportToWorkspace, selectReadwiseBookNode } from './importSourceWorkspaceReadwiseBooks';

export type OverviewSortKey = ImportCatalogSortKey;

function useOverviewInventories(enabled: boolean) {
  const [booksInventory, setBooksInventory] = useState<RuntimeReadwiseBooksInventory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadIssue, setLoadIssue] = useState<ImportInventoryLoadIssue | null>(null);
  const [pdfInventory, setPdfInventory] = useState<RuntimePdfImportsInventory | null>(null);
  const refresh = useCallback(async () => {
    setLoadIssue(null);
    setIsLoading(true);
    const [books, pdf] = await Promise.all([loadRuntimeReadwiseBooksInventoryResult(), loadRuntimePdfImportsInventoryResult()]);
    setBooksInventory(books.status === 'loaded' ? books.inventory : null);
    setPdfInventory(pdf.status === 'loaded' ? pdf.inventory : null);
    const failedMessages = [books, pdf].filter((result) => result.status === 'failed').map((result) => result.message);
    if (failedMessages.length > 0) {
      setLoadIssue({ kind: 'failed', message: failedMessages.join(' ') });
    } else if (books.status === 'unavailable' && pdf.status === 'unavailable') {
      setLoadIssue({ kind: 'unavailable' });
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handleFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [enabled, refresh]);

  return { booksInventory, isLoading, loadIssue, pdfInventory, refresh };
}

type ImportOverviewTranslate = ReturnType<typeof useTranslation>;

async function runReadwiseBookReset(input: { nodeId: string; t: ImportOverviewTranslate; title: string }) {
  const result = await resetRuntimeReadwiseBookImport(input.nodeId);
  if (result?.status === 'blocked_secondary') {
    throw new Error(input.t('desktop.importInventory.readwise.primaryDeviceOnly'));
  }
  if (!result || result.status !== 'reset' || !result.node_id || result.content === null || !result.updated_at) {
    throw new Error(input.t('desktop.importInventory.readwise.importFailed', { title: input.title }));
  }

  applyResetReadwiseBookImportToWorkspace({
    content: result.content,
    node_id: result.node_id,
    removed_node_ids: result.removed_node_ids,
    title: result.title ?? input.title,
    updated_at: result.updated_at
  });
  await refreshWorkspaceState('import-overview-reset');
  return result.node_id;
}

function useOverviewFilters(input: {
  booksInventory: RuntimeReadwiseBooksInventory | null;
  nodesById: Record<string, { title: string }>;
  pdfInventory: RuntimePdfImportsInventory | null;
  query: string;
  recentRuns: ReturnType<typeof useFormalImport>['overview']['recentRuns'];
}) {
  const filteredInboxRuns = useMemo(
    () =>
      input.recentRuns.filter((entry) =>
        matchesImportSearch(input.query, [
          entry.sourceKind,
          entry.sourceLocator,
          entry.sourceName,
          entry.resultStatus,
          entry.failureReason,
          entry.nodeId ? input.nodesById[entry.nodeId]?.title : null
        ])
      ),
    [input.nodesById, input.query, input.recentRuns]
  );
  const filteredBooks = useMemo(
    () =>
      (input.booksInventory?.books ?? []).filter((book) =>
        matchesImportSearch(input.query, [book.title, book.bookKey, book.importStatus, book.nodeStatus, book.annotationStatus])
      ),
    [input.booksInventory?.books, input.query]
  );
  const filteredPdfItems = useMemo(
    () =>
      (input.pdfInventory?.items ?? []).filter((item) =>
        matchesImportSearch(input.query, [item.sourceName, item.sourceLocator, item.nodeStatus, item.pdfIndexStatus])
      ),
    [input.pdfInventory?.items, input.query]
  );

  return { filteredBooks, filteredInboxRuns, filteredPdfItems };
}

function useReadwiseBookActions(input: {
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
  refresh: () => Promise<void>;
  t: ImportOverviewTranslate;
}) {
  const [resettingNodeId, setResettingNodeId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');

  const handleOpenBookNode = useCallback(
    (nodeId: string) => {
      selectReadwiseBookNode(nodeId, input.onSelectNode);
      input.onOpenChange(false);
    },
    [input.onOpenChange, input.onSelectNode]
  );
  const handleReimportBook = useCallback(
    async (book: { nodeId: string; title: string }) => {
      setResettingNodeId(book.nodeId);
      try {
        const nodeId = await runReadwiseBookReset({ ...book, t: input.t });
        setActionMessage('');
        handleOpenBookNode(nodeId);
      } catch {
        setActionMessage(input.t('desktop.importInventory.readwise.importFailed', { title: book.title }));
      } finally {
        setResettingNodeId(null);
        await input.refresh();
      }
    },
    [handleOpenBookNode, input]
  );

  return { actionMessage, handleOpenBookNode, handleReimportBook, resettingNodeId };
}

export function useImportOverviewState(input: {
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
  open: boolean;
}) {
  const t = useTranslation();
  const formalImport = useFormalImport();
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const { booksInventory, isLoading, loadIssue, pdfInventory, refresh } = useOverviewInventories(input.open);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<OverviewSortKey>('dateImported');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const filters = useOverviewFilters({
    booksInventory,
    nodesById,
    pdfInventory,
    query,
    recentRuns: formalImport.overview.recentRuns
  });
  const sorting = useOverviewSorting({
    booksInventory,
    filteredBooks: filters.filteredBooks,
    filteredInboxRuns: filters.filteredInboxRuns,
    filteredPdfItems: filters.filteredPdfItems,
    nodeViewById,
    nodesById,
    sortDirection,
    sortKey
  });
  const actions = useReadwiseBookActions({
    onOpenChange: input.onOpenChange,
    refresh,
    t,
    ...definedProps({ onSelectNode: input.onSelectNode })
  });

  return {
    actionMessage: actions.actionMessage,
    booksInventory,
    handleOpenBookNode: actions.handleOpenBookNode,
    handleReimportBook: actions.handleReimportBook,
    isLoading,
    loadIssue,
    nodesById,
    query,
    resettingNodeId: actions.resettingNodeId,
    refresh,
    setQuery,
    setSortDirection,
    setSortKey,
    sortDirection,
    sortKey,
    sortedBooks: sorting.sortedBooks,
    sortedInboxNodes: sorting.sortedInboxNodes,
    sortedInboxRuns: sorting.sortedInboxRuns,
    sortedPdfItems: sorting.sortedPdfItems,
    totalVisibleCount: sorting.totalVisibleCount
  };
}
