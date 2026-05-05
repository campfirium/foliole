import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { NodeListHeader } from './NodeListHeader';

it('renders node list actions inside the shared toolbar group', () => {
  const onCreateCommand = vi.fn();

  render(
    <NodeListHeader
      isTrashViewOpen={false}
      onCollapseAll={vi.fn()}
      onCreateCommand={onCreateCommand}
      onEmptyTrash={vi.fn()}
      onExpandAll={vi.fn()}
      onOpenNotesView={vi.fn()}
      trashCount={0}
    />
  );

  expect(screen.getByLabelText('Node list actions')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collapse all' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Create' }), { key: 'ArrowDown' });

  expect(screen.getByRole('menuitem', { name: 'Create Folder' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Create Topic' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Create Item' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('menuitem', { name: 'Create Topic' }));
  expect(onCreateCommand).toHaveBeenCalledWith('workspace.createTopic');
});
