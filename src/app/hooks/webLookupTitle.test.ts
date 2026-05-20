import { expect, it } from 'vitest';

import { resolveWebLookupTitle } from './webLookupTitle';

function createNode(id: string, title: string, parentNodeId: string | null, kind: 'folder' | 'item' | 'topic') {
  return { id, kind, parentNodeId, title };
}

it('uses the source topic title for derived child nodes', () => {
  const nodesById = {
    folder: createNode('folder', 'Inbox', null, 'folder'),
    source: createNode('source', 'Original Article', 'folder', 'topic'),
    excerpt: createNode('excerpt', 'Selected sentence', 'source', 'topic'),
    cloze: createNode('cloze', 'Cloze child', 'excerpt', 'item')
  };

  expect(resolveWebLookupTitle('cloze', nodesById)).toBe('Original Article');
});

it('uses the current topic title when it is already the source topic', () => {
  const nodesById = {
    folder: createNode('folder', 'Inbox', null, 'folder'),
    source: createNode('source', 'Original Article', 'folder', 'topic')
  };

  expect(resolveWebLookupTitle('source', nodesById)).toBe('Original Article');
});
