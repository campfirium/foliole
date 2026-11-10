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

it('creates, enables, reopens, and disables a daily reminder from Settings', async () => {
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
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Read notes' } });
  fireEvent.change(screen.getByLabelText('Time'), { target: { value: '19:30' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Open Flow' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Daily at 19:30 · Open Flow')).toBeVisible();
  const toggle = await screen.findByRole('switch', { name: 'Enabled: Read notes' });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toBeChecked());

  fireEvent.click(screen.getByRole('button', { name: 'Edit reminder: Read notes' }));
  expect(screen.getByRole('form', { name: 'Edit reminder' })).toBeVisible();
  expect(screen.getByLabelText('Message')).toHaveValue('Read notes');
  expect(screen.getByRole('radio', { name: 'Open Flow' })).toBeChecked();
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
