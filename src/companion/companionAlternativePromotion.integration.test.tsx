// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { textBranch } from '../../electron/database/topicTextState.testSupport';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph';
import { readTopicAlternativeRecords } from '../../lib/core/sync/topicAlternativeStore';
import { readCompanionArticle } from '../shared/platform/companion/reading/companionArticleRead';
import { updateCompanionNodeTextAlternativeStatus } from '../shared/platform/companion/runtime/companionNodeTextAlternativeRepository';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { readIosCompanionDatabase, writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
import { useCompanionNodeTextAlternative } from './useCompanionNodeTextAlternative';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub
  };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { vi.useRealTimers(); await library?.close(); library = null; });

async function fixture() {
  library = await createSearchLibrary(0);
  const now = Date.now();
  const base = textBranch('base', 'Base', undefined, new Date(now - 4000).toISOString());
  const main = textBranch('phone', 'Phone body continued '.repeat(20), base, new Date(now - 3000).toISOString());
  const image = { storage_key: 'a'.repeat(64) + '.png', role: 'image' as const, original_name: 'selected.png' };
  const older = textBranch('mac1', '\ufeffMac one\r\n完整 😀\0\r\n![Selected](asset://' + image.storage_key + ')',
    base, new Date(now - 2000).toISOString());
  older.snapshot.resource_references = JSON.stringify([image]);
  older.snapshot.image_sources = JSON.stringify({ [image.storage_key]: 'https://example.com/selected.png' });
  const newer = textBranch('mac2', 'Mac two', base, new Date(now - 1000).toISOString());
  for (const records of [[base, main], [older], [newer]]) {
    await writeIosCompanionDatabase(db => applyConvergentSyncNodesWithDbPort(db, records));
  }
  const alternatives = await readIosCompanionDatabase(db => readTopicAlternativeRecords(db, 'topic'));
  const selected = alternatives.find(entry => entry.source_host_name === 'mac1')!;
  const remaining = alternatives.find(entry => entry.source_host_name === 'mac2')!;
  const current = await readIosCompanionDatabase(db => loadCurrentSyncNodeRecord(db, 'topic'));
  return { selected, remaining, current: current!, image, older, newer };
}

it('promotes the older of two alternatives through the native owner and reading hook', async () => {
  const { selected, remaining, current, image, older, newer } = await fixture();
  const refreshAfterMutation = vi.fn(async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot);
  const save = createCompanionTopicContentSaveHandler({ state: await loadCompanionWorkspaceSyncState(),
    refreshAfterMutation } as unknown as ReturnType<typeof useCompanionWorkspaceSync>);
  const hook = renderHook(() => useCompanionNodeTextAlternative({ nodeId: 'topic', onSetAsBody: save }));
  await waitFor(() => expect(hook.result.current.alternative?.alternatives).toHaveLength(2));
  await act(() => hook.result.current.selectAlternative(selected.alternative_id));
  expect(hook.result.current.alternative!.body_text).toBe(older.body_text);
  await act(() => hook.result.current.setAsBody());
  expect(hook.result.current.error).toBe(false);
  const promoted = (await readIosCompanionDatabase(db => loadCurrentSyncNodeRecord(db, 'topic')))!;
  expect(promoted.body_text).toBe(older.body_text);
  expect(promoted.parent_version_ids).toEqual([current.version_id]);
  expect(JSON.parse(promoted.snapshot.resource_references!)).toContainEqual(image);
  expect(JSON.parse(promoted.snapshot.image_sources!)).toEqual(JSON.parse(older.snapshot.image_sources!));
  expect(await readIosCompanionDatabase(db => readTopicAlternativeRecords(db, 'topic'))).toEqual([remaining]);
  expect(await readIosCompanionDatabase(db => db.query('SELECT status, body_text FROM node_text_alternatives WHERE alternative_id = ?',
    [selected.alternative_id]))).toEqual([{ status: 'promoted', body_text: '' }]);
  expect(hook.result.current.alternative?.body_text).toBe(newer.body_text);
  expect(refreshAfterMutation).toHaveBeenCalledOnce();
  const snapshot = (await refreshAfterMutation.mock.results[0]!.value)!;
  expect((await readCompanionArticle(snapshot, 'topic', () => true))?.content).toBe(older.body_text);
  hook.unmount();
  await reopenSearchLibrary(library!.root, new Date().toISOString());
  expect(await readIosCompanionDatabase(db => loadCurrentSyncNodeRecord(db, 'topic'))).toEqual(promoted);
  expect(await readIosCompanionDatabase(db => readTopicAlternativeRecords(db, 'topic'))).toEqual([remaining]);
});

it('dismisses only the selected alternative without changing the current version', async () => {
  const { selected, remaining, current } = await fixture();
  const hook = renderHook(() => useCompanionNodeTextAlternative({ nodeId: 'topic' }));
  await waitFor(() => expect(hook.result.current.alternative?.alternatives).toHaveLength(2));
  await act(() => hook.result.current.selectAlternative(selected.alternative_id));
  await act(() => hook.result.current.dismiss());
  expect(hook.result.current.error).toBe(false);
  expect(await readIosCompanionDatabase(db => loadCurrentSyncNodeRecord(db, 'topic'))).toEqual(current);
  expect(await readIosCompanionDatabase(db => readTopicAlternativeRecords(db, 'topic'))).toEqual([remaining]);
  hook.unmount();
});

it.each(['dismissed', 'promoted'] as const)('rolls back a failed %s write through the native owner', async status => {
  const { selected } = await fixture();
  library!.database.exec(`CREATE TRIGGER reject_selection BEFORE UPDATE ON node_text_alternatives
    BEGIN SELECT RAISE(ABORT, 'selection_failed'); END`);
  const before = library!.database.serialize();
  await expect(updateCompanionNodeTextAlternativeStatus('topic', selected.alternative_id, status)).rejects.toThrow('selection_failed');
  expect(library!.database.serialize()).toEqual(before);
});

it.each(['dismissed', 'promoted'] as const)('rejects unavailable %s choices without changing persisted facts', async status => {
  const { selected } = await fixture();
  const before = library!.database.serialize();
  await expect(updateCompanionNodeTextAlternativeStatus('wrong-owner', selected.alternative_id, status)).rejects.toThrow('text_alternative_unavailable');
  await expect(updateCompanionNodeTextAlternativeStatus('topic', 'missing', status)).rejects.toThrow('text_alternative_unavailable');
  expect(library!.database.serialize()).toEqual(before);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse(selected.expires_at) + 1);
  expect(await updateCompanionNodeTextAlternativeStatus('topic', selected.alternative_id, status)).toMatchObject({ status: 'unavailable' });
  expect(library!.database.serialize()).toEqual(before);
});
