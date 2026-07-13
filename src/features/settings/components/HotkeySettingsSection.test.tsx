import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../lib/platform/nativeContract';
import type { RuntimeKeyboardInputPayload } from '../../../shared/platform/nativeHotkeyRecordingRuntime';
import type { HotkeySettingItem } from '../model/hotkeySettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

afterEach(() => {
  delete window.electronAPI;
});

function createHotkeyItems(): HotkeySettingItem[] {
  return [
    {
      commandId: 'workspace.createFolder',
      title: 'Create Folder',
      section: 'Create',
      primaryShortcutLabel: 'Ctrl+Alt+F',
      secondaryShortcutLabel: '',
      shortcutSummaryLabel: 'Ctrl+Alt+F',
      isCustomized: false
    },
    {
      commandId: 'review.good',
      title: 'Grade Review: Good',
      section: 'Review',
      primaryShortcutLabel: '3',
      secondaryShortcutLabel: '',
      shortcutSummaryLabel: '3',
      isCustomized: false
    },
    {
      commandId: 'review.easy',
      title: 'Grade Review: Easy',
      section: 'Review',
      primaryShortcutLabel: '4',
      secondaryShortcutLabel: '',
      shortcutSummaryLabel: '4',
      isCustomized: true
    },
    {
      commandId: 'review.skip',
      title: 'Skip Review',
      section: 'Review',
      primaryShortcutLabel: '',
      secondaryShortcutLabel: '',
      shortcutSummaryLabel: '',
      isCustomized: false
    },
    {
      commandId: 'workspace.toggleList',
      title: 'Toggle Left Sidebar',
      section: 'Workspace',
      primaryShortcutLabel: '[',
      secondaryShortcutLabel: 'Ctrl+Shift+L',
      shortcutSummaryLabel: '[ / Ctrl+Shift+L',
      shortcutDisplayEntries: [
        { label: '[', slot: 'primary' },
        { label: 'Ctrl+Shift+L', slot: 'secondary' }
      ],
      isCustomized: false
    }
  ];
}

function installNativeHotkeyApi() {
  let nativeKeyboardHandler: ((payload: RuntimeKeyboardInputPayload) => void) | null = null;
  const setNativeHotkeyRecordingActive = vi.fn();
  window.electronAPI = {
    invoke: vi.fn(async (command: string) => command === 'load_desktop_host_capabilities'
      ? { globalCaptureSupported: true, loginItemSupported: true }
      : null) as unknown as NativeInvoke,
    onManagedInboxUpdated: vi.fn(() => () => undefined),
    onNativeKeyboardInput: vi.fn((handler) => {
      nativeKeyboardHandler = handler;
      return () => {
        nativeKeyboardHandler = null;
      };
    }),
    onNativeMenuCommand: vi.fn(() => () => undefined),
    onWindowResized: vi.fn(() => () => undefined),
    setNativeHotkeyRecordingActive
  };
  return {
    setNativeHotkeyRecordingActive,
    sendNativeKey: (payload: RuntimeKeyboardInputPayload) => nativeKeyboardHandler?.(payload)
  };
}

