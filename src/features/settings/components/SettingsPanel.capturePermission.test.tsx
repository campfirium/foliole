import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../lib/platform/nativeContract';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

const capabilities = {
  globalCapturePermission: 'denied',
  globalCaptureShortcutLabel: 'Alt+A',
  globalCaptureShortcutRegistered: true,
  globalCaptureSupported: true,
  globalCaptureToastPositionSupported: true,
  loginItemSupported: false
};

function openGeneral(permission = 'denied', toastPositionSupported = true) {
  const state = { ...capabilities, globalCapturePermission: permission, globalCaptureToastPositionSupported: toastPositionSupported };
  const invoke = vi.fn(async (command: string) => command === 'load_desktop_host_capabilities' ? { ...state } : null);
  window.electronAPI = {
    invoke: invoke as unknown as NativeInvoke,
    onManagedInboxUpdated: vi.fn(() => () => undefined),
    onNativeKeyboardInput: vi.fn(() => () => undefined),
    onNativeMenuCommand: vi.fn(() => () => undefined),
    onWindowResized: vi.fn(() => () => undefined),
    setNativeHotkeyRecordingActive: vi.fn()
  };
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);
  fireEvent.click(screen.getByRole('button', { name: 'General' }));
  return { capture: within(screen.getByRole('region', { name: 'Global capture settings' })), invoke, state };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => { delete window.electronAPI; });

it('explains empty Enter and updates the permission after returning from System Settings', async () => {
  const { capture, invoke, state } = openGeneral();
  const launch = await capture.findByRole('button', { name: 'Open System Settings' });
  expect(capture.getByText('Accessibility permission')).toBeVisible();
  expect(capture.getByText('Not authorized')).toBeVisible();
  expect(capture.getByText(/leave it empty and press Enter to import the clipboard/i)).toBeVisible();

  fireEvent.click(launch);
  expect(invoke.mock.calls.some(([command]) => command === 'open_global_capture_accessibility_settings')).toBe(true);
  state.globalCapturePermission = 'granted';
  fireEvent.focus(window);
  expect(await capture.findByText('Authorized')).toBeVisible();
  expect(launch).not.toBeInTheDocument();
});

it('omits the permission row on a host that needs no additional authorization', async () => {
  const { capture } = openGeneral('notRequired', false);
  expect(await capture.findByText(/leave it empty and press Enter to import the clipboard/i)).toBeVisible();
  expect(capture.queryByText(/accessibility permission|selection access/i)).not.toBeInTheDocument();
});

it('reports a failed System Settings launch without losing the retry action', async () => {
  const { capture, invoke } = openGeneral();
  const launch = await capture.findByRole('button', { name: 'Open System Settings' });
  invoke.mockRejectedValueOnce(new Error('launch failed'));
  fireEvent.click(launch);

  expect(await capture.findByText('Could not open System Settings.')).toBeVisible();
  expect(launch).toBeEnabled();
  fireEvent.click(launch);
  expect(capture.queryByText('Could not open System Settings.')).not.toBeInTheDocument();
});
