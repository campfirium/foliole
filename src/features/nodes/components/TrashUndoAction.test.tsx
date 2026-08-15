import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { clearAppRuntimeNotice, showAppRuntimeNotice } from '../../../shared/ui/AppRuntimeNotice';

import { TrashUndoAction } from './TrashUndoAction';

let noticeId: number | null = null;

afterEach(() => {
  if (noticeId) clearAppRuntimeNotice(noticeId);
  noticeId = null;
});

it('shows only the contextual restore icon and tooltip for a Trash-row notice', async () => {
  const onSelect = vi.fn();
  noticeId = showAppRuntimeNotice(
    'Topic moved to Trash',
    'success',
    { label: 'Undo', onSelect },
    { durationMs: 8000, presentation: 'trash-row' }
  );
  render(<TrashUndoAction />);

  const undo = screen.getByRole('button', { name: 'Restore last deleted item' });
  expect(undo).toBeVisible();
  expect(screen.queryByText('Topic moved to Trash')).not.toBeInTheDocument();
  fireEvent.pointerMove(undo, { pointerType: 'mouse' });
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Restore last deleted item');
  fireEvent.click(undo);
  expect(onSelect).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Restore last deleted item' })).not.toBeInTheDocument();
  noticeId = null;
});

it('does not occupy the Trash row for ordinary runtime notices', () => {
  noticeId = showAppRuntimeNotice('Import failed', 'error');
  render(<TrashUndoAction />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
