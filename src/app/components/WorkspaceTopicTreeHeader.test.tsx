import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { WorkspaceTopicTreeHeader } from './WorkspaceTopicTreeHeader';

it('adds a create topic action alongside current folder tools', () => {
  const onCreateTopic = vi.fn();

  render(
    <WorkspaceTopicTreeHeader
      onCollapseAll={vi.fn()}
      onCreateTopic={onCreateTopic}
      onExpandAll={vi.fn()}
      onSearchQueryChange={vi.fn()}
      searchQuery=""
    />
  );

  expect(screen.getByRole('button', { name: 'Expand all items' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collapse all items' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create topic' }));
  expect(onCreateTopic).toHaveBeenCalledTimes(1);
});
