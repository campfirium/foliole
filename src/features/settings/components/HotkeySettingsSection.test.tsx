import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

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
    invoke: vi.fn(),
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

function renderHotkeyPanel(onHotkeyUpdate = vi.fn()) {
  const hotkeyItems = createHotkeyItems();
  const onHotkeyReset = vi.fn();
  const onHotkeyResetAll = vi.fn();
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />, {
    hotkeySettings: { hotkeyItems, onHotkeyReset, onHotkeyResetAll, onHotkeyUpdate }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Hotkeys' }));
  return { onHotkeyReset, onHotkeyResetAll, onHotkeyUpdate };
}

it('records, clears, and restores hotkeys from the settings section', async () => {
  const nativeHotkeys = installNativeHotkeyApi();
  const onHotkeyUpdate = vi.fn((_commandId, _slot, nextLabel: string) => ({
    status: 'applied' as const,
    normalizedShortcutLabel: nextLabel
  }));
  renderHotkeyPanel(onHotkeyUpdate);

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
  renderHotkeyPanel(vi.fn((_commandId, _slot, nextLabel: string) => ({
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

it('shows single-key bracket shortcuts as visible hotkey chips', () => {
  renderHotkeyPanel();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search hotkeys' }), { target: { value: '[' } });

  expect(screen.getByText('Toggle Left Sidebar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Shortcut for Toggle Left Sidebar' })).toHaveTextContent('[');
});

it('filters hotkeys by the platform-specific display labels', () => {
  renderHotkeyPanel();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search hotkeys' }), { target: { value: 'cmd' } });

  expect(screen.queryByText('Toggle Left Sidebar')).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search hotkeys' }), { target: { value: 'ctrl' } });

  expect(screen.getByText('Toggle Left Sidebar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Secondary shortcut for Toggle Left Sidebar' })).toHaveTextContent('Ctrl+Shift+L');
});

it('keeps platform-folded shortcuts in the visible list before any local edit', () => {
  renderHotkeyPanel();

  expect(screen.getByText('Toggle Left Sidebar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Shortcut for Toggle Left Sidebar' })).toHaveTextContent('[');
  expect(screen.getByRole('button', { name: 'Secondary shortcut for Toggle Left Sidebar' })).toHaveTextContent('Ctrl+Shift+L');
  expect(screen.queryByText('Cmd+Shift+L')).not.toBeInTheDocument();
});

it('filters hotkeys across shortcut separator characters', () => {
  renderHotkeyPanel();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search hotkeys' }), { target: { value: 'ctrl shift l' } });

  expect(screen.getByText('Toggle Left Sidebar')).toBeInTheDocument();
});
