import { expect, it } from 'vitest';

import type { Node } from './nodeTypes';
import {
  compareWorkspaceListNodeDateDesc,
  getWorkspaceListNodeAuthor,
  getWorkspaceListNodeDateLabel,
  getWorkspaceListNodeOpening,
  getWorkspaceListNodeSummary,
  projectWorkspaceListNodesById,
  toWorkspaceListNode,
  WORKSPACE_LIST_DATE_FALLBACK,
  WORKSPACE_LIST_SUMMARY_FALLBACK
} from './workspaceListNode';
import { compareWorkspaceListNodeAuthor } from './workspaceListNodeMetadata';

it('keeps the list-layer projection lightweight', () => {
  const heavyNode: Node = {
    id: 'node-1',
    parentNodeId: null,
    kind: 'item',
    title: 'Atlas',
    content: 'Long body '.repeat(500),
    reveal: 'Answer '.repeat(200),
    review: null,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z'
  };

  const listNode = toWorkspaceListNode(heavyNode);

  expect(listNode).toMatchObject({
    hasContent: true,
    hasReveal: true,
    id: 'node-1',
    title: 'Atlas'
  });
  expect(Object.keys(listNode)).not.toContain('content');
  expect(Object.keys(listNode)).not.toContain('reveal');
});

it('extracts summary from body content, skips frontmatter, and truncates long text', () => {
  const summary = getWorkspaceListNodeSummary({
    content: ['---', 'author: Ada', '---', '# Atlas', '', 'Atlas: ' + 'Useful detail '.repeat(20)].join('\n'),
    title: 'Atlas'
  });

  expect(summary.startsWith('Useful detail Useful detail')).toBe(true);
  expect(summary).not.toContain('author: Ada');
  expect(summary.endsWith('…')).toBe(true);
  expect(summary.length).toBeLessThanOrEqual(161);
});

it('strips opaque anchor tags when building the list summary', () => {
  const summary = getWorkspaceListNodeSummary({
    content: '<highlight id="anchor-1">Atlas</highlight id="anchor-1">: useful detail',
    title: 'Atlas'
  });

  expect(summary).toBe('useful detail');
});

it('falls back to the empty summary copy when no usable content remains', () => {
  expect(
    getWorkspaceListNodeSummary({
      content: '',
      title: 'Atlas'
    })
  ).toBe(WORKSPACE_LIST_SUMMARY_FALLBACK);
});

it('uses the opening from the list snapshot when body content is not loaded', () => {
  expect(
    getWorkspaceListNodeOpening({
      content: '',
      kind: 'topic',
      openingText: 'Tiny changes compound into remarkable results.',
      title: 'Atomic Habits'
    })
  ).toBe('Tiny changes compound into remarkable results.');
});

it('truncates the opening preview to about 200 characters', () => {
  const opening = getWorkspaceListNodeOpening({
    content: '# Atomic Habits\n\n' + 'Tiny changes compound into remarkable results '.repeat(6),
    kind: 'topic',
    title: 'Atomic Habits'
  });

  expect(opening.endsWith('…')).toBe(true);
  expect(opening.length).toBeLessThanOrEqual(201);
});

it('skips a leading h1 line when building the opening preview', () => {
  expect(
    getWorkspaceListNodeOpening({
      content: '# Atomic Habits\nTiny changes compound into remarkable results.',
      kind: 'topic',
      title: 'Atomic Habits'
    })
  ).toBe('Tiny changes compound into remarkable results.');
});

it('skips repeated chapter title echoes before the real body opening', () => {
  const opening = getWorkspaceListNodeOpening({
    content: [
      '# 第一章 持续盈利创业',
      '',
      '## 第一章',
      '持续盈利创业',
      '',
      '万事万物，皆生于细微。^[1]',
      '',
      '彼得是一名生活在美国亚特兰大的网页开发人员。'
    ].join('\n'),
    kind: 'topic',
    title: '持续盈利创业'
  });

  expect(opening.startsWith('万事万物，皆生于细微。^[1]')).toBe(true);
  expect(opening).toContain('彼得是一名生活在美国亚特兰大的网页开发人员。');
});

it('falls back to the stored opening when loaded body content is only a PDF placeholder', () => {
  expect(
    getWorkspaceListNodeOpening({
      content: '# Paper\n\nLinked PDF source ready for the reader surface.',
      kind: 'topic',
      openingText: 'The real PDF body starts here.',
      title: 'Paper'
    })
  ).toBe('The real PDF body starts here.');
});

