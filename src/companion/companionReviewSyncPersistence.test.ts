import { beforeEach, expect, it, vi } from 'vitest';

import { saveCompanionSyncNodeReadingRecord } from '../shared/platform/companionSyncObjects';
import { WorkspacePartialPersistenceError } from '../store/workspacePersistenceFailure';

import { persistCompanionReviewSyncObject } from './companionReviewSyncPersistence';
import { createCompanionArticleSnapshot } from './useCompanionArticleSurfaceTestSupport';

vi.mock('../shared/platform/companionSyncObjects', () => ({
  saveCompanionSyncNodeReadingRecord: vi.fn(),
  saveCompanionSyncNodeReviewRecord: vi.fn()
}));

const saveReading = vi.mocked(saveCompanionSyncNodeReadingRecord);

function payload() {
  const snapshot = createCompanionArticleSnapshot();
  for (const nodeId of ['article-1', 'article-2']) {
    snapshot.nodesById[nodeId]!.reading = {
      intervalDurationMs: 1000, intervalGrowthFactor: 1,
      lastHandledAt: '2026-05-01T00:00:00.000Z', nextAt: '2026-05-02T00:00:00.000Z',
      priority: 5, readingPosition: 0, repetitionCount: 0, state: 'active'
    };
  }
  return { itemKind: 'reading' as const, nodeId: 'article-1', nodeIds: ['article-1', 'article-2'], snapshot };
}

beforeEach(() => saveReading.mockReset());

it('preserves a first-write empty result without marking a partial commit', async () => {
  saveReading.mockResolvedValueOnce(null);
  await expect(persistCompanionReviewSyncObject(payload())).resolves.toBeNull();
  expect(saveReading).toHaveBeenCalledTimes(1);
});

it.each(['empty', 'throw', 'missing'] as const)('identifies a partial commit when the next record is %s', async (failure) => {
  const input = payload();
  saveReading.mockResolvedValueOnce({ object_id: 'article-1', content_hash: 'saved' });
  if (failure === 'empty') saveReading.mockResolvedValueOnce(null);
  if (failure === 'throw') saveReading.mockRejectedValueOnce(new Error('Storage unavailable'));
  if (failure === 'missing') delete input.snapshot.nodesById['article-2'];
  await expect(persistCompanionReviewSyncObject(input)).rejects.toBeInstanceOf(WorkspacePartialPersistenceError);
});

it('preserves the original error before any record commits', async () => {
  const failure = new Error('Storage unavailable');
  saveReading.mockRejectedValueOnce(failure);
  await expect(persistCompanionReviewSyncObject(payload())).rejects.toBe(failure);
});
