import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionExternalDocument } from '../shared/platform/companionExternalDocuments';
import { isCompanionSearchTopicAvailable } from '../shared/platform/companionFullTextSearch';

import { useCompanionSearch } from './useCompanionSearch';
import { useCompanionSearchTopicOpen } from './useCompanionSearchTopicOpen';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({})
}));
let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; });

it('continues the production hook against its original SQLite result set and refreshes explicitly', async () => {
  library = await createSearchLibrary();
  const hook = renderHook(() => useCompanionSearch('alpha'));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  expect(hook.result.current.results?.topics).toHaveLength(20);
  await writeIosCompanionDatabase(async (db) => {
    await db.run("UPDATE nodes SET deleted_at='now' WHERE id='000124'");
    await db.run("UPDATE external_documents SET is_present=0 WHERE document_id='000124'");
    await db.run('DELETE FROM pdf_page_text WHERE page=1');
  });
  for (let i = 0; i < 6; i++) await act(async () => { await hook.result.current.loadMore(); });
  expect(hook.result.current.results?.topics).toHaveLength(125);
  expect(hook.result.current.results?.external).toHaveLength(125);
  expect(hook.result.current.results?.pdf).toHaveLength(125);
  expect(hook.result.current.hasMore).toBe(false);
  act(() => hook.result.current.refresh());
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  expect(hook.result.current.results?.topics[0]?.nodeId).toBe('000123');
  expect(hook.result.current.results?.external[0]?.document_id).toBe('000123');
  expect(hook.result.current.results?.pdf[0]?.page).toBe(2);
  hook.unmount();
  const reopened = renderHook(() => useCompanionSearch('alpha'));
  await waitFor(() => expect(reopened.result.current.status).toBe('ready'));
  expect(reopened.result.current.results?.topics).toHaveLength(20);
  expect(reopened.result.current.results?.topics[0]?.nodeId).toBe('000123');
  reopened.unmount();
});

it('rejects deleted topics at open and reads current external content instead of the old result body', async () => {
  library = await createSearchLibrary();
  const search = renderHook(() => useCompanionSearch('alpha'));
  await waitFor(() => expect(search.result.current.status).toBe('ready'));
  const result = search.result.current.results!.topics[0]!;
  const open = vi.fn();
  const navigation = renderHook(() => useCompanionSearchTopicOpen('alpha', open));
  expect(await isCompanionSearchTopicAvailable(result.nodeId)).toBe(true);
  await writeIosCompanionDatabase(async (db) => {
    await db.run('UPDATE nodes SET deleted_at=? WHERE id=?', ['now', result.nodeId]);
    await db.run("UPDATE external_documents SET content='changed alpha body' WHERE document_id='000124'");
  });
  await act(() => navigation.result.current.open(result));
  expect(navigation.result.current.failed).toBe(true);
  expect(open).not.toHaveBeenCalled();
  expect(search.result.current.results!.external[0]!.content).toBe('');
  expect((await loadCompanionExternalDocument('000124'))?.content).toBe('changed alpha body');
  await writeIosCompanionDatabase((db) => db.run("UPDATE external_documents SET is_present=0 WHERE document_id='000124'"));
  expect(await loadCompanionExternalDocument('000124')).toBeNull();
  navigation.unmount();
  search.unmount();
});
