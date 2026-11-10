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
      enabled: draft.enabled, trigger: { kind: 'daily', time: draft.time }
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
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Daily at 19:30')).toBeVisible();
  const toggle = await screen.findByRole('checkbox', { name: 'Enabled · Read notes' });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toBeChecked());

  fireEvent.click(screen.getByRole('button', { name: 'General' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reminders' }));
  const reopened = await screen.findByRole('checkbox', { name: 'Enabled · Read notes' });
  expect(reopened).toBeChecked();
  fireEvent.click(reopened);
  await waitFor(() => expect(reopened).not.toBeChecked());
});
