import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { runRuntimeTextFileImport } from './importExecutionRuntimeRepository';

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

it('accepts pdf import payloads from the runtime bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    content_fingerprint: 'content-fingerprint-pdf',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-pdf-1',
    imported_at: '2026-03-22T10:40:00.000Z',
    node_id: 'node-pdf-1',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint-pdf',
    source_kind: 'pdf',
    source_locator: '/tmp/paper.pdf',
    source_name: 'paper.pdf'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(runRuntimeTextFileImport()).resolves.toEqual({
    contentFingerprint: 'content-fingerprint-pdf',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-pdf-1',
    importedAt: '2026-03-22T10:40:00.000Z',
    nodeId: 'node-pdf-1',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-fingerprint-pdf',
    sourceKind: 'pdf',
    sourceLocator: '/tmp/paper.pdf',
    sourceName: 'paper.pdf'
  });
});
