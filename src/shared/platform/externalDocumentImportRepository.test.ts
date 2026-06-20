import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import type { ElectronAPI } from './electronApi';
import { importExternalDocument } from './externalDocumentImportRepository';
import { resetExternalFolderRuntimeProviderForTest } from './runtime/externalFolderRuntime';

function createNativeImportResult() {
  return {
    imported_at: '2026-04-21T00:00:00.000Z',
    node_id: 'node-imported',
    source_name: 'topic.md'
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetExternalFolderRuntimeProviderForTest();
  delete window.electronAPI;
});

it('imports external documents through the native external search command', async () => {
  const invoke = vi.fn(async (command: string) => (command === NATIVE_COMMANDS.importExternalSearchDocument ? createNativeImportResult() : null));
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  await expect(importExternalDocument('/library/topic.md')).resolves.toEqual(createNativeImportResult());
  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.importExternalSearchDocument, { absolute_path: '/library/topic.md' });
});
