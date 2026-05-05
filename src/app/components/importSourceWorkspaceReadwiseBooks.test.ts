import { beforeEach, expect, it, vi } from 'vitest';

const { openWorkspaceNodeWithPreparedDocument } = vi.hoisted(() => ({
  openWorkspaceNodeWithPreparedDocument: vi.fn()
}));

vi.mock('../../store/workspaceNodePreparation', () => ({
  openWorkspaceNodeWithPreparedDocument
}));

import { selectReadwiseBookNode } from './importSourceWorkspaceReadwiseBooks';

beforeEach(() => {
  vi.clearAllMocks();
});

it('uses the prepared open path when no external node selector is provided', () => {
  selectReadwiseBookNode('node-book-a');

  expect(openWorkspaceNodeWithPreparedDocument).toHaveBeenCalledWith('node-book-a');
});

it('delegates to the external selector when one is provided', () => {
  const onSelectNode = vi.fn();

  selectReadwiseBookNode('node-book-a', onSelectNode);

  expect(onSelectNode).toHaveBeenCalledWith('node-book-a');
  expect(openWorkspaceNodeWithPreparedDocument).not.toHaveBeenCalled();
});
