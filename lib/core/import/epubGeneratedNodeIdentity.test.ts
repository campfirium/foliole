import { expect, it } from 'vitest';

import { createEpubGeneratedNodeId, isEpubGeneratedNodeId } from './epubGeneratedNodeIdentity.js';

it('formats and recognizes the stable generated EPUB node namespace', () => {
  const nodeId = createEpubGeneratedNodeId('0123456789abcdef0123456789abcdef');

  expect(nodeId).toBe('node-epub-0123456789abcdef01234567');
  expect(isEpubGeneratedNodeId(nodeId)).toBe(true);
  expect(isEpubGeneratedNodeId('book-root')).toBe(false);
  expect(isEpubGeneratedNodeId('user-topic')).toBe(false);
});
