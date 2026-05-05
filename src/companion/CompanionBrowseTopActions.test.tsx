import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CompanionBrowseTopActions } from './CompanionBrowseTopActions';

it('opens sort choices from the browse menu sort row', () => {
  render(
    <CompanionBrowseTopActions
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onOpenCapture={vi.fn()}
      sortDirection="desc"
      sortKey="dateLastOpened"
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  expect(screen.getByRole('dialog', { name: 'Browse menu' })).toBeInTheDocument();
  expect(screen.queryByText('Recent -> Older')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Sort Last opened' }));
  const sortDialog = screen.getByRole('dialog', { name: 'Sort' });

  expect(within(sortDialog).getByText('Order by')).toBeInTheDocument();
  expect(within(sortDialog).getByText('Recent -> Older')).toBeInTheDocument();
  expect(within(sortDialog).getByText('Older -> Recent')).toBeInTheDocument();
  expect(within(sortDialog).getByText('Sort by')).toBeInTheDocument();
  expect(within(sortDialog).getByText('Date imported')).toBeInTheDocument();
  expect(within(sortDialog).getByText('Date modified')).toBeInTheDocument();
  expect(within(sortDialog).queryByText('Title')).not.toBeInTheDocument();
});

it('runs sync from the browse menu', () => {
  const onSync = vi.fn();
  render(
    <CompanionBrowseTopActions
      onChangeSortDirection={vi.fn()}
      onChangeSortKey={vi.fn()}
      onOpenCapture={vi.fn()}
      onSync={onSync}
      sortDirection="desc"
      sortKey="dateLastOpened"
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sync' }));

  expect(onSync).toHaveBeenCalledTimes(1);
});
