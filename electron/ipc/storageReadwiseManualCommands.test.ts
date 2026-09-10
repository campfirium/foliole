// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ prepare: vi.fn(), search: vi.fn(), adopt: vi.fn(), notify: vi.fn() }));
vi.mock('../import/readwiseManualSearch.js', () => ({
  prepareReadwiseManualSearch: runtime.prepare, searchReadwiseManualSources: runtime.search
}));
vi.mock('../import/readwiseManualImport.js', () => ({ importReadwiseManualSource: runtime.adopt }));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: runtime.notify }));

import { handleReadwiseManualCommand } from './storageReadwiseManualCommands.js';

beforeEach(() => { vi.clearAllMocks(); });
it('rejects malformed queries and requires explicit reimport intent', async () => {
  await expect(handleReadwiseManualCommand('search_readwise_manual_sources', { query: 3 })).rejects.toThrow();
  await expect(handleReadwiseManualCommand('import_readwise_manual_source', { id: 'api:test' })).rejects.toThrow();
  expect(runtime.adopt).not.toHaveBeenCalled();
});
it('returns complete search snapshots without triggering content refresh', async () => {
  runtime.search.mockReturnValue({ status: 'preparing', sources: [] });
  expect(await handleReadwiseManualCommand('search_readwise_manual_sources', { query: 'Writer' }))
    .toEqual({ status: 'preparing', sources: [] });
  expect(runtime.search).toHaveBeenCalledWith('Writer');
  expect(runtime.notify).not.toHaveBeenCalled();
});
it('refreshes content only after the protected adoption succeeds', async () => {
  runtime.adopt.mockResolvedValueOnce({ status: 'suppressed', node_id: null })
    .mockResolvedValueOnce({ status: 'imported', node_id: 'topic' });
  await handleReadwiseManualCommand('import_readwise_manual_source', { id: 'api:test', reimport: true });
  expect(runtime.notify).not.toHaveBeenCalled();
  await handleReadwiseManualCommand('import_readwise_manual_source', { id: 'api:test', reimport: false });
  expect(runtime.notify).toHaveBeenCalledOnce();
});
