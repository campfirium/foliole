import { describe, expect, it } from 'vitest';

import { buildBreadcrumbDisplayPath, type BreadcrumbDisplayPathNode } from './breadcrumbDisplayPath';

function createNode(
  id: string,
  title: string,
  parentNodeId: string | null,
  kind?: BreadcrumbDisplayPathNode['kind']
): BreadcrumbDisplayPathNode {
  return {
    id,
    kind,
    parentNodeId,
    title
  };
}

describe('buildBreadcrumbDisplayPath', () => {
  it('returns ancestors only and excludes the current node', () => {
    const nodesById = {
      folder: createNode('folder', 'Inbox', null, 'folder'),
      article: createNode('article', 'Article title', 'folder', 'topic'),
      current: createNode('current', 'Current item', 'article', 'item')
    };

    expect(buildBreadcrumbDisplayPath('current', nodesById).map((item) => item.title)).toEqual(['Inbox', 'Article title']);
  });

  it('abbreviates ancestor titles after the article node', () => {
    const nodesById = {
      folder: createNode('folder', 'Inbox', null, 'folder'),
      article: createNode('article', 'Article title', 'folder', 'topic'),
      nestedTopic: createNode('nestedTopic', '标注节点标题', 'article', 'topic'),
      nestedItem: createNode('nestedItem', '挖空卡片标题', 'nestedTopic', 'item'),
      current: createNode('current', '当前节点', 'nestedItem', 'item')
    };

    expect(buildBreadcrumbDisplayPath('current', nodesById).map((item) => item.title)).toEqual([
      'Inbox',
      'Article title',
      '标注...',
      '挖空...'
    ]);
  });
});
