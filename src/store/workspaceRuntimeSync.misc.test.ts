import { describe, expect, it, vi } from 'vitest';

import { isDesktopRuntime } from '../shared/platform/runtime';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { syncNodeContentToRuntime, syncNodeOrderToRuntime, syncReviewGradeToRuntime } from './workspaceRuntimeSync';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));
vi.mock('../shared/platform/runtime', () => ({ isDesktopRuntime: vi.fn(() => false) }));

const REVIEW_GRADE_PAYLOAD = {
  nodeId: 'node-qa',
  grade: 3 as const,
  reviewedAt: '2026-03-06T00:00:00.000Z',
  cardBefore: { due: '2026-03-06T00:00:00.000Z', last_review: null, state: 0 as const, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0 },
  cardAfter: { due: '2026-03-09T00:00:00.000Z', last_review: '2026-03-06T00:00:00.000Z', state: 1 as const, stability: 1.4, difficulty: 2.2, elapsed_days: 1, scheduled_days: 3, reps: 1, lapses: 0 }
};

function createNodeFixture() {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic' as const,
    title: 'Seed',
    isTitleManual: false,
    hideTitleHeading: true,
    content: '# Seed',
    anchorLink: null,
    reveal: 'Reveal',
    review: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:01.000Z'
  };
}

describe('workspaceRuntimeSync misc behavior', () => {
  it('logs node order sync failures instead of swallowing them silently', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('database offline'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    syncNodeOrderToRuntime(['node-1', 'node-2']);
    await Promise.resolve();
    expect(error).toHaveBeenCalledWith('[native] runtime sync failed', expect.objectContaining({ action: 'sync_node_order' }));
  });

  it('skips sync when runtime invoke is unavailable', () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
    expect(() => syncNodeContentToRuntime(createNodeFixture())).not.toThrow();
  });

  it('syncs review grade mutations through apply_review_grade command', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    await expect(syncReviewGradeToRuntime(REVIEW_GRADE_PAYLOAD)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('apply_review_grade', REVIEW_GRADE_PAYLOAD);
  });

  it('throws when runtime review mutation fails', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('failed'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    await expect(syncReviewGradeToRuntime(REVIEW_GRADE_PAYLOAD)).rejects.toThrow('failed');
    expect(error).toHaveBeenCalledWith('[native] runtime review grade sync failed', expect.objectContaining({ action: 'sync_review_grade' }));
  });

  it('handles missing review bridge according to runtime environment', async () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
    vi.mocked(isDesktopRuntime).mockReturnValue(true);
    await expect(syncReviewGradeToRuntime(REVIEW_GRADE_PAYLOAD)).rejects.toThrow('runtime bridge unavailable for review grade sync');
    vi.mocked(isDesktopRuntime).mockReturnValue(false);
    await expect(syncReviewGradeToRuntime(REVIEW_GRADE_PAYLOAD)).resolves.toBeUndefined();
  });
});
