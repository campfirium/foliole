import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { loadRuntimePdfImportsInventory } from './pdfImportsRuntimeRepository';

function createMockElectronApi(invoke: ElectronAPI['invoke']): ElectronAPI {
  return {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.electronAPI = undefined;
});

it('normalizes the pdf imports inventory payload', async () => {
  const invoke = vi.fn().mockResolvedValue({
    items: [
      {
        last_imported_at: '2026-04-04T01:00:00.000Z',
        latest_node_id: 'node-book-a',
        node_status: 'generated',
        pdf_indexed_at: '2026-04-04T01:05:00.000Z',
        pdf_index_status: 'ready',
        source_fingerprint: 'pdf-source-1',
        source_locator: '/tmp/Book A.pdf',
        source_name: 'Book A.pdf'
      }
    ],
    scanned_at: '2026-04-04T01:06:00.000Z'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimePdfImportsInventory()).resolves.toEqual({
    items: [
      {
        lastImportedAt: '2026-04-04T01:00:00.000Z',
        latestNodeId: 'node-book-a',
        nodeStatus: 'generated',
        pdfIndexedAt: '2026-04-04T01:05:00.000Z',
        pdfIndexStatus: 'ready',
        sourceFingerprint: 'pdf-source-1',
        sourceLocator: '/tmp/Book A.pdf',
        sourceName: 'Book A.pdf'
      }
    ],
    scannedAt: '2026-04-04T01:06:00.000Z'
  });
  expect(invoke).toHaveBeenCalledWith('load_pdf_imports_inventory');
});
