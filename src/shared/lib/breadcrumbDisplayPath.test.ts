import { describe, expect, it } from 'vitest';

import { buildBreadcrumbDisplayPath, type BreadcrumbDisplayPathNode } from './breadcrumbDisplayPath';
import { definedProps } from './definedProps';

function createNode(
  id: string,
  title: string,
  parentNodeId: string | null,
  kind?: BreadcrumbDisplayPathNode['kind']
): BreadcrumbDisplayPathNode {
  return {
    id,
    parentNodeId,
    title,
    ...definedProps({ kind })
  };
}

describe('buildBreadcrumbDisplayPath', () => {
  it('returns ancestors only and excludes the current node', () => {
    const nodesById = {
      folder: createNode('folder', 'Inbox', null, 'folder'),
      article: createNode('article', 'Article title', 'folder', 'topic'),
      current: createNode('current', 'Current item', 'article', 'item')
    };

    expect(buildBreadcrumbDisplayPath('current', nodesById)).toEqual([
      { id: 'folder', targetNodeId: 'folder', title: 'Inbox' },
      { id: 'article', targetNodeId: 'article', title: 'Article title' }
    ]);
  });

  it('keeps nested topic ancestors navigable and only folds derived item ancestors back to the article', () => {
    const nodesById = {
      folder: createNode('folder', 'Inbox', null, 'folder'),
      article: createNode('article', 'Article title', 'folder', 'topic'),
      chapter: createNode('chapter', 'Chapter section', 'article', 'topic'),
      derivedItem: createNode('derivedItem', 'Derived card title', 'chapter', 'item'),
      current: createNode('current', 'Current item', 'derivedItem', 'item')
    };

    expect(buildBreadcrumbDisplayPath('current', nodesById)).toEqual([
      { id: 'folder', targetNodeId: 'folder', title: 'Inbox' },
      { id: 'article', targetNodeId: 'article', title: 'Article title' },
      { id: 'chapter', targetNodeId: 'chapter', title: 'Chapter section' },
      { id: 'derivedItem', targetNodeId: 'article', title: 'De...' }
    ]);
  });

  it('appends the current node as a full-title final level when requested', () => {
    const nodesById = {
      folder: createNode('folder', 'Inbox', null, 'folder'),
      article: createNode('article', 'Article title', 'folder', 'topic'),
      current: createNode('current', '  ', 'article', 'item')
    };

    expect(buildBreadcrumbDisplayPath('current', nodesById, { includeCurrent: true, untitledLabel: 'Untitled' })).toEqual([
      { id: 'folder', targetNodeId: 'folder', title: 'Inbox' },
      { id: 'article', targetNodeId: 'article', title: 'Article title' },
      { id: 'current', isCurrent: true, targetNodeId: 'current', title: 'Untitled' }
    ]);
  });
});
