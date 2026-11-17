import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceMoveToPalette } from './WorkspaceMoveToPalette';

function folder(id: string, title: string, parentNodeId: string | null = null) {
  return { id, title, parentNodeId, kind: 'folder' as const, hasContent: false, hasReveal: false,
    review: null, createdAt: '', updatedAt: '' };
}

it('searches the full destination list and immediately moves to the keyboard selection', async () => {
  const move = vi.fn();
  const top = folder('shelf', 'Shelf');
  const children = Array.from({ length: 48 }, (_, index) => folder(`folder-${index}`, `Destination ${index}`, top.id));
  const nodesById = Object.fromEntries([top, ...children].map((entry) => [entry.id, entry]));
  function Harness() {
    const [open, setOpen] = useState(true);
    return open ? <WorkspaceMoveToPalette state={{
      isOpen: true,
      sourceTitle: 'How habits form',
      nodeOrder: Object.keys(nodesById),
      nodesById,
      recentNodeIds: [],
      trashedNodeIds: [],
      onClose: () => setOpen(false),
      onOpenNode: (id) => { move(id); setOpen(false); }
    }} /> : null;
  }
  renderWithLocalization(<Harness />);

  const dialog = screen.getByRole('dialog', { name: 'Move to' });
  const input = within(dialog).getByRole('textbox', { name: 'Move “How habits form” to…' });
  const toggle = within(dialog).getByRole('button', { name: 'Show shortcuts' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(within(dialog).getByText('Navigate')).toBeVisible();

  fireEvent.change(input, { target: { value: 'Shelf / Destination 4' } });
  expect(within(dialog).getByRole('button', { name: 'Shelf / Destination 47' })).toBeVisible();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Move to' })).not.toBeInTheDocument());
  expect(move).toHaveBeenCalledExactlyOnceWith('folder-40');
});
