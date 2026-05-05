import { useCallback, useEffect, useState } from 'react';

import {
  loadRuntimePdfImportsInventory,
  type RuntimePdfImportsInventory
} from '../../shared/platform/pdfImportsBridge';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { matchesImportSearch } from './importManagementSearch';
import { ImportManagementSearchBar } from './ImportManagementSearchBar';
import { PdfImportsInventorySection } from './ImportPdfOverviewSection';

function usePdfImportsInventoryState(enabled: boolean) {
  const [pdfInventory, setPdfInventory] = useState<RuntimePdfImportsInventory | null>(null);
  const refreshPdfInventory = useCallback(async () => {
    setPdfInventory(await loadRuntimePdfImportsInventory());
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

  return { pdfInventory };
}

function filterPdfInventory(query: string, pdfInventory: RuntimePdfImportsInventory | null) {
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

export function ImportSourceWorkspacePdfPage({ open }: { open: boolean }) {
  const { pdfInventory } = usePdfImportsInventoryState(open);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const [query, setQuery] = useState('');
  const filteredInventory = filterPdfInventory(query, pdfInventory);
  const filteredCount = filteredInventory?.items.length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ImportManagementSearchBar
        countLabel={`${filteredCount} matches`}
        onChange={setQuery}
        placeholder="Search imported PDFs"
        value={query}
      />
      <PdfImportsInventorySection inventory={filteredInventory} nodesById={nodesById} />
    </div>
  );
}
