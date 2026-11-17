import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

vi.doUnmock('../app/components/WorkspaceSettingsOverlay');

const { App } = await import('../app/App');

it('opens and highlights a setting selected from the command palette', async () => {
  const scrollIntoView = vi.fn();
  const previousScrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scrollIntoView;

  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Command Palette' }));
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    const input = within(palette).getByLabelText('Search commands');
    expect(within(palette).queryByRole('button', { name: /App language/ })).toBeNull();

    fireEvent.change(input, { target: { value: 'App language' } });
    expect(within(palette).getByRole('button', { name: /App language.*General/ })).toBeInTheDocument();
    expect(within(palette).queryByRole('button', { name: /Configure shortcut for App language/ })).toBeNull();
    expect(within(palette).getByRole('button', { name: /App language.*General/ }).parentElement)
      .toHaveAttribute('data-active', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
    await waitFor(() => expect(document.querySelector('[data-settings-search-row-id="general-language"]'))
      .toHaveClass('bg-[rgb(var(--role-accent-rgb)_/_0.12)]'), { timeout: 5_000 });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  } finally {
    HTMLElement.prototype.scrollIntoView = previousScrollIntoView;
  }
});

it('orders commands, settings, and tips and expands a text result in place', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Command Palette' }));
  const palette = await screen.findByRole('dialog', { name: 'Command palette' });
  const input = within(palette).getByLabelText('Search commands');
  expect(within(palette).queryByText('Action tips')).toBeNull();

  fireEvent.change(input, { target: { value: 'review' } });
  const command = within(palette).getByRole('button', { name: /^open review statistics$/i });
  const settings = within(palette).getByRole('button', { name: 'Review' });
  const tipsHeading = within(palette).getByText('Action tips');
  expect(command.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(settings.compareDocumentPosition(tipsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  fireEvent.change(input, { target: { value: 'You could not recall' } });
  const tip = within(palette).getByRole('button', { name: /Again.*Flow Ribbon/ });
  expect(tip).toHaveAttribute('aria-expanded', 'false');
  expect(within(palette).queryByText('Show this item again soon.')).toBeNull();

  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(tip).toHaveAttribute('aria-expanded', 'false');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(tip).toHaveAttribute('aria-expanded', 'true');
  expect(within(palette).getByText('Show this item again soon.')).toBeInTheDocument();
  expect(within(palette).getByText('You could not recall the answer.')).toBeInTheDocument();
  expect(input).toHaveFocus();
  fireEvent.click(tip);
  expect(tip).toHaveAttribute('aria-expanded', 'false');
});
