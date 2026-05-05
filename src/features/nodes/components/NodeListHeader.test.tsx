import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { NodeListHeader } from './NodeListHeader';

it('renders node list actions inside the shared toolbar group', () => {
  const onCreateCommand = vi.fn();

  render(
    <NodeListHeader
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      onCollapseAll={vi.fn()}
      onCreateCommand={onCreateCommand}
      onEmptyTrash={vi.fn()}
      onExpandAll={vi.fn()}
      onOpenNotesView={vi.fn()}
      onSearchQueryChange={vi.fn()}
      searchQuery=""
      trashCount={0}
    />
  );

  expect(screen.getByLabelText('Node list actions')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  expect(screen.getByRole('searchbox', { name: 'Search node titles' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collapse all' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Create' }), { key: 'ArrowDown' });

  expect(screen.getByRole('menuitem', { name: 'Create Folder' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Create Topic' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Create Item' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Create Virtual Folder' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('menuitem', { name: 'Create Topic' }));
  expect(onCreateCommand).toHaveBeenCalledWith('workspace.createTopic');
});

it('can hide title search when used as a grouping column header', () => {
  render(
    <NodeListHeader
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      onCollapseAll={vi.fn()}
      onCreateCommand={vi.fn()}
      onEmptyTrash={vi.fn()}
      onExpandAll={vi.fn()}
      onOpenNotesView={vi.fn()}
      onSearchQueryChange={vi.fn()}
      searchQuery=""
      showTitleSearch={false}
      trashCount={0}
    />
  );

  expect(screen.queryByRole('button', { name: 'Open title search' })).toBeNull();
});
