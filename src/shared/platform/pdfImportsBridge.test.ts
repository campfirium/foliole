import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { loadRuntimePdfImportsInventoryResult } from './pdfImportsInventoryLoadResult';
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
  delete window.electronAPI;
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

it('returns unavailable when the pdf imports inventory runtime is missing', async () => {
  await expect(loadRuntimePdfImportsInventoryResult()).resolves.toEqual({ status: 'unavailable' });
});

it('returns failed when the pdf imports inventory payload is malformed', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const invoke = vi.fn().mockResolvedValue({ items: [{}] });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimePdfImportsInventoryResult()).resolves.toEqual({
    message: 'PDF imports inventory could not be loaded.',
    status: 'failed'
  });
  expect(warn).toHaveBeenCalledWith(
    '[bridge] native inventory payload invalid',
    expect.objectContaining({
      action: 'load_runtime_pdf_imports_inventory',
      area: 'bridge',
      command: 'load_pdf_imports_inventory',
      fallback: 'return_failed'
    })
  );
});

it('returns failed with the thrown message when pdf imports inventory loading rejects', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const invoke = vi.fn().mockRejectedValue(new Error('disk unavailable'));
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimePdfImportsInventoryResult()).resolves.toEqual({
    message: 'disk unavailable',
    status: 'failed'
  });
  expect(warn).toHaveBeenCalledWith(
    '[bridge] native inventory loading failed',
    expect.objectContaining({
      action: 'load_runtime_pdf_imports_inventory',
      area: 'bridge',
      command: 'load_pdf_imports_inventory',
      fallback: 'return_failed'
    })
  );
});
