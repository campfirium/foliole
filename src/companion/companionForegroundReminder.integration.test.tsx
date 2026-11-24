// eslint-disable-next-line import/order -- Load native test mocks before modules that register plugins.
import { host, open } from '../test/companionReminderTestSupport';

import { LocalNotifications } from '@capacitor/local-notifications';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { startCompanionForegroundReminders } from '../shared/platform/companion/settings/companionForegroundReminders';
import { loadCompanionReminderDevice, saveCompanionReminderRule } from '../shared/platform/companion/settings/companionReminderRepository';

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

it.each(['unrelated', 'same'] as const)('checks the due rule after saving a %s-rule update during dispatch', async changed => {
  await open('ios', 'foliole-due-reminder-');
  const rule = {
    id: crypto.randomUUID(), revision: crypto.randomUUID(), message: 'Take a break',
    trigger: { kind: 'foreground', minutes: 1 } as const,
    device: await loadCompanionReminderDevice(), enabled: true
  };
  await saveCompanionReminderRule(rule);
  const timers = vi.spyOn(globalThis, 'setTimeout');
  const stop = startCompanionForegroundReminders();
  const countdowns = () => timers.mock.calls.filter(([, delay]) => delay === 60_000);
  const waiting = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof LocalNotifications.getPending>>>();
  const getPending = vi.spyOn(LocalNotifications, 'getPending').mockImplementationOnce(() => {
    waiting.resolve();
    return pending.promise;
  });
  try {
    await waitFor(() => expect(countdowns()).toHaveLength(1));
    const callback = countdowns()[0]?.[0];
    if (typeof callback !== 'function') throw new Error('Missing due countdown.');
    await act(async () => { callback(); await waiting.promise; });

    const updated = changed === 'same'
      ? { ...rule, message: 'Updated break reminder' }
      : { ...rule, id: crypto.randomUUID(), trigger: { kind: 'daily', time: '10:00' } as const };
    await act(async () => { await saveCompanionReminderRule({ ...updated, revision: crypto.randomUUID() }); });
    await act(async () => { pending.resolve({ notifications: [] }); });

    expect([...host.pending.values()].map(item => item.body)).toEqual(changed === 'same' ? [] : [rule.message]);
    if (changed === 'same') {
      await waitFor(() => expect(countdowns()).toHaveLength(2));
      const next = countdowns()[1]?.[0];
      if (typeof next !== 'function') throw new Error('Missing revised countdown.');
      await act(async () => { next(); });
      expect([...host.pending.values()].map(item => item.body)).toEqual([updated.message]);
    }
  } finally {
    pending.resolve({ notifications: [] });
    stop();
    getPending.mockRestore();
    timers.mockRestore();
  }
});
