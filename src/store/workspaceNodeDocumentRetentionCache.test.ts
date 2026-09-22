import { expect, it } from 'vitest';

import { WorkspaceNodeDocumentRetentionCache } from './workspaceNodeDocumentRetentionCache';
import type { WorkspaceNodeDocument } from './workspaceRendererBoundaryDocument';

function createDocument(content: string): WorkspaceNodeDocument {
  return {
    content,
    hideTitleHeading: false,
    kind: 'topic',
    reveal: null
  };
}

function createCache(maxEntries = 2, maxTotalBytes = 20) {
  return new WorkspaceNodeDocumentRetentionCache(
    maxEntries,
    20,
    maxTotalBytes,
    (document) => document.content.length
  );
}

it('evicts the least recently used warm document by entry count', () => {
  const cache = createCache();
  cache.set('node-1', createDocument('one'));
  cache.set('node-2', createDocument('two'));
  cache.get('node-1');
  cache.set('node-3', createDocument('three'));

  expect(cache.get('node-1')?.content).toBe('one');
  expect(cache.get('node-2')).toBeUndefined();
  expect(cache.get('node-3')?.content).toBe('three');
});

it('counts a pinned and cached document once in the shared budget', () => {
  const cache = createCache();
  const document = createDocument('one');
  cache.set('node-1', document);
  cache.set('node-2', createDocument('two'));
  cache.setPinnedDocuments(new Map([['node-1', document]]));

  expect(cache.get('node-1')?.content).toBe('one');
  expect(cache.get('node-2')?.content).toBe('two');
});

it('evicts warm documents before allowing pinned documents to exceed the budget', () => {
  const cache = createCache(2, 8);
  cache.set('warm', createDocument('warm'));
  cache.setPinnedDocuments(new Map([
    ['pinned-1', createDocument('12345')],
    ['pinned-2', createDocument('67890')]
  ]));

  expect(cache.get('warm')).toBeUndefined();
});

it('rejects a warm document above the per-document limit', () => {
  const cache = createCache();

  expect(cache.set('large', createDocument('x'.repeat(21)))).toBe(false);
  expect(cache.get('large')).toBeUndefined();
});
