import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { useCompanionPendingReadableArticle } from './useCompanionPendingReadableArticle';

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
