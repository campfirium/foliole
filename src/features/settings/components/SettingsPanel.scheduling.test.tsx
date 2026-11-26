import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

it('shows FSRS example counts and updates Flow examples when the settings change', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="review" />);

  expect(screen.getByText(/With targets of 80%, 85%, 90%, and 95%, FSRS estimates 2, 2, 3, and 6 first-year reviews/)).toBeVisible();

  const queueExample = screen.getByRole('table', { name: 'Chance of selecting each queue next' });
  expect(within(queueExample).getByRole('cell', { name: '17.6%' })).toBeVisible();
  expect(screen.getByText(/83.3% and 16.7%/)).toBeVisible();

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Priority ratio' }), { target: { value: '1' } });
  await waitFor(() => expect(screen.getByText(/50.0% and 50.0%/)).toBeVisible());
  expect(within(queueExample).getAllByRole('cell', { name: '11.1%' })).toHaveLength(9);

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Review item queue mix ratio' }), { target: { value: '3' } });
  expect(await screen.findByText(/review 3 Items then read 1 Topic/)).toBeVisible();
});

it('puts the day unit in each interval heading and explains the Later default', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="review" />);

  const intervals = [
    ['Maximum review interval (days)', 'Maximum interval days', 36500],
    ['First review for new Items (days)', 'First review for new Items (days)', 7],
    ['Reading initial interval (days)', 'Reading initial interval days', 1],
    ['Custom Later interval (days)', 'Custom Later interval (days)', 0]
  ] as const;

  for (const [title, name, value] of intervals) {
    const heading = screen.getByRole('heading', { level: 4, name: title });
    const row = heading.closest<HTMLElement>('[data-settings-row]')!;
    expect(within(row).getByRole('spinbutton', { name })).toHaveValue(value);
    expect(within(row).queryByText(/^days?$/)).not.toBeInTheDocument();
  }

  expect(screen.getByText(/0 uses the automatically calculated shorter interval/)).toBeVisible();
});

it('shows reading growth at P1 and P9 using the selected range', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="review" />);

  expect(screen.getByRole('heading', { name: 'Reading interval growth factor' })).toBeVisible();
  expect(screen.getByText(/11 days for a P1 Topic and 15 days for a P9 Topic/)).toBeVisible();

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Reading growth factor min' }), { target: { value: '1.2' } });
  expect(await screen.findByText(/12 days for a P1 Topic and 15 days for a P9 Topic/)).toBeVisible();
});
