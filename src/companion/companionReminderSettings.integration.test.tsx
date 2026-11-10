// eslint-disable-next-line import/order -- Load native test mocks before modules that register plugins.
import { host, open } from './companionReminderTestSupport';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { closeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { listenForCompanionReminderFlow } from '../shared/platform/companion/settings/companionReminderActions';

import { CompanionReminderSettingsContent } from './CompanionReminderSettingsContent';

async function save() {
  const button = screen.getByRole('button', { name: 'Save' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument());
}

async function edit(message: string) {
  const row = await screen.findByRole('button', { name: 'Edit reminder: ' + message });
  await waitFor(() => expect(row).toBeEnabled());
  fireEvent.click(row);
}

async function enable(message: string, expected?: string) {
  const toggle = screen.getByRole('switch', { name: 'Enabled: ' + message });
  await waitFor(() => expect(toggle).toBeEnabled());
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toBeChecked());
  await waitFor(() => expect(toggle).toBeEnabled());
  if (expected) expect(await screen.findByText(expected)).toBeVisible();
}

async function setDraft(message: string, time: string) {
  if (screen.queryByRole('button', { name: 'Trigger Foreground duration' })) {
    fireEvent.click(screen.getByRole('button', { name: 'Trigger Foreground duration' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Scheduled' }));
  }
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: message } });
  fireEvent.change(screen.getByLabelText('Time'), { target: { value: time } });
}

async function savePreset(preset: string, message: string, time: string) {
  await edit(preset);
  await setDraft(message, time);
  await save();
}

function pendingTimes() {
  return [...host.pending.values()].map(item => [item.body, item.schedule?.on, item.isExactNotification]);
}

it.each(['android', 'ios'] as const)('keeps independent %s reminders across reopen and replaces or cancels the old schedule', async platform => {
  await open(platform, 'foliole-reminder-');
  const view = render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  await savePreset('🌱', 'Open Foliole', '20:00');
  await enable('Open Foliole');
  await savePreset('☕', 'Start reading', '21:15');
  await enable('Start reading');
  expect(pendingTimes()).toEqual([
    ['Open Foliole', { hour: 20, minute: 0, second: 0 }, platform === 'android'],
    ['Start reading', { hour: 21, minute: 15, second: 0 }, platform === 'android']
  ]);
  view.unmount();
  await closeIosCompanionDatabase();
  await open(platform);
  render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit reminder: Open Foliole' }));
  await setDraft('Open Foliole', '20:30');
  await save();
  expect(pendingTimes()).toEqual([
    ['Start reading', { hour: 21, minute: 15, second: 0 }, platform === 'android'],
    ['Open Foliole', { hour: 20, minute: 30, second: 0 }, platform === 'android']
  ]);
  const toggle = screen.getByRole('switch', { name: 'Enabled: Open Foliole' });
  expect(toggle).toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  await waitFor(() => expect(pendingTimes()).toEqual([
    ['Start reading', { hour: 21, minute: 15, second: 0 }, platform === 'android']
  ]));
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  await waitFor(() => expect(toggle).toBeEnabled());
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toBeChecked());
  await waitFor(() => expect(pendingTimes()).toContainEqual(
    ['Open Foliole', { hour: 20, minute: 30, second: 0 }, platform === 'android']
  ));
});

it('keeps the rule when notification permission is denied and schedules after permission is restored', async () => {
  await open('android', 'foliole-reminder-permission-');
  host.granted = false;
  render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  await savePreset('🌱', 'Open Foliole', '20:00');
  await enable('Open Foliole', 'Reminder saved. Allow notifications in system settings to receive it.');
  expect(pendingTimes()).toEqual([]);
  host.granted = true;
  fireEvent.click(screen.getByRole('button', { name: 'Edit reminder: Open Foliole' }));
  await save();
  expect(pendingTimes()).toEqual([['Open Foliole', { hour: 20, minute: 0, second: 0 }, true]]);
});

it('keeps the Android rule without silently scheduling an approximate alarm when exact access is denied', async () => {
  await open('android', 'foliole-reminder-exact-');
  host.exactGranted = false;
  render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  await savePreset('🌱', 'Open Foliole', '20:00');
  await enable('Open Foliole', 'Reminder saved. Allow Alarms & reminders, then save the reminder again.');
  expect(pendingTimes()).toEqual([]);

  host.exactGranted = true;
  fireEvent.click(screen.getByRole('button', { name: 'Edit reminder: Open Foliole' }));
  await save();
  expect(pendingTimes()).toEqual([['Open Foliole', { hour: 20, minute: 0, second: 0 }, true]]);
});

it.each(['android', 'ios'] as const)('schedules a single %s notification and restores its trigger after reopen', async platform => {
  await open(platform, 'foliole-reminder-once-');
  const view = render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  await edit('🌱');
  fireEvent.click(screen.getByRole('button', { name: 'Repeat Every day' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Never' }));
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'One appointment' } });
  const when = `${new Date().getFullYear() + 1}-04-03T10:45`;
  fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: when } });
  await save();
  await enable('One appointment');
  const schedule = [...host.pending.values()][0]?.schedule;
  expect(schedule).toEqual({ at: new Date(when), repeats: false, allowWhileIdle: true });

  view.unmount();
  await closeIosCompanionDatabase();
  await open(platform);
  render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit reminder: One appointment' }));
  expect(screen.getByRole('button', { name: 'Repeat Never' })).toBeVisible();
  expect(screen.getByLabelText('Date and time')).toHaveValue(when);
});

it.each(['android', 'ios'] as const)('opens Flow from a current %s reminder and ignores stale notifications', async platform => {
  await open(platform, 'foliole-reminder-flow-');
  const view = render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  await savePreset('🌱', 'Flow time', '20:00');
  await enable('Flow time');
  await savePreset('☕', 'Just a reminder', '21:00');
  await enable('Just a reminder');
  const [notification, plainNotification] = host.pending.values();
  if (!notification || !plainNotification) throw new Error('Expected both reminders to be scheduled.');
  view.unmount();
  await closeIosCompanionDatabase();
  await open(platform);
  const openFlow = vi.fn();
  const listener = listenForCompanionReminderFlow(openFlow);
  await listener.ready;
  try {
    await host.tap?.({ actionId: 'tap', notification: plainNotification });
    expect(openFlow).not.toHaveBeenCalled();
    await host.tap?.({ actionId: 'tap', notification });
    expect(openFlow).toHaveBeenCalledTimes(1);
    render(<CompanionReminderSettingsContent onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enabled: Flow time' }));
    await waitFor(() => expect([...host.pending.values()].map(item => item.body)).toEqual(['Just a reminder']));
    await host.tap?.({ actionId: 'tap', notification });
    expect(openFlow).toHaveBeenCalledTimes(1);
  } finally {
    await listener.dispose();
  }
});

it('shows both presets off and schedules only when enabled', async () => {
  await open('ios', 'foliole-reminder-presets-');
  render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  expect(await screen.findByRole('switch', { name: 'Enabled: ☕' })).not.toBeChecked();
  await edit('🌱');
  expect(screen.getByRole('button', { name: 'On notification tap Open Flow' })).toBeVisible();
  await save();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(host.pending.size).toBe(0);
  await enable('🌱');
  expect(pendingTimes()).toEqual([['🌱', { hour: 20, minute: 0, second: 0 }, false]]);
});
