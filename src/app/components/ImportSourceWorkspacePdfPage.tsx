import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { loadRuntimePdfImportsInventoryResult } from '../../shared/platform/pdfImportsInventoryLoadResult';
import type { RuntimePdfImportsInventory } from '../../shared/platform/pdfImportsRuntimeRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { ImportCatalogLayout } from './ImportCatalogLayout';
import { getImportCatalogSortOptions, parseImportCatalogSortKey, resolveImportLastOpened, sortImportCatalogItems, type ImportCatalogSortKey } from './importCatalogOrdering';
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

function renderPdfInventoryItems(items: RuntimePdfImportsInventory['items'], nodesById: ReturnType<typeof useWorkspaceStore.getState>['nodesById']) {
  return items.map((item) => (
    <PdfInventoryItem
      importedAt={item.lastImportedAt.replace('T', ' ').slice(0, 16)}
      item={item}
      key={item.sourceFingerprint}
      nodesById={nodesById}
    />
  ));
}

function PdfInventoryCatalog(props: {
  filteredItems: RuntimePdfImportsInventory['items'];
  isLoading: boolean;
  loadIssue: ImportInventoryLoadIssue | null;
  nodesById: ReturnType<typeof useWorkspaceStore.getState>['nodesById'];
  onChangeQuery: (query: string) => void;
  onChangeSortDirection: (sortDirection: 'asc' | 'desc') => void;
  onChangeSortKey: (sortKey: PdfSortKey) => void;
  query: string;
  refreshPdfInventory: () => Promise<void>;
  sortDirection: 'asc' | 'desc';
  sortKey: PdfSortKey;
  totalItems: number;
}) {
  const t = useTranslation();

  return (
    <ImportCatalogLayout
      catalogAriaLabel={t('desktop.importOverview.pdfInventory.aria')}
      countLabel={formatCountLabel(props.filteredItems.length, props.totalItems)}
      {...(props.loadIssue?.kind === 'unavailable'
        ? {
            disabledState: createImportInventoryUnavailableState({
              description: t('desktop.importCatalog.unavailable.description', { catalogName: t('desktop.importInventory.pdf.catalogName') }),
              title: t('desktop.importCatalog.unavailable.title')
            })
          }
        : {})}
      emptyState={{ description: t('desktop.importInventory.pdf.empty.description'), title: t('desktop.importInventory.pdf.empty.title') }}
      {...(props.loadIssue?.kind === 'failed'
        ? {
            errorState: createImportInventoryErrorState({
              issue: props.loadIssue,
              onRetry: props.refreshPdfInventory,
              title: t('desktop.importCatalog.error.title', { catalogName: t('desktop.importInventory.pdf.catalogName') })
            })
          }
        : {})}
      hasItems={props.filteredItems.length > 0}
      isLoading={props.isLoading}
      onChangeQuery={props.onChangeQuery}
      onChangeSortDirection={props.onChangeSortDirection}
      onChangeSortKey={(value) => props.onChangeSortKey(parseImportCatalogSortKey(value) ?? props.sortKey)}
      query={props.query}
      searchLabel={t('desktop.importInventory.pdf.search.label')}
      searchPlaceholder={t('desktop.importInventory.pdf.search.placeholder')}
      sortDirection={props.sortDirection}
      sortKey={props.sortKey}
      sortOptions={getImportCatalogSortOptions(t)}
      title={t('desktop.importInventory.pdf.title')}
    >
      {renderPdfInventoryItems(props.filteredItems, props.nodesById)}
    </ImportCatalogLayout>
  );
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

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <PdfInventoryCatalog
        filteredItems={filteredItems}
        isLoading={isLoading}
        loadIssue={loadIssue}
        nodesById={nodesById}
        onChangeQuery={setQuery}
        onChangeSortDirection={setSortDirection}
        onChangeSortKey={setSortKey}
        query={query}
        refreshPdfInventory={refreshPdfInventory}
        sortDirection={sortDirection}
        sortKey={sortKey}
        totalItems={pdfInventory?.items.length ?? 0}
      />
    </div>
  );
}
