import { useCallback, useEffect, useState } from 'react';

import {
  loadRuntimePdfImportsInventory,
  type RuntimePdfImportsInventory
} from '../../shared/platform/pdfImportsBridge';

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

export function ImportSourceWorkspacePdfPage({ open }: { open: boolean }) {
  const { pdfInventory } = usePdfImportsInventoryState(open);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <PdfImportsInventorySection inventory={pdfInventory} />
    </div>
  );
}
