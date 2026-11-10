// eslint-disable-next-line import/order -- Load native test mocks before modules that register plugins.
import { host, open } from './companionReminderTestSupport';

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { DIVE_NODE_FILTER } from '../../lib/core/nodes/dive';
import { ReminderDraftProvider } from '../features/settings/context/ReminderDraftRequest';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { closeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { AppConfirmationProvider } from '../shared/ui/AppConfirmationProvider';

import { CompanionDiveReminderMenu } from './CompanionDiveReminderMenu';
import { edit, enable, save, setDraft } from './companionReminderSettings.testUtils';
import { CompanionReminderSettingsContent } from './CompanionReminderSettingsContent';
import { useCompanionReminderNavigation } from './useCompanionReminderNavigation';

function NavigationProviders({ children }: { children: ReactNode }) {
  return <LocalizationProvider><AppConfirmationProvider>{children}</AppConfirmationProvider></LocalizationProvider>;
}

function createSnapshot(title: string): WorkspaceSnapshot {
  const node = {
    id: 'physics', title, parentNodeId: null, kind: 'folder' as const, content: '', isTitleManual: true,
    hideTitleHeading: false, reveal: null, anchorLink: null, reading: null, review: null,
    createdAt: '2026-11-09', updatedAt: '2026-11-09'
  };
  const nodesById = {
    physics: { ...node, virtualFilter: DIVE_NODE_FILTER, manualChildOrder: ['topic'] },
    topic: { ...node, id: 'topic', kind: 'topic' as const, title: 'Physics notes' }
  };
  return { nodesById, nodeOrder: Object.keys(nodesById), trashedNodeIds: [], activeNodeId: null, untitledSequenceByParent: {} };
}

it.each(['android', 'ios'] as const)('keeps a %s reminder bound through a Dive rename and routes the tap to current members', async platform => {
  await open(platform, 'foliole-dive-reminder-');
  const view = render(<CompanionReminderSettingsContent onBack={() => undefined} snapshot={createSnapshot('Physics')} />);
  await edit('🌱');
  await setDraft('Review Physics', '20:30');
  fireEvent.click(screen.getByRole('button', { name: 'On notification tap Open Flow' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open Dive Flow' }));
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Dive Choose a Dive' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Physics' }));
  await save();
  await enable('Review Physics');
  const notification = [...host.pending.values()].find(value => value.body === 'Review Physics');
  if (!notification) throw new Error('Expected a scheduled Dive reminder');
  view.unmount();

  await closeIosCompanionDatabase();
  await open(platform);
  const snapshot = createSnapshot('Physics II');
  render(<CompanionReminderSettingsContent onBack={() => undefined} snapshot={snapshot} />);
  expect(await screen.findByText('Daily at 20:30 · This device · Physics II')).toBeVisible();

  const actions = { openFlow: vi.fn(), openDive: vi.fn() };
  const navigation = renderHook(({ current }) => useCompanionReminderNavigation(true, current, actions),
    { initialProps: { current: snapshot }, wrapper: NavigationProviders });
  await waitFor(() => expect(host.tap).toBeTypeOf('function'));
  await host.tap?.({ actionId: 'tap', notification });
  expect(actions.openDive).toHaveBeenCalledExactlyOnceWith({ id: 'physics', topicIds: ['topic'] });
  expect(actions.openFlow).not.toHaveBeenCalled();

  navigation.rerender({ current: { ...snapshot, trashedNodeIds: ['physics'] } });
  await act(async () => { await host.tap?.({ actionId: 'tap', notification }); });
  expect(actions.openDive).toHaveBeenCalledTimes(1);
  expect(actions.openFlow).not.toHaveBeenCalled();
  expect(await screen.findByRole('dialog', { name: 'This Dive is unavailable.' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
});


function ReminderShortcutFixture() {
  const [settings, setSettings] = useState(false);
  return <ReminderDraftProvider openReminders={() => setSettings(true)}>
    {settings ? <>
      <button type="button" onClick={() => setSettings(false)}>Back</button>
      <CompanionReminderSettingsContent onBack={() => setSettings(false)} snapshot={createSnapshot('Physics')} />
    </>
      : <CompanionDiveReminderMenu dive={{ id: 'physics', title: 'Physics', directSourceIds: ['topic'] }} />}
  </ReminderDraftProvider>;
}

it('opens the shared form from the Dive menu and writes only on save', async () => {
  await open('android', 'foliole-dive-shortcut-');
  render(<ReminderShortcutFixture />);
  fireEvent.click(screen.getByRole('button', { name: 'More: Physics' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Create reminder…' }));
  expect(await screen.findByLabelText('Message')).toHaveValue('Physics');
  expect(screen.getByRole('button', { name: 'Dive Physics' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await screen.findByRole('switch', { name: 'Enabled: 🌱' });
  expect(screen.queryByRole('switch', { name: 'Enabled: Physics' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  fireEvent.click(screen.getByRole('button', { name: 'More: Physics' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Create reminder…' }));
  await screen.findByLabelText('Message');
  await save();
  expect(await screen.findByRole('switch', { name: 'Enabled: Physics' })).not.toBeChecked();
  expect(await screen.findByText('Daily at 20:00 · This device · Physics')).toBeVisible();
});

it('does not offer an actionable Dive destination when the library has no Dives', async () => {
  await open('ios', 'foliole-reminder-no-dives-');
  render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  await edit('🌱');
  fireEvent.click(screen.getByRole('button', { name: 'On notification tap Open Flow' }));
  expect(await screen.findByRole('button', { name: 'Open Dive Flow' })).toBeDisabled();
});
