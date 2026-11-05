import { expect, it } from 'vitest';

import { createExplicitArticleSnapshot, createNodeRecord } from '../../../shared/platform/companion/reading/companionReadableArticle.testSupport';
import { resolveReadableCompanionArticleByNodeId } from '../../../shared/platform/companionReadableArticle';

import { collectDocumentOutlineNavigation } from './documentOutlineNavigation';

it('uses resolved current-body anchors and actual object kinds, ordered and grouped by first range', () => {
  const snapshot = createExplicitArticleSnapshot();
  const content = '# Heading\nAlpha beta gamma delta';
  const anchor = (from: number, to: number) => ({ from, to, originalText: content.slice(from, to) });
  Object.assign(snapshot.nodesById, {
    'node-1': createNodeRecord({ id: 'node-1', content }),
    later: createNodeRecord({ id: 'later', parentNodeId: 'node-1', kind: 'item',
      anchorLink: { id: 'later', kind: 'highlight', locator: anchor(21, 26) } }),
    earlier: createNodeRecord({ id: 'earlier', parentNodeId: 'node-1',
      anchorLink: { id: 'earlier', kind: 'highlight', locator: { ranges: [anchor(27, 32), anchor(10, 15)] } } }),
    item: createNodeRecord({ id: 'item', parentNodeId: 'node-1', kind: 'item',
      anchorLink: { id: 'item', kind: 'cloze', locator: anchor(16, 20) } }),
    missing: createNodeRecord({ id: 'missing', parentNodeId: 'node-1',
      anchorLink: { id: 'missing', kind: 'highlight', locator: { from: 0, to: 7, originalText: 'missing passage' } } }),
    trashed: createNodeRecord({ id: 'trashed', parentNodeId: 'node-1',
      anchorLink: { id: 'trashed', kind: 'highlight', locator: anchor(10, 15) } }),
    other: createNodeRecord({ id: 'other', parentNodeId: 'node-2',
      anchorLink: { id: 'other', kind: 'highlight', locator: anchor(10, 15) } }),
    plain: createNodeRecord({ id: 'plain', parentNodeId: 'node-1', kind: 'item', reveal: 'Answer' }),
    pdf: createNodeRecord({ id: 'pdf', parentNodeId: 'node-1',
      anchorLink: { id: 'pdf', kind: 'highlight', locator: { page: 1, x: 0, y: 0 } } })
  });
  const article = resolveReadableCompanionArticleByNodeId({ ...snapshot, trashedNodeIds: ['trashed'] }, 'node-1')!;
  const pages = collectDocumentOutlineNavigation({ ...article, nodesById: snapshot.nodesById });
  expect(pages.outline).toEqual([{ from: 2, to: 9, level: 1, text: 'Heading' }]);
  expect(pages.topic).toEqual([{ from: 10, to: 15, nodeId: 'earlier', text: 'Alpha' }]);
  expect(pages.item).toEqual([
    { from: 16, to: 20, nodeId: 'item', text: 'beta' },
    { from: 21, to: 26, nodeId: 'later', text: 'gamma' }
  ]);
});
