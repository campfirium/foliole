import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { CompanionSelectionRefreshError } from './companionSelectionRefreshError';
import { createPendingAnnotationActions, useCompanionPendingReadableArticle } from './useCompanionPendingReadableArticle';

function createArticle(textAnchorDecorations = [{ from: 6, kind: 'highlight' as const, nodeId: 'highlight-1', to: 10 }]) {
  return {
    nodeId: 'topic-1',
    textAnchorDecorations
  };
}

it('hides a deleted highlight while the old article snapshot is still visible', () => {
  const { result } = renderHook(({ article }) => useCompanionPendingReadableArticle(article), {
    initialProps: { article: createArticle() }
  });

  act(() => result.current.stageDeletedHighlight('highlight-1'));

  expect(result.current.readableArticle.textAnchorDecorations).toEqual([]);
});

it('keeps a deleted highlight hidden until the real snapshot no longer contains it', () => {
  const { rerender, result } = renderHook(({ article }) => useCompanionPendingReadableArticle(article), {
    initialProps: { article: createArticle() }
  });

  act(() => result.current.stageDeletedHighlight('highlight-1'));
  rerender({ article: createArticle() });
  expect(result.current.readableArticle.textAnchorDecorations).toEqual([]);

  rerender({ article: createArticle([]) });
  expect(result.current.readableArticle.textAnchorDecorations).toEqual([]);

  rerender({ article: createArticle([{ from: 6, kind: 'highlight' as const, nodeId: 'highlight-2', to: 10 }]) });
  expect(result.current.readableArticle.textAnchorDecorations).toEqual([{ from: 6, kind: 'highlight', nodeId: 'highlight-2', to: 10 }]);
});

it('restores a pending deleted highlight when the delete action fails', () => {
  const { result } = renderHook(({ article }) => useCompanionPendingReadableArticle(article), {
    initialProps: { article: createArticle() }
  });

  act(() => result.current.stageDeletedHighlight('highlight-1'));
  expect(result.current.readableArticle.textAnchorDecorations).toEqual([]);

  act(() => result.current.restoreDeletedHighlight('highlight-1'));
  expect(result.current.readableArticle.textAnchorDecorations).toEqual([{ from: 6, kind: 'highlight', nodeId: 'highlight-1', to: 10 }]);
});

it.each([false, true])('shows only the confirmed deletion state after failure, saved=%s', async (saved) => {
  const article = { nodeId: 'source', textAnchorDecorations: [{ from: 6, to: 10, nodeId: 'cloze', kind: 'cloze' as const }] };
  const { result } = renderHook(() => useCompanionPendingReadableArticle(article));
  const error = saved ? new CompanionSelectionRefreshError(async () => {}) : new Error('not saved');
  const actions = createPendingAnnotationActions({ onDeleteExistingHighlight: async () => { throw error; } }, result.current);
  await act(async () => { await expect(actions.deleteExistingHighlight('cloze')).rejects.toBe(error); });
  expect(result.current.readableArticle.textAnchorDecorations).toEqual(saved ? [] : article.textAnchorDecorations);
});

it('retains the released range through a delayed save and hands it to the refreshed article in the same reader', async () => {
  const { result, rerender } = renderHook(({ article }) => useCompanionPendingReadableArticle(article), {
    initialProps: { article: createArticle() }
  });
  let finish!: (nodeId: string) => void;
  const saved = new Promise<string>(resolve => { finish = resolve; });
  const actions = createPendingAnnotationActions({ onAdjustExistingHighlightRange: () => saved }, result.current);
  let operation!: Promise<string | null>;
  act(() => {
    operation = actions.adjustExistingHighlightRange('highlight-1', { from: 6, to: 16 }, 'Alpha Beta Gamma', {} as never);
  });
  expect(result.current.readableArticle.textAnchorDecorations).toEqual([{ from: 6, to: 16, kind: 'highlight', nodeId: 'highlight-1' }]);
  rerender({ article: createArticle() });
  expect(result.current.readableArticle.textAnchorDecorations[0]?.to).toBe(16);
  await act(async () => { finish('highlight-1'); await operation; });
  expect(result.current.readableArticle.textAnchorDecorations[0]?.to).toBe(16);
  rerender({ article: createArticle([{ from: 6, to: 16, kind: 'highlight', nodeId: 'highlight-1' }]) });
  expect(result.current.readableArticle.textAnchorDecorations[0]?.to).toBe(16);
  rerender({ article: createArticle([{ from: 6, to: 22, kind: 'highlight', nodeId: 'highlight-1' }]) });
  expect(result.current.readableArticle.textAnchorDecorations[0]?.to).toBe(22);
});

it.each([false, true])('rolls back only an unsaved range, saved=%s', async saved => {
  const article = createArticle();
  const { result } = renderHook(() => useCompanionPendingReadableArticle(article));
  const error = saved ? new CompanionSelectionRefreshError(async () => {}) : new Error('not saved');
  const actions = createPendingAnnotationActions({ onAdjustExistingHighlightRange: async () => { throw error; } }, result.current);
  await act(async () => {
    await expect(actions.adjustExistingHighlightRange('highlight-1', { from: 0, to: 16 }, 'Alpha Beta Gamma', {} as never)).rejects.toBe(error);
  });
  expect(result.current.readableArticle.textAnchorDecorations).toEqual(saved
    ? [{ from: 0, to: 16, kind: 'highlight', nodeId: 'highlight-1' }] : article.textAnchorDecorations);
});

it('does not resurrect a deleted highlight or leak a pending range into another document', () => {
  const { result, rerender } = renderHook(({ article }) => useCompanionPendingReadableArticle(article), {
    initialProps: { article: createArticle() }
  });
  act(() => { result.current.stageRange('highlight-1', { from: 0, to: 16 }); result.current.stageDeletedHighlight('highlight-1'); });
  expect(result.current.readableArticle.textAnchorDecorations).toEqual([]);
  rerender({ article: { ...createArticle(), nodeId: 'topic-2' } });
  expect(result.current.readableArticle.textAnchorDecorations).toEqual(createArticle().textAnchorDecorations);
});
