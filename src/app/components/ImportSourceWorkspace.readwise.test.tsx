import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

it('starts on Inbox and marks the active navigation item', () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.getByRole('button', { name: 'Inbox' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Readwise Books' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByLabelText('Inbox page')).toBeInTheDocument();
});

it('moves between readwise content pages from the left navigation', () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Books' }));
  expect(screen.getByRole('button', { name: 'Readwise Books' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Readwise Books page')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Articles' }));
  expect(screen.getByRole('button', { name: 'Readwise Articles' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Readwise Articles page')).toBeInTheDocument();
});
