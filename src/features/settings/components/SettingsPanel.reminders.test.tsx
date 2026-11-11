import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { ReminderRule } from '../../../../lib/core/reminders/reminderRule';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { DesktopReminderDraft } from '../../../../lib/platform/nativeReminderContract';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('../../../shared/platform/runtimeInvoke', async importOriginal => ({
  ...await importOriginal<typeof import('../../../shared/platform/runtimeInvoke')>(),
  getRuntimeInvoke: () => invoke
}));

beforeEach(() => {
  window.localStorage.clear();
  invoke.mockReset();
});

it('creates an enabled daily reminder inline, reopens, and disables it from Settings', async () => {
  let rule: ReminderRule | null = null;
  invoke.mockImplementation(async (command: string, draft: DesktopReminderDraft) => {
    if (command === NATIVE_COMMANDS.loadDesktopReminders) return rule ? [rule] : [];
    if (command !== NATIVE_COMMANDS.saveDesktopReminder) return null;
    rule = {
      id: '8a255f62-5aa9-4e15-85d1-e5e121309d3c', revision: crypto.randomUUID(),
      device: { kind: 'standalone', id: 'desktop' }, message: draft.message,
      enabled: draft.enabled, trigger: draft.trigger, destination: draft.destination
    };
    return rule;
  });
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reminders' }));
  const add = await screen.findByRole('button', { name: 'New reminder' });
  await waitFor(() => expect(add).toBeEnabled());
  fireEvent.click(add);
  expect(screen.getByRole('switch', { name: 'Enabled: 🌱' })).toBeVisible();
  expect(screen.getByLabelText('Time')).toHaveAttribute('type', 'text');
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Read notes' } });
  fireEvent.change(screen.getByLabelText('Time'), { target: { value: '19:30' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'On notification tap' }), { target: { value: 'flow' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Daily at 19:30 · Open Flow')).toBeVisible();
  const toggle = await screen.findByRole('switch', { name: 'Enabled: Read notes' });
  expect(toggle).toBeChecked();

  fireEvent.click(screen.getByRole('button', { name: 'Edit reminder: Read notes' }));
  expect(screen.getByRole('form', { name: 'Edit reminder' })).toBeVisible();
  expect(screen.getByLabelText('Message')).toHaveValue('Read notes');
  expect(screen.getByRole('combobox', { name: 'On notification tap' })).toHaveValue('flow');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('switch', { name: 'Enabled: Read notes' })).toBeChecked();

  fireEvent.click(screen.getByRole('button', { name: 'General' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reminders' }));
  const reopened = await screen.findByRole('switch', { name: 'Enabled: Read notes' });
  expect(reopened).toBeChecked();
  fireEvent.click(reopened);
  await waitFor(() => expect(reopened).not.toBeChecked());
});

it('shows the two disabled presets on an empty device and replaces a preset when saved', async () => {
  const rules: ReminderRule[] = [];
  invoke.mockImplementation(async (command: string, draft: DesktopReminderDraft) => {
    if (command === NATIVE_COMMANDS.loadDesktopReminders) return [...rules];
    if (command !== NATIVE_COMMANDS.saveDesktopReminder) return null;
    const rule = {
      id: crypto.randomUUID(), revision: crypto.randomUUID(), device: { kind: 'standalone' as const, id: 'desktop' },
      message: draft.message, enabled: draft.enabled, trigger: draft.trigger, destination: draft.destination, preset: draft.preset
    };
    rules.push(rule);
    return rule;
  });
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reminders' }));
  expect(await screen.findByRole('switch', { name: 'Enabled: 🌱' })).not.toBeChecked();
  expect(screen.getByRole('switch', { name: 'Enabled: ☕' })).not.toBeChecked();
  expect(screen.getByText('Daily at 20:00 · Open Flow')).toBeVisible();
  expect(rules).toHaveLength(0);

  fireEvent.click(screen.getByRole('button', { name: 'Edit reminder: 🌱' }));
  expect(screen.getByRole('form', { name: 'Edit reminder' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Evening Flow' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('switch', { name: 'Enabled: Evening Flow' })).not.toBeChecked();
  expect(screen.queryByRole('switch', { name: 'Enabled: 🌱' })).not.toBeInTheDocument();
  expect(rules).toMatchObject([{ preset: 'seedling', enabled: false }]);

  fireEvent.click(screen.getByRole('button', { name: 'General' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reminders' }));
  expect(await screen.findByRole('switch', { name: 'Enabled: Evening Flow' })).not.toBeChecked();
  expect(screen.getByRole('switch', { name: 'Enabled: ☕' })).not.toBeChecked();
  expect(screen.queryByRole('switch', { name: 'Enabled: 🌱' })).not.toBeInTheDocument();
});

it('explains disabled notifications, opens system settings, and refreshes on return', async () => {
  let status = 'denied';
  invoke.mockImplementation(async (command: string) => {
    if (command === NATIVE_COMMANDS.desktopReminderNotificationStatus) return status;
    if (command === NATIVE_COMMANDS.loadDesktopReminders) return [];
    return null;
  });
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reminders' }));
  const openSettings = await screen.findByRole('button', { name: 'Open System Notification Settings' });
  expect(screen.getByText('Notifications are off on this device. Reminders won’t appear.')).toBeVisible();
  fireEvent.click(openSettings);
  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.openDesktopReminderNotificationSettings);

  status = 'allowed';
  fireEvent.focus(window);
  await waitFor(() => expect(openSettings).not.toBeInTheDocument());

  status = 'denied';
  fireEvent.focus(window);
  expect(await screen.findByRole('button', { name: 'Open System Notification Settings' })).toBeVisible();
});

it.each(['save', 'enable'] as const)('requests permission after the first %s and keeps the saved rule on denial', async action => {
  let persisted: ReminderRule | undefined;
  let ruleAtPermissionRequest: ReminderRule | undefined;
  let resolvePermission: (status: string) => void = () => {};
  const permission = new Promise<string>(resolve => { resolvePermission = resolve; });
  invoke.mockImplementation(async (command: string, draft: DesktopReminderDraft) => {
    if (command === NATIVE_COMMANDS.loadDesktopReminders) return [];
    if (command === NATIVE_COMMANDS.desktopReminderNotificationStatus) return 'notDetermined';
    if (command === NATIVE_COMMANDS.requestDesktopReminderNotificationPermission) {
      ruleAtPermissionRequest = persisted;
      return permission;
    }
    if (command !== NATIVE_COMMANDS.saveDesktopReminder) return null;
    persisted = {
      id: crypto.randomUUID(), revision: crypto.randomUUID(),
      device: { kind: 'standalone', id: 'desktop' }, ...draft
    };
    return persisted;
  });

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reminders' }));
  await screen.findByRole('button', { name: 'Allow Notifications' });
  expect(invoke).not.toHaveBeenCalledWith(NATIVE_COMMANDS.requestDesktopReminderNotificationPermission);

  if (action === 'save') {
    fireEvent.click(await screen.findByRole('button', { name: 'New reminder' }));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Read notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  } else {
    fireEvent.click(await screen.findByRole('switch', { name: 'Enabled: 🌱' }));
  }
  const name = action === 'save' ? 'Enabled: Read notes' : 'Enabled: 🌱';
  await waitFor(() => expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.requestDesktopReminderNotificationPermission));
  expect(ruleAtPermissionRequest).toMatchObject({ enabled: true });
  resolvePermission('denied');
  expect(await screen.findByText('Notifications are off on this device. Reminders won’t appear.')).toBeVisible();
  expect(screen.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'true');
});
