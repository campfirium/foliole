// @vitest-environment node

import path from 'node:path';

import { expect, it } from 'vitest';

import { resolveAttachmentStoragePathCandidates } from './storagePath.js';

it('resolves canonical and legacy attachment paths inside the assets directory', () => {
  const assetsDir = path.resolve('/tmp', 'foliole-assets');

  expect(resolveAttachmentStoragePathCandidates('hash-1', 'cover.png', assetsDir)).toEqual([
    path.join(assetsDir, 'hash-1.png'),
    path.join(assetsDir, 'hash-1')
  ]);
});

it('rejects attachment ids that escape the assets directory', () => {
  const assetsDir = path.resolve('/tmp', 'foliole-assets');

  expect(() => {
    resolveAttachmentStoragePathCandidates('../outside', 'cover.png', assetsDir);
  }).toThrow(/escapes assets directory/i);
});
