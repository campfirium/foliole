// eslint-disable-next-line import/order -- Load native test mocks before modules that register plugins.
import { host, open } from '../test/companionReminderTestSupport';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { startCompanionForegroundReminders } from '../shared/platform/companion/settings/companionForegroundReminders';

import { CompanionReminderSettingsContent } from './CompanionReminderSettingsContent';

const lifecycle = vi.hoisted(() => ({ active: true, listener: undefined as ((active: boolean) => void) | undefined }));
vi.mock('../shared/platform/appLifecycle', () => ({
  readNativeAppActiveState: async () => lifecycle.active,
  subscribeNativeAppActiveState: async (listener: typeof lifecycle.listener) => {
    lifecycle.listener = listener;
    return () => { lifecycle.listener = undefined; };
  }
}));

it('starts a fresh foreground countdown after leaving the app and fires once', async () => {
  await open('ios', 'foliole-foreground-reminder-');
  render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  const toggle = await screen.findByRole('switch', { name: 'Enabled: ☕' });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toBeChecked());
  await waitFor(() => expect(toggle).toBeEnabled());
  expect(host.pending.size).toBe(0);

  const timers = vi.spyOn(globalThis, 'setTimeout');
  const stop = startCompanionForegroundReminders();
  const countdowns = () => timers.mock.calls.filter(([, delay]) => delay === 20 * 60_000);
  try {
    await waitFor(() => expect(countdowns()).toHaveLength(1));
    const expiredTimer = countdowns()[0]?.[0];
    lifecycle.active = false;
    lifecycle.listener?.(false);
    lifecycle.active = true;
    lifecycle.listener?.(true);
    await waitFor(() => expect(countdowns()).toHaveLength(2));
    if (typeof expiredTimer !== 'function') throw new Error('Missing first countdown.');
    await act(async () => { expiredTimer(); });
    expect(host.pending.size).toBe(0);

    const currentTimer = countdowns()[1]?.[0];
    if (typeof currentTimer !== 'function') throw new Error('Missing restarted countdown.');
    await act(async () => { currentTimer(); });
    expect([...host.pending.values()].map(item => item.body)).toEqual(['☕']);
  } finally {
    stop();
    timers.mockRestore();
  }
});
