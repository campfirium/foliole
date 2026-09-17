// @vitest-environment node

import { expect, it } from 'vitest';

import { createDefaultReadwiseAutoImportPolicy } from '../../lib/core/import/readwiseAutoImportPolicy.js';

import {
  buildReadwiseApiScopeUrl,
  readwiseApiScopePolicySignature
} from './readwiseApiIndexPlan.js';

it('versions the tag scope to backfill existing checkpoints once', () => {
  const policy = { ...createDefaultReadwiseAutoImportPolicy(), importTag: 'favorite' };

  expect(readwiseApiScopePolicySignature('reader:tag', policy))
    .toMatch(/^tag-checkpoint-overlap-v1\|favorite\|/);
  expect(readwiseApiScopePolicySignature('reader:article', policy))
    .not.toContain('tag-checkpoint-overlap-v1');
});

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
