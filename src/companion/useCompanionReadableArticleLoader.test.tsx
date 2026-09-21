import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';
import { createSnapshot } from './useCompanionWorkspaceSync.testSupport';

const loadArticle = vi.fn();

vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionReadableArticle: (...args: unknown[]) => loadArticle(...args)
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('useCompanionReadableArticleLoader', () => {
  beforeEach(() => {
    loadArticle.mockReset();
  });

  it('ignores a late document result after a newer node has opened', async () => {
    const first = deferred<{ nodeId: string }>();
    const second = deferred<{ nodeId: string }>();
    loadArticle.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const setArticle = vi.fn();
    const { result } = renderHook(() => useCompanionReadableArticleLoader(createSnapshot(), setArticle));

    let firstRequest!: Promise<unknown>;
    let secondRequest!: Promise<unknown>;
    act(() => {
      firstRequest = result.current('topic-1');
      secondRequest = result.current('topic-2');
    });
    await act(async () => {
      second.resolve({ nodeId: 'topic-2' });
      await secondRequest;
      first.resolve({ nodeId: 'topic-1' });
      await firstRequest;
    });

    expect(setArticle).toHaveBeenCalledTimes(1);
    expect(setArticle).toHaveBeenCalledWith({ nodeId: 'topic-2' });
  });
});
