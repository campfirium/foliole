// eslint-disable-next-line import/order -- Load native test mocks before modules that register plugins.
import { host, open } from './companionReminderTestSupport';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CompanionReminderNotificationActions } from './CompanionReminderNotificationActions';
import { edit, enable, save, savePreset } from './companionReminderSettings.testUtils';
import { CompanionReminderSettingsContent } from './CompanionReminderSettingsContent';

async function chooseDuration(minutes: number) {
  fireEvent.click(await screen.findByRole('button', { name: minutes === 30 ? 'Snooze 30 minutes' : 'Snooze 1 hour' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Snooze' })).toBeNull());
}

it.each([
  ['android', 'choose-snooze', 30],
  ['android', 'choose-snooze', 60],
  ['ios', 'snooze-30', 30],
  ['ios', 'snooze-60', 60]
] as const)('snoozes a single %s occurrence with %s and cancels it when disabled', async (platform, actionId, minutes) => {
  await open(platform, 'foliole-reminder-snooze-');
  render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  await savePreset('☕', 'Regular', '21:00');
  await enable('Regular');
  await edit('🌱');
  fireEvent.click(screen.getByRole('button', { name: 'Repeat Every day' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Never' }));
  const date = new Date(new Date().getFullYear() + 1, 3, 3, 10, 45);
  fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: `${date.getFullYear()}-04-03T10:45` } });
  await save();
  await enable('🌱');
  const [regular, notification] = [...host.pending.values()];
  if (!regular || !notification) throw new Error('Expected both schedules.');
  expect(host.actions.find(type => type.id === notification.actionTypeId)?.actions?.map(action => action.id))
    .toEqual(platform === 'android' ? ['choose-snooze'] : ['snooze-30', 'snooze-60']);

  const now = date.getTime() + 2 * 60_000;
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  const openFlow = vi.fn();
  let actions = render(<CompanionReminderNotificationActions openFlow={openFlow} />);
  await waitFor(() => expect(host.tap).toBeDefined());
  try {
    host.pending.delete(notification.id);
    await act(async () => {
      await Promise.all([host.tap?.({ actionId, notification }), host.tap?.({ actionId, notification })]);
    });
    const selectionAt = platform === 'android' ? now + 10_000 : now;
    if (platform === 'android') {
      const dialog = await screen.findByRole('dialog', { name: 'Snooze' });
      expect(dialog).toHaveTextContent('🌱');
      expect([...host.pending.values()]).toEqual([regular]);
      clock.mockReturnValue(selectionAt);
      await chooseDuration(minutes);
    }
    const [kept, delayed] = [...host.pending.values()];
    expect(kept).toBe(regular);
    expect(delayed?.schedule?.at).toEqual(new Date(selectionAt + minutes * 60_000));
    expect(delayed?.isExactNotification).toBe(platform === 'android');
    expect(openFlow).not.toHaveBeenCalled();

    actions.unmount();
    await waitFor(() => expect(host.tap).toBeUndefined());
    actions = render(<CompanionReminderNotificationActions openFlow={openFlow} />);
    await waitFor(() => expect(host.tap).toBeDefined());
    await act(async () => { await host.tap?.({ actionId, notification }); });
    if (platform === 'android') await chooseDuration(60);
    expect([...host.pending.values()]).toEqual([regular, delayed]);

    fireEvent.click(screen.getByRole('switch', { name: 'Enabled: 🌱' }));
    await waitFor(() => expect([...host.pending.values()]).toEqual([regular]));
    if (!delayed) throw new Error('Expected a delayed notification.');
    await act(async () => { await host.tap?.({ actionId, notification: delayed }); });
    expect(screen.queryByRole('dialog', { name: 'Snooze' })).toBeNull();
    expect([...host.pending.values()]).toEqual([regular]);
  } finally {
    clock.mockRestore();
    actions.unmount();
  }
});
