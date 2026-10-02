import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, getCurrentReviewSchedulerSettings, hydrateCurrentReviewSchedulerSettings } from '../model/reviewSchedulerSettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});

it('lets users choose a balancing window from one to ninety-nine days', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="review" />);
  const input = await screen.findByRole('spinbutton', { name: 'New item load balancing' });
  expect(input).toHaveValue(7);
  expect(input).toHaveAttribute('min', '1');
  expect(input).toHaveAttribute('max', '99');
  fireEvent.change(input, { target: { value: '1' } });
  await waitFor(() => expect(getCurrentReviewSchedulerSettings().newItemLoadBalancingDays).toBe(1));
  fireEvent.change(input, { target: { value: '99' } });
  await waitFor(() => expect(getCurrentReviewSchedulerSettings().newItemLoadBalancingDays).toBe(99));
  for (const value of ['0', '100', '1.5']) {
    fireEvent.change(input, { target: { value } });
    expect(getCurrentReviewSchedulerSettings().newItemLoadBalancingDays).toBe(99);
  }
});
