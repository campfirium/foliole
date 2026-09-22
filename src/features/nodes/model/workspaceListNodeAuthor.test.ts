import { expect, it } from 'vitest';

import { getWorkspaceListNodeAuthor } from './workspaceListNodeMetadata';

it('uses projected author text only while the document body is unloaded', () => {
  expect(getWorkspaceListNodeAuthor({
    authorText: 'Ada',
    bodyStatus: 'ready',
    content: '',
    hasContent: true
  })).toBe('Ada');
  expect(getWorkspaceListNodeAuthor({
    authorText: 'Ada',
    bodyStatus: 'ready',
    content: '---\nauthor: Grace\n---\nEdited body',
    hasContent: true
  })).toBe('Grace');
});