async function renderHotkeyPanel(onHotkeyUpdate = vi.fn()) {
  const hotkeyItems = createHotkeyItems();
  const onHotkeyReset = vi.fn();
  const onHotkeyResetAll = vi.fn();
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />, {
    hotkeySettings: { hotkeyItems, onHotkeyReset, onHotkeyResetAll, onHotkeyUpdate }
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Hotkeys' }));
  return { onHotkeyReset, onHotkeyResetAll, onHotkeyUpdate };
}

it('records, clears, and restores hotkeys from the settings section', async () => {
  const nativeHotkeys = installNativeHotkeyApi();
  const onHotkeyUpdate = vi.fn((_commandId, _slot, nextLabel: string) => ({
    status: 'applied' as const,
    normalizedShortcutLabel: nextLabel
  }));
  await renderHotkeyPanel(onHotkeyUpdate);

  fireEvent.click(screen.getByRole('button', { name: 'Add shortcut for Grade Review: Good' }));
  expect(screen.getByRole('button', { name: 'Secondary shortcut for Grade Review: Good' })).toHaveTextContent('Press hotkey...');
  expect(screen.getByRole('button', { name: 'Secondary shortcut for Grade Review: Good' })).toHaveFocus();
  expect(nativeHotkeys.setNativeHotkeyRecordingActive).toHaveBeenLastCalledWith(true);
  act(() => {
    nativeHotkeys.sendNativeKey({ altKey: false, code: 'ControlLeft', controlKey: true, key: 'Control', metaKey: false, shiftKey: false, type: 'keyDown' });
    nativeHotkeys.sendNativeKey({ altKey: false, code: 'KeyG', controlKey: true, key: 'g', metaKey: false, shiftKey: false, type: 'keyDown' });
  });

  await waitFor(() => {
    expect(onHotkeyUpdate).toHaveBeenCalledWith('review.good', 'secondary', 'Ctrl+G');
    expect(screen.getByRole('button', { name: 'Secondary shortcut for Grade Review: Good' })).toHaveTextContent('Ctrl+G');
  });
  expect(nativeHotkeys.setNativeHotkeyRecordingActive.mock.calls.map(([active]) => active)).toEqual([true, false]);

  fireEvent.click(screen.getByRole('button', { name: 'Clear Shortcut for Grade Review: Good' }));
  expect(onHotkeyUpdate).toHaveBeenCalledWith('review.good', 'primary', '');

  expect(screen.queryByRole('button', { name: 'Restore defaults' })).not.toBeInTheDocument();
});

it('filters hotkeys by text, assignment state, and recorded search shortcut', async () => {
  const nativeHotkeys = installNativeHotkeyApi();
  await renderHotkeyPanel(vi.fn((_commandId, _slot, nextLabel: string) => ({
    status: 'applied' as const,
    normalizedShortcutLabel: nextLabel
  })));

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search hotkeys' }), { target: { value: 'easy' } });
  expect(screen.getByText('Grade Review: Easy')).toBeInTheDocument();
  expect(screen.queryByText('Grade Review: Good')).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search hotkeys' }), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Filter hotkeys: All' }));
  fireEvent.click(await screen.findByText('Unassigned'));
  expect(screen.getByText('Skip Review')).toBeInTheDocument();
  expect(screen.queryByText('Grade Review: Good')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Filter hotkeys: Unassigned' }));
  fireEvent.click(await screen.findByText('All'));
  fireEvent.click(screen.getByRole('button', { name: 'Search by hotkey' }));
  act(() => {
    nativeHotkeys.sendNativeKey({ altKey: false, code: 'Digit4', controlKey: false, key: '4', metaKey: false, shiftKey: false, type: 'keyDown' });
  });
  await waitFor(() => {
    expect(screen.getByRole('searchbox', { name: 'Search hotkeys' })).toHaveValue('4');
  });
  expect(screen.getByText('Grade Review: Easy')).toBeInTheDocument();
  expect(screen.queryByText('Grade Review: Good')).not.toBeInTheDocument();
});

it('shows single-key bracket shortcuts as visible hotkey chips', async () => {
  await renderHotkeyPanel();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search hotkeys' }), { target: { value: '[' } });

  expect(screen.getByText('Toggle Left Sidebar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Shortcut for Toggle Left Sidebar' })).toHaveTextContent('[');
});

it('filters hotkeys by the platform-specific display labels', async () => {
  await renderHotkeyPanel();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search hotkeys' }), { target: { value: 'cmd' } });

  expect(screen.queryByText('Toggle Left Sidebar')).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search hotkeys' }), { target: { value: 'ctrl' } });

  expect(screen.getByText('Toggle Left Sidebar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Secondary shortcut for Toggle Left Sidebar' })).toHaveTextContent('Ctrl+Shift+L');
});

it('keeps platform-folded shortcuts in the visible list before any local edit', async () => {
  await renderHotkeyPanel();

  expect(screen.getByText('Toggle Left Sidebar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Shortcut for Toggle Left Sidebar' })).toHaveTextContent('[');
  expect(screen.getByRole('button', { name: 'Secondary shortcut for Toggle Left Sidebar' })).toHaveTextContent('Ctrl+Shift+L');
  expect(screen.queryByText('Cmd+Shift+L')).not.toBeInTheDocument();
});

it('filters hotkeys across shortcut separator characters', async () => {
  await renderHotkeyPanel();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search hotkeys' }), { target: { value: 'ctrl shift l' } });

  expect(screen.getByText('Toggle Left Sidebar')).toBeInTheDocument();
});

it('shows the global clip shortcut as the first hotkey row', async () => {
  installNativeHotkeyApi();
  await renderHotkeyPanel();

  const rows = within(screen.getByLabelText('Command shortcut list')).getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent('Capture to Inbox (global)');
  expect(rows[0]).toHaveTextContent('Capture');
  expect(rows[0]).toHaveTextContent('Alt+Shift+C');
  expect(within(rows[0]!).queryByRole('button')).not.toBeInTheDocument();
  expect(rows[1]).toHaveTextContent('Create Folder');
  expect(screen.queryByRole('switch', { name: 'Use current clipboard when nothing is selected' })).not.toBeInTheDocument();
});

it('marks the global clip shortcut unavailable when the desktop host does not support it', async () => {
  await renderHotkeyPanel();

  const rows = within(screen.getByLabelText('Command shortcut list')).getAllByRole('listitem');
  await waitFor(() => expect(rows[0]).toHaveTextContent('Not available on macOS'));
  expect(rows[0]).toHaveTextContent('Unavailable');
  expect(rows[0]).not.toHaveTextContent('Alt+Shift+C');
});
