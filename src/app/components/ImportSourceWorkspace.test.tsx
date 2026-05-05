import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

it('shows the import management navigation shell without readwise settings controls', () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.getByRole('heading', { name: 'Import management' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Import management navigation' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise Books' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise Articles' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
  expect(screen.queryByText('Readwise Reader settings')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open Readwise Reader settings' })).not.toBeInTheDocument();
});

it('switches the content container when a navigation item is selected', () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Books' }));
  expect(screen.getByRole('heading', { name: 'Readwise Books' })).toBeInTheDocument();
  expect(screen.getByText('Readwise book content will appear here once the list view is ready.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Articles' }));
  expect(screen.getByRole('heading', { name: 'Readwise Articles' })).toBeInTheDocument();
  expect(screen.getByText('Readwise article content will appear here once the list view is ready.')).toBeInTheDocument();
});

it('closes import management from the header close button', () => {
  const onOpenChange = vi.fn();

  render(<ImportSourceWorkspace onOpenChange={onOpenChange} open />);
  fireEvent.click(screen.getByRole('button', { name: 'Close import management' }));

  expect(onOpenChange).toHaveBeenCalledWith(false);
});
