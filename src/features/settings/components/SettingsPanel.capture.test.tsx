import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../lib/platform/nativeContract';
import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { HotkeySettingsProvider } from '../context/HotkeySettingsProvider';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = {
    invoke: vi.fn(async (command: string) => command === 'load_desktop_host_capabilities'
      ? {
          globalCapturePermission: 'denied',
          globalCaptureShortcutLabel: 'Command+Shift+C',
          globalCaptureShortcutRegistered: true,
          globalCaptureSupported: true,
          globalCaptureToastPositionSupported: true,
          loginItemSupported: false
        }
      : null) as unknown as NativeInvoke,
    onManagedInboxUpdated: vi.fn(() => () => undefined),
    onNativeKeyboardInput: vi.fn(() => () => undefined),
    onNativeMenuCommand: vi.fn(() => () => undefined),
    onWindowResized: vi.fn(() => () => undefined),
    setNativeHotkeyRecordingActive: vi.fn()
  };
});

afterEach(() => {
  delete window.electronAPI;
});

it('keeps capture behavior settings in General instead of the hotkey command list', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'General' }));

  expect(screen.queryByRole('button', { name: 'Capture' })).not.toBeInTheDocument();
  expect(await screen.findByText('Accessibility permission')).toBeInTheDocument();
  expect(screen.getByText('Not authorized')).toBeInTheDocument();
  const position = screen.getByRole('combobox', { name: 'Confirmation position' });
  expect(position).toHaveValue('top-right');

  fireEvent.change(position, { target: { value: 'bottom-right' } });
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.globalClipToastPosition)).toBe('bottom-right');
});

it('displays the configured global capture keys and opens that command in Hotkeys', async () => {
  const commandId = APP_COMMAND_IDS.globalCaptureToInbox;
  const title = 'Capture to Inbox (global)';
  renderWithMouseGestureProvider(
    <HotkeySettingsProvider
      hotkeyItems={[{
        commandId,
        isCustomized: true,
        primaryShortcutLabel: 'Alt+Q',
        secondaryShortcutLabel: '',
        shortcutSummaryLabel: 'Alt+Q',
        title
      }]}
      onHotkeyReset={vi.fn()}
      onHotkeyResetAll={vi.fn()}
      onHotkeyUpdate={() => ({ status: 'blocked' })}
      shortcutMap={{ [commandId]: { primary: { altKey: true, key: 'q' } } }}
    >
      <SettingsPanel {...createProps()} />
    </HotkeySettingsProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'General' }));
  const entry = await screen.findByRole('button', { name: /^Configure shortcut for Capture to Inbox/ });
  expect(entry).toHaveTextContent(/Alt\+Q|⌥ Q/u);

  fireEvent.click(entry);
  expect(await screen.findByRole('searchbox', { name: 'Search hotkeys' })).toHaveValue(title);
  expect(screen.getByRole('button', { name: `Shortcut for ${title}` })).toHaveFocus();
});
