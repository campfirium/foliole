import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { publishCompanionSyncApplied } from '../shared/platform/companion/sync/companionSyncApplied';

import { useCompanionReviewTrainingStatus } from './useCompanionReviewTrainingStatus';

const runtime = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../shared/platform/companion/runtime/companionReviewTraining', () => ({
  loadCompanionReviewTrainingStatus: runtime.load
}));

const history = { lastTrainedAt: '2026-11-05T08:00:00.000Z', lastTrainedFolderId: 'folder', folderTitle: 'First library' };
function deferred() {
  let resolve!: (value: typeof history) => void;
  const promise = new Promise<typeof history>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { runtime.load.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

it('does not let an older read replace the result after a sync refresh', async () => {
  const old = deferred();
  runtime.load.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ...history, folderTitle: 'Updated title' });
  const view = renderHook(useCompanionReviewTrainingStatus);
  expect(view.result.current.phase).toBe('loading');
  act(() => publishCompanionSyncApplied());
  await waitFor(() => expect(view.result.current.history?.folderTitle).toBe('Updated title'));
  await act(async () => old.resolve(history));
  expect(view.result.current.history?.folderTitle).toBe('Updated title');
});

it('clears visible old history when the library changes and ignores its late read', async () => {
  const old = deferred();
  const current = deferred();
  runtime.load.mockResolvedValueOnce(history).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const view = renderHook(useCompanionReviewTrainingStatus);
  await waitFor(() => expect(view.result.current.history?.folderTitle).toBe('First library'));
  act(() => publishCompanionSyncApplied());
  act(invalidateCompanionReadingScope);
  expect(view.result.current.phase).toBe('loading');
  expect(view.result.current.history).toBeNull();
  await act(async () => old.resolve(history));
  expect(view.result.current.history).toBeNull();
  await act(async () => current.resolve({ ...history, folderTitle: 'Second library' }));
  expect(view.result.current.history?.folderTitle).toBe('Second library');
});

it('does not read again when a previously mounted view has been closed', async () => {
  runtime.load.mockResolvedValue(history);
  const view = renderHook(useCompanionReviewTrainingStatus);
  await waitFor(() => expect(view.result.current.phase).toBe('ready'));
  view.unmount();
  act(() => publishCompanionSyncApplied());
  expect(runtime.load).toHaveBeenCalledTimes(1);
});