it('skips cover-only content when deciding the opening preview', () => {
  expect(
    getWorkspaceListNodeOpening({
      content: '# Book Title\n\n![Cover](asset://cover.png)',
      kind: 'topic',
      openingText: 'Chapter one body starts here.',
      title: 'Book Title'
    })
  ).toBe('Chapter one body starts here.');
});

it('prefers the stored opening over cover-like loaded body content', () => {
  expect(
    getWorkspaceListNodeOpening({
      content: '![Cover](asset://cover.png)',
      kind: 'topic',
      openingText: '第二章 从社区看书 他对于健身和营养的内容了解得越多，分享得就越多。',
      title: '小而美'
    })
  ).toBe('第二章 从社区看书 他对于健身和营养的内容了解得越多，分享得就越多。');
});

it('suppresses opening previews for folder rows', () => {
  expect(
    getWorkspaceListNodeOpening({
      content: '# Folder\n\nChild intro text.',
      kind: 'folder',
      openingText: 'Child intro text.',
      title: 'Folder'
    })
  ).toBe('No opening yet.');
});

it('keeps author display and sorting on the same fallback rule', () => {
  const namedAuthorNode = {
    content: ['---', 'author: Ada', '---', '# Named author'].join('\n'),
    title: 'Named author'
  };
  const missingAuthorANode = {
    content: '# No author A\n\nBody only',
    title: 'No author A'
  };
  const missingAuthorBNode = {
    content: '# No author B\n\nBody only',
    title: 'No author B'
  };

  expect(getWorkspaceListNodeAuthor(namedAuthorNode)).toBe('Ada');
  expect(getWorkspaceListNodeAuthor(missingAuthorANode)).toBeNull();
  expect(compareWorkspaceListNodeAuthor(namedAuthorNode, missingAuthorANode)).toBeLessThan(0);
  expect(compareWorkspaceListNodeAuthor(missingAuthorANode, missingAuthorBNode)).toBeLessThan(0);
});

it('uses the same date fallback chain for display and descending comparison', () => {
  const createdFallbackNode = {
    createdAt: '2026-04-03T09:00:00.000Z',
    updatedAt: ''
  };
  const updatedNode = {
    createdAt: '2026-04-01T09:00:00.000Z',
    updatedAt: '2026-04-02T09:00:00.000Z'
  };
  const unknownNode = {
    createdAt: '',
    updatedAt: ''
  };

  expect(getWorkspaceListNodeDateLabel(createdFallbackNode)).toBe('2026-04-03');
  expect(compareWorkspaceListNodeDateDesc(createdFallbackNode, updatedNode)).toBeLessThan(0);
  expect(getWorkspaceListNodeDateLabel(unknownNode)).toBe(WORKSPACE_LIST_DATE_FALLBACK);
});

it('reuses the list projection when only document body fields change', () => {
  const initialNodesById: Record<string, Node> = {
    'node-1': {
      id: 'node-1',
      parentNodeId: null,
      kind: 'topic',
      title: 'Atlas',
      content: 'Version 1',
      reveal: '',
      review: null,
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:00.000Z'
    }
  };
  const initialProjection = projectWorkspaceListNodesById(initialNodesById);
  const nextProjection = projectWorkspaceListNodesById(
    {
      'node-1': {
        ...initialNodesById['node-1'],
        content: 'Version 2',
        reveal: 'Answer 2'
      }
    },
    initialProjection
  );

  expect(nextProjection).toBe(initialProjection);
  expect(nextProjection['node-1']).toBe(initialProjection['node-1']);
});

it('refreshes only the changed list projection when list-visible fields change', () => {
  const initialNodesById: Record<string, Node> = {
    'node-1': {
      id: 'node-1',
      parentNodeId: null,
      kind: 'topic',
      title: 'Atlas',
      content: '',
      reveal: '',
      review: null,
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:00.000Z'
    },
    'node-2': {
      id: 'node-2',
      parentNodeId: null,
      kind: 'topic',
      title: 'Inbox child',
      content: '',
      reveal: '',
      review: null,
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:00.000Z'
    }
  };
  const initialProjection = projectWorkspaceListNodesById(initialNodesById);
  const nextProjection = projectWorkspaceListNodesById(
    {
      ...initialNodesById,
      'node-1': {
        ...initialNodesById['node-1'],
        title: 'Atlas renamed'
      }
    },
    initialProjection
  );

  expect(nextProjection).not.toBe(initialProjection);
  expect(nextProjection['node-1']).not.toBe(initialProjection['node-1']);
  expect(nextProjection['node-2']).toBe(initialProjection['node-2']);
});
