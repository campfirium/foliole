import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { WorkspaceTopicTreeHeader } from './WorkspaceTopicTreeHeader';

it('adds a create topic action alongside current folder tools', () => {
  const onCreateTopic = vi.fn();

  render(
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes
      hasCollapsedNodes={false}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onCreateTopic={onCreateTopic}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      sortDirection="desc"
      sortKey="savedAt"
    />
  );

  expect(screen.getByRole('button', { name: 'Collapse all topics' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create topic' }));
  expect(onCreateTopic).toHaveBeenCalledTimes(1);
});

it('shows an expand action after some items are collapsed', () => {
  render(
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes
      hasCollapsedNodes
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onCreateTopic={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      sortDirection="desc"
      sortKey="savedAt"
    />
  );

  expect(screen.getByRole('button', { name: 'Expand all topics' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Collapse all topics' })).toBeNull();
});

it('disables the toggle when the current folder has no collapsible items', () => {
  render(
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes={false}
      hasCollapsedNodes={false}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onCreateTopic={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      sortDirection="desc"
      sortKey="savedAt"
    />
  );

  expect(screen.getByRole('button', { name: 'Collapse all topics' })).toBeDisabled();
});
