import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadRuntimePdfImportsInventoryResult } from '../../shared/platform/pdfImportsInventoryLoadResult';
import type { RuntimePdfImportsInventory } from '../../shared/platform/pdfImportsRuntimeRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { ImportCatalogLayout } from './ImportCatalogLayout';
import { IMPORT_CATALOG_SORT_OPTIONS, parseImportCatalogSortKey, resolveImportLastOpened, sortImportCatalogItems, type ImportCatalogSortKey } from './importCatalogOrdering';
import { PdfInventoryItem } from './ImportInventoryListItems';
import { createImportInventoryErrorState, createImportInventoryUnavailableState, type ImportInventoryLoadIssue } from './ImportInventoryState';
import { matchesImportSearch } from './importManagementSearch';

function usePdfImportsInventoryState(enabled: boolean) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadIssue, setLoadIssue] = useState<ImportInventoryLoadIssue | null>(null);
  const [pdfInventory, setPdfInventory] = useState<RuntimePdfImportsInventory | null>(null);
  const refreshPdfInventory = useCallback(async () => {
    setLoadIssue(null);
    setIsLoading(true);
    const result = await loadRuntimePdfImportsInventoryResult();
    if (result.status === 'loaded') {
      setPdfInventory(result.inventory);
    } else {
      setPdfInventory(null);
      setLoadIssue(result.status === 'unavailable' ? { kind: 'unavailable' } : { kind: 'failed', message: result.message });
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refreshPdfInventory();
  }, [enabled, refreshPdfInventory]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handleFocus = () => {
      void refreshPdfInventory();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled, refreshPdfInventory]);

  return { isLoading, loadIssue, pdfInventory, refreshPdfInventory };
}

const pdfSortOptions = IMPORT_CATALOG_SORT_OPTIONS;
type PdfSortKey = ImportCatalogSortKey;

export function filterPdfInventory(query: string, pdfInventory: RuntimePdfImportsInventory | null) {
  if (!pdfInventory) {
    return null;
  }

  return {
    ...pdfInventory,
    items: pdfInventory.items.filter((item) =>
      matchesImportSearch(query, [
        item.sourceName,
        item.sourceLocator,
        item.nodeStatus,
        item.pdfIndexStatus
      ])
    )
  };
}

export function sortPdfItems(
  items: RuntimePdfImportsInventory['items'],
  sortKey: PdfSortKey,
  sortDirection: 'asc' | 'desc',
  nodeViewById: ReturnType<typeof useWorkspaceStore.getState>['nodeViewById'] = {}
) {
  return sortImportCatalogItems(
    items.map((item) => ({
      item,
      sortLastOpened: resolveImportLastOpened(item.latestNodeId, nodeViewById),
      sortSaved: item.lastImportedAt,
      sortTitle: item.sourceName
    })),
    sortKey,
    sortDirection
  ).map((entry) => entry.item);
}

function formatCountLabel(filteredCount: number, totalCount: number) {
  return filteredCount === totalCount ? String(totalCount) : `${filteredCount} / ${totalCount}`;
}

export function ImportSourceWorkspacePdfPage({ open }: { open: boolean }) {
  const { isLoading, loadIssue, pdfInventory, refreshPdfInventory } = usePdfImportsInventoryState(open);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<PdfSortKey>('dateImported');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const filteredInventory = filterPdfInventory(query, pdfInventory);
  const filteredItems = useMemo(
    () => sortPdfItems(filteredInventory?.items ?? [], sortKey, sortDirection, nodeViewById),
    [filteredInventory?.items, nodeViewById, sortDirection, sortKey]
  );
  const totalItems = pdfInventory?.items.length ?? 0;

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <ImportCatalogLayout
        countLabel={formatCountLabel(filteredItems.length, totalItems)}
        {...(loadIssue?.kind === 'unavailable' ? { disabledState: createImportInventoryUnavailableState('PDFs') } : {})}
        emptyState={{ description: 'No PDF imports discovered yet.', title: 'PDF is empty' }}
        {...(loadIssue?.kind === 'failed'
          ? { errorState: createImportInventoryErrorState({ catalogName: 'PDFs', issue: loadIssue, onRetry: refreshPdfInventory }) }
          : {})}
        hasItems={filteredItems.length > 0}
        isLoading={isLoading}
        onChangeQuery={setQuery}
        onChangeSortDirection={setSortDirection}
        onChangeSortKey={(value) => setSortKey(parseImportCatalogSortKey(value) ?? sortKey)}
        query={query}
        searchLabel="Search imported PDFs"
        searchPlaceholder="Search in this folder"
        sortDirection={sortDirection}
        sortKey={sortKey}
        sortOptions={[...pdfSortOptions]}
        title="PDF"
      >
        {filteredItems.map((item) => (
          <PdfInventoryItem
            importedAt={item.lastImportedAt.replace('T', ' ').slice(0, 16)}
            item={item}
            key={item.sourceFingerprint}
            nodesById={nodesById}
          />
        ))}
      </ImportCatalogLayout>
    </div>
  );
}
