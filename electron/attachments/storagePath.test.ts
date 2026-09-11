// @vitest-environment node

import path from 'node:path';

import { expect, it } from 'vitest';

import { resolveAttachmentStorageKeyPath, resolveAttachmentStoragePathCandidates } from './storagePath.js';

const CONTENT_HASH = 'a'.repeat(64);

it('resolves canonical and legacy attachment paths inside the assets directory', () => {
  const assetsDir = path.resolve('/tmp', 'foliole-assets');

  expect(resolveAttachmentStoragePathCandidates(CONTENT_HASH, 'image/png', assetsDir)).toEqual([
    path.join(assetsDir, `${CONTENT_HASH}.png`),
    path.join(assetsDir, CONTENT_HASH)
  ]);
});

it('rejects noncanonical storage keys before resolving an asset path', () => {
  const assetsDir = path.resolve('/tmp', 'foliole-assets');

  expect(() => {
    resolveAttachmentStorageKeyPath(assetsDir, '../outside.png');
  }).toThrow(/not canonical/i);
});
