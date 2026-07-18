// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  driver: {},
  enqueueWorkspaceSearchInvalidationForNodeIds: vi.fn()
}));

vi.mock('../../lib/core/database/searchIndexInvalidations.js', () => ({
  enqueueWorkspaceSearchInvalidationForNodeIds: mocks.enqueueWorkspaceSearchInvalidationForNodeIds
}));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => ({ driver: mocks.driver })
}));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  const { resetSearchInvalidationCoalescerForTests } = await import('./searchIndexInvalidationCoalescer.js');
  resetSearchInvalidationCoalescerForTests();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.resetModules();
});

it('deduplicates workspace invalidations and flushes after idle', async () => {
  const {
    SEARCH_INVALIDATION_IDLE_FLUSH_MS,
    enqueueCoalescedWorkspaceSearchInvalidation
  } = await import('./searchIndexInvalidationCoalescer.js');

  enqueueCoalescedWorkspaceSearchInvalidation(['node-1', 'node-1', ' node-2 ']);
  expect(mocks.enqueueWorkspaceSearchInvalidationForNodeIds).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(SEARCH_INVALIDATION_IDLE_FLUSH_MS);

  expect(mocks.enqueueWorkspaceSearchInvalidationForNodeIds).toHaveBeenCalledWith(
    mocks.driver,
    ['node-1', 'node-2'],
    { advanceSourceRevision: false }
  );
});

it('keeps the max flush timer while idle is rescheduled', async () => {
  const {
    SEARCH_INVALIDATION_IDLE_FLUSH_MS,
    SEARCH_INVALIDATION_MAX_FLUSH_MS,
    enqueueCoalescedWorkspaceSearchInvalidation
  } = await import('./searchIndexInvalidationCoalescer.js');

  enqueueCoalescedWorkspaceSearchInvalidation(['node-1']);
  await vi.advanceTimersByTimeAsync(SEARCH_INVALIDATION_IDLE_FLUSH_MS - 1);
  enqueueCoalescedWorkspaceSearchInvalidation(['node-2']);
  await vi.advanceTimersByTimeAsync(SEARCH_INVALIDATION_MAX_FLUSH_MS - SEARCH_INVALIDATION_IDLE_FLUSH_MS);

  expect(mocks.enqueueWorkspaceSearchInvalidationForNodeIds).toHaveBeenCalledWith(
    mocks.driver,
    ['node-1', 'node-2'],
    { advanceSourceRevision: false }
  );
});

it('flushes pending invalidations on demand', async () => {
  const {
    enqueueCoalescedWorkspaceSearchInvalidation,
    flushCoalescedWorkspaceSearchInvalidations
  } = await import('./searchIndexInvalidationCoalescer.js');

  enqueueCoalescedWorkspaceSearchInvalidation(['node-1']);
  flushCoalescedWorkspaceSearchInvalidations();

  expect(mocks.enqueueWorkspaceSearchInvalidationForNodeIds).toHaveBeenCalledWith(
    mocks.driver,
    ['node-1'],
    { advanceSourceRevision: false }
  );
  await vi.runAllTimersAsync();
  expect(mocks.enqueueWorkspaceSearchInvalidationForNodeIds).toHaveBeenCalledTimes(1);
});
