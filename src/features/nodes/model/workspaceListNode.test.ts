import { expect, it } from 'vitest';

import type { Node } from './nodeTypes';
import {
  compareWorkspaceListNodeDateDesc,
  getWorkspaceListNodeAuthor,
  getWorkspaceListNodeDateLabel,
  getWorkspaceListNodeSummary,
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

it('falls back to the empty summary copy when no usable content remains', () => {
  expect(
    getWorkspaceListNodeSummary({
      content: '',
      title: 'Atlas'
    })
  ).toBe(WORKSPACE_LIST_SUMMARY_FALLBACK);
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
