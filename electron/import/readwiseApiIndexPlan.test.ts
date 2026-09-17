// @vitest-environment node

import { expect, it } from 'vitest';

import { buildReadwiseApiScopeUrl } from './readwiseApiIndexPlan.js';

it('overlaps only incremental tag checkpoints by five minutes', () => {
  const checkpoint = '2026-09-17T13:15:22.591Z';
  const tagUrl = buildReadwiseApiScopeUrl({
    checkpoint,
    cursor: null,
    importTag: 'favorite',
    scope: 'reader:tag'
  });
  const articleUrl = buildReadwiseApiScopeUrl({
    checkpoint,
    cursor: null,
    importTag: 'favorite',
    scope: 'reader:article'
  });
  const firstTagUrl = buildReadwiseApiScopeUrl({
    checkpoint: null,
    cursor: null,
    importTag: 'favorite',
    scope: 'reader:tag'
  });

  expect(tagUrl.searchParams.get('updatedAfter')).toBe('2026-09-17T13:10:22.591Z');
  expect(articleUrl.searchParams.get('updatedAfter')).toBe(checkpoint);
  expect(firstTagUrl.searchParams.has('updatedAfter')).toBe(false);
});
