import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { NodeListHeader } from './NodeListHeader';

it('renders node list actions inside the shared toolbar group', () => {
  render(
    <NodeListHeader
      isTrashViewOpen={false}
      onCollapseAll={vi.fn()}
      onCreateRootNode={vi.fn()}
      onEmptyTrash={vi.fn()}
      onExpandAll={vi.fn()}
      onOpenNotesView={vi.fn()}
      trashCount={0}
    />
  );

  expect(screen.getByLabelText('Node list actions')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collapse all' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
});
