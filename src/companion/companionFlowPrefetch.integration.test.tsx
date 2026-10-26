import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { seedCompanionReviewHistory } from './companionFlowHistory.testSupport';
import { useCompanionFlowSession } from './useCompanionFlowSession';
import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/appLifecycle', () => ({ subscribeNativeAppForeground: async () => () => {} }));

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
afterEach(async () => { await library?.close(); vi.restoreAllMocks(); });

it('opens Flow, prepares only the next body, and opens that body without revealing the answer or rereading SQLite', async () => {
  library = await createSearchLibrary(0);
  const now = new Date().toISOString();
  await seedCompanionReviewHistory({ due: '2026-10-01T00:00:00.000Z', lastReviewAt: '2026-09-28T00:00:00.000Z',
    state: 2, stability: 3, difficulty: 4, elapsedDays: 3, scheduledDays: 3, reps: 2, lapses: 0 }, now);
  const source = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  const reads = vi.spyOn(library.connection, 'query');
  const publish = vi.fn();
  const hook = renderHook(() => ({
    flow: useCompanionFlowSession({ snapshot: source, ready: true, active: true, onlyReview: false,
      libraryScope: source.libraryScope ?? 'test' }),
    article: useCompanionReadableArticleLoader(source, publish)
  }));
  await waitFor(() => expect(hook.result.current.flow.ready).toBe(true));
  const ids = hook.result.current.flow.view.queueNodeIds;
  const next = ids[1]!;
  expect(next).toBeTruthy();
  await waitFor(() => expect(reads.mock.calls.filter(([sql]) => sql.includes('SELECT article.*'))
    .map(([, values]) => values?.[0])).toEqual([next]));
  await getIosCompanionDatabaseOwner().read(async () => null);
  expect(publish).not.toHaveBeenCalled();
  expect(hook.result.current.flow.isAnswerRevealed).toBe(false);
  reads.mockClear();
  await act(async () => { await hook.result.current.article.openReadableArticle(next); });
  expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ nodeId: next, content: next }));
  expect(reads.mock.calls.filter(([sql]) => sql.includes('SELECT article.*'))).toHaveLength(0);
  expect(hook.result.current.flow.isAnswerRevealed).toBe(false);
  hook.unmount();
});
