import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { HelpSearch } from './HelpSearch';

it('shows the first help batch before searching', async () => {
  render(<HelpSearch isOpen onClose={() => undefined} />);

  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search help' })).toHaveFocus());
  expect(screen.getByRole('dialog', { name: 'Help Search' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Relearn/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Topic Term/ })).not.toBeInTheDocument();
});

it('filters action help results from action help copy', () => {
  const onClose = vi.fn();
  render(<HelpSearch isOpen onClose={onClose} />);

  fireEvent.change(screen.getByRole('textbox', { name: 'Search help' }), { target: { value: 'study' } });

  expect(screen.getByRole('button', { name: /Relearn/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Action help cards/ })).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});

it('does not navigate from action help results and closes on Escape', () => {
  const onClose = vi.fn();
  render(<HelpSearch isOpen onClose={onClose} />);

  const input = screen.getByRole('textbox', { name: 'Search help' });
  fireEvent.change(input, { target: { value: 'relearn' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(onClose).not.toHaveBeenCalled();

  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('shows an empty state when no help matches', () => {
  render(<HelpSearch isOpen onClose={() => undefined} />);

  fireEvent.change(screen.getByRole('textbox', { name: 'Search help' }), { target: { value: 'zzzz' } });

  expect(screen.getByText('No matching action help')).toBeInTheDocument();
});
