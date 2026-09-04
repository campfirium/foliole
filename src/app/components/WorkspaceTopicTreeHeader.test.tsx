import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceTopicTreeHeader } from './WorkspaceTopicTreeHeader';

it('adds a create topic action alongside current folder tools', () => {
  const onCreateTopic = vi.fn();

  renderWithLocalization(
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
      sortKey="importedAt"
    />
  );

  expect(screen.getByRole('button', { name: 'Collapse all topics' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create topic' }));
  expect(onCreateTopic).toHaveBeenCalledTimes(1);
});

it('shows an expand action after some items are collapsed', () => {
  renderWithLocalization(
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
      sortKey="importedAt"
    />
  );

  expect(screen.getByRole('button', { name: 'Expand all topics' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Collapse all topics' })).toBeNull();
});

it('disables the toggle when the current folder has no collapsible items', () => {
  renderWithLocalization(
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
      sortKey="importedAt"
    />
  );

  expect(screen.getByRole('button', { name: 'Collapse all topics' })).toBeDisabled();
});

it('keeps the top toolbar sort tooltip above the trigger', async () => {
  renderWithLocalization(
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes
      hasCollapsedNodes={false}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onCreateTopic={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      sortDirection="desc"
      sortKey="lastOpenedAt"
    />
  );

  const trigger = screen.getByRole('button', { name: 'Sort list by Last opened' });
  fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
  fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });

  const tooltip = await screen.findByRole('tooltip');
  expect(tooltip).toHaveTextContent('Sort list by Last opened: Newest first');
  expect(tooltip.parentElement).toHaveAttribute('data-side', 'top');
  expect(tooltip.parentElement).not.toHaveAttribute('data-side', 'bottom');
});

it('keeps last opened order fixed to newest first', () => {
  renderWithLocalization(
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes
      hasCollapsedNodes={false}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onCreateTopic={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      sortDirection="asc"
      sortKey="lastOpenedAt"
    />
  );

  fireEvent.keyDown(screen.getByRole('button', { name: 'Sort list by Last opened' }), { key: 'ArrowDown' });

  expect(screen.getByRole('menuitem', { name: 'Newest first' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Oldest first' })).toBeNull();
});

it('shows manual sorting in the current folder topic menu', () => {
  renderWithLocalization(
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes
      hasCollapsedNodes={false}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onCreateTopic={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      sortDirection="desc"
      sortKey="modifiedAt"
    />
  );

  fireEvent.keyDown(screen.getByRole('button', { name: 'Sort list by Date modified' }), { key: 'ArrowDown' });

  expect(screen.getByRole('menuitem', { name: 'Manual' })).toBeInTheDocument();
});

it('keeps manual order fixed to manual order', () => {
  renderWithLocalization(
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes
      hasCollapsedNodes={false}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onCreateTopic={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      sortDirection="asc"
      sortKey="manual"
    />
  );

  fireEvent.keyDown(screen.getByRole('button', { name: 'Sort list by Manual' }), { key: 'ArrowDown' });

  expect(screen.getByRole('menuitem', { name: 'Manual order' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Newest first' })).toBeNull();
});

it('keeps the top toolbar focus tooltip above the trigger', async () => {
  renderWithLocalization(
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes
      hasCollapsedNodes={false}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onCreateTopic={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      sortDirection="desc"
      sortKey="lastOpenedAt"
    />
  );

  const trigger = screen.getByRole('button', { name: 'Hide dismissed and shelved topics' });
  fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
  fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });

  const tooltip = await screen.findByRole('tooltip');
  expect(tooltip).toHaveTextContent('Hide dismissed and shelved topics');
  expect(tooltip.parentElement).toHaveAttribute('data-side', 'top');
  expect(tooltip.parentElement).not.toHaveAttribute('data-side', 'bottom');
});

it('disables topic focus in views where it does not apply', () => {
  const onToggleDismissedTopicsVisibility = vi.fn();
  renderWithLocalization(
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes
      hasCollapsedNodes={false}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onCreateTopic={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      onToggleDismissedTopicsVisibility={onToggleDismissedTopicsVisibility}
      searchQuery=""
      topicFocusAvailable={false}
      sortDirection="desc"
      sortKey="lastOpenedAt"
      viewHideDismissedTopics
    />
  );

  const topicFocusButton = screen.getByRole('button', { name: 'Hide dismissed and shelved topics' });
  expect(topicFocusButton).toBeDisabled();
  fireEvent.click(topicFocusButton);
  expect(onToggleDismissedTopicsVisibility).not.toHaveBeenCalled();
});

it('shows the focus tooltip as the next toggle action when focus is active', async () => {
  renderWithLocalization(
    <WorkspaceTopicTreeHeader
      hasCollapsibleNodes
      hasCollapsedNodes={false}
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onCreateTopic={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      sortDirection="desc"
      sortKey="lastOpenedAt"
      viewHideDismissedTopics
    />
  );

  const trigger = screen.getByRole('button', { name: 'Show all topics' });
  fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
  fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });

  const tooltip = await screen.findByRole('tooltip');
  expect(tooltip).toHaveTextContent('Show all topics');
  expect(tooltip.parentElement).toHaveAttribute('data-side', 'top');
  expect(tooltip.parentElement).not.toHaveAttribute('data-side', 'bottom');
});
