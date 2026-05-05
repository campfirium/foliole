import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { NodeListHeader } from './NodeListHeader';

it('renders node list actions inside the shared toolbar group', () => {
  const onCreateCommand = vi.fn();

  render(
    <NodeListHeader
      hasCollapsibleNodes
      hasCollapsedNodes={false}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      onCreateCommand={onCreateCommand}
      onEmptyTrash={vi.fn()}
      onOpenNotesView={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      trashCount={0}
    />
  );

  expect(screen.getByLabelText('Topic list actions')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  expect(screen.getByRole('searchbox', { name: 'Search topic titles' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create folder' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collapse all' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));
  expect(onCreateCommand).toHaveBeenCalledWith('workspace.createFolder');
});

it('can hide title search when used as a grouping column header', () => {
  render(
    <NodeListHeader
      hasCollapsibleNodes
      hasCollapsedNodes={false}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      onCreateCommand={vi.fn()}
      onEmptyTrash={vi.fn()}
      onOpenNotesView={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      showTitleSearch={false}
      trashCount={0}
    />
  );

  expect(screen.queryByRole('button', { name: 'Open title search' })).toBeNull();
});

it('keeps the shared header height in the virtual section when actions are present', () => {
  render(
    <NodeListHeader
      hasCollapsibleNodes
      hasCollapsedNodes={false}
      isTrashViewOpen={false}
      isVirtualViewOpen
      onCreateCommand={vi.fn()}
      onEmptyTrash={vi.fn()}
      onOpenNotesView={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      trashCount={0}
    />
  );

  expect(screen.getByRole('banner')).toHaveClass('min-h-[var(--workspace-top-toolbar-height)]');
});

it('does not render an empty header shell for the virtual section', () => {
  render(
    <NodeListHeader
      hasCollapsibleNodes
      hasCollapsedNodes={false}
      isTrashViewOpen={false}
      isVirtualViewOpen
      onCreateCommand={vi.fn()}
      onEmptyTrash={vi.fn()}
      onOpenNotesView={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      showTitleSearch={false}
      showVirtualCreateAction={false}
      trashCount={0}
    />
  );

  expect(screen.queryByRole('banner')).toBeNull();
});

it('switches the toolbar toggle label when the list has collapsed nodes', () => {
  render(
    <NodeListHeader
      hasCollapsibleNodes
      hasCollapsedNodes
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      onCreateCommand={vi.fn()}
      onEmptyTrash={vi.fn()}
      onOpenNotesView={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      trashCount={0}
    />
  );

  expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Collapse all' })).toBeNull();
});

it('disables the toggle when no nodes can be collapsed', () => {
  render(
    <NodeListHeader
      hasCollapsibleNodes={false}
      hasCollapsedNodes={false}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      onCreateCommand={vi.fn()}
      onEmptyTrash={vi.fn()}
      onOpenNotesView={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onToggleCollapseAll={vi.fn()}
      searchQuery=""
      trashCount={0}
    />
  );

  expect(screen.getByRole('button', { name: 'Collapse all' })).toBeDisabled();
});
