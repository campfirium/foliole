import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';

import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';
import { createSnapshot } from './useCompanionWorkspaceSync.testSupport';

const loadArticle = vi.fn();
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionReadableArticle: (...args: unknown[]) => loadArticle(...args)
}));
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppForeground: vi.fn(async () => () => undefined)
}));

function deferred() {
  let resolve!: (value: { nodeId: string; content?: string }) => void;
  const promise = new Promise<{ nodeId: string; content?: string }>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  const snapshot = createSnapshot();
  snapshot.nodesById['topic-2'] = { ...snapshot.nodesById['topic-1']!, id: 'topic-2' };
  snapshot.nodeOrder.push('topic-2');
  const setArticle = vi.fn();
  const hook = renderHook(({ value }) => useCompanionReadableArticleLoader(value, setArticle).openReadableArticle, {
    initialProps: { value: snapshot }
  });
  return { ...hook, snapshot, setArticle };
}

describe('current article demand', () => {
  beforeEach(() => loadArticle.mockReset());

  it('coalesces a repeated demand, and unrelated catalog changes do not reread it', async () => {
    const read = deferred();
    loadArticle.mockReturnValue(read.promise);
    const { result, rerender, snapshot, setArticle } = setup();
    const first = result.current('topic-1');
    expect(result.current('topic-1')).toBe(first);
    await act(async () => { read.resolve({ nodeId: 'topic-1' }); await first; });
    rerender({ value: { ...snapshot, activeNodeId: 'topic-2' } });
    await result.current('topic-1');
    expect(loadArticle).toHaveBeenCalledTimes(1);
    expect(setArticle).toHaveBeenLastCalledWith({ nodeId: 'topic-1' });
  });

  it('does not return or publish a late A result after B opens', async () => {
    const first = deferred();
    const second = deferred();
    loadArticle.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, setArticle } = setup();
    const requestA = result.current('topic-1');
    await act(async () => { await Promise.resolve(); });
    const requestB = result.current('topic-2');
    await act(async () => { second.resolve({ nodeId: 'topic-2' }); await requestB; });
    await act(async () => { first.resolve({ nodeId: 'topic-1' }); expect(await requestA).toBeNull(); });
    expect(setArticle).toHaveBeenLastCalledWith({ nodeId: 'topic-2' });
    expect(setArticle).not.toHaveBeenCalledWith({ nodeId: 'topic-1' });
  });

  it('releases body and annotations on leaving and reads again on return', async () => {
    const article = { nodeId: 'topic-1', content: 'body', loadedNodeContentById: { note: 'annotation' } };
    loadArticle.mockResolvedValue(article);
    const { result, setArticle } = setup();
    await act(async () => { await result.current('topic-1'); await result.current(null); });
    expect(setArticle).toHaveBeenLastCalledWith(null);
    await act(async () => { await result.current('topic-1'); });
    expect(loadArticle).toHaveBeenCalledTimes(2);
  });

});

describe('current article invalidation', () => {
  beforeEach(() => loadArticle.mockReset());

  it('skips obsolete work before the read starts', async () => {
    const { result } = setup();
    const pending = result.current('topic-1');
    await result.current(null);
    expect(await pending).toBeNull();
    expect(loadArticle).not.toHaveBeenCalled();
  });

  it('rejects an old version even before the replacement demand begins', async () => {
    const read = deferred();
    loadArticle.mockReturnValue(read.promise);
    const { result, rerender, snapshot, setArticle } = setup();
    const pending = result.current('topic-1');
    await act(async () => { await Promise.resolve(); });
    rerender({ value: { ...snapshot, nodesById: { ...snapshot.nodesById,
      'topic-1': { ...snapshot.nodesById['topic-1']!, currentVersionId: 'new-version' } } } });
    await act(async () => { read.resolve({ nodeId: 'topic-1', content: 'old' }); expect(await pending).toBeNull(); });
    expect(setArticle).toHaveBeenLastCalledWith(null);
  });

  it('invalidates same-ID reads when the library closes or resets', async () => {
    const read = deferred();
    loadArticle.mockReturnValue(read.promise);
    const { result, setArticle } = setup();
    const pending = result.current('topic-1');
    await act(async () => { await Promise.resolve(); invalidateCompanionReadingScope(); });
    await act(async () => { read.resolve({ nodeId: 'topic-1' }); expect(await pending).toBeNull(); });
    expect(setArticle).toHaveBeenLastCalledWith(null);
  });

  it('reports a real failure and allows the same demand to retry', async () => {
    const error = new Error('read failed');
    loadArticle.mockRejectedValueOnce(error).mockResolvedValueOnce({ nodeId: 'topic-1' });
    const { result } = setup();
    await expect(result.current('topic-1')).rejects.toThrow('read failed');
    await expect(result.current('topic-1')).resolves.toEqual({ nodeId: 'topic-1' });
  });
});
