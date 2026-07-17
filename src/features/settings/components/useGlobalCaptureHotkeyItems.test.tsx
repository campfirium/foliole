import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { RUNTIME_APP_SETTINGS_SAVED_EVENT } from '../../../shared/platform/storage';
import type { HotkeySettingItem } from '../model/hotkeySettings';

import { useGlobalCaptureHotkeyItems } from './useGlobalCaptureHotkeyItems';

const capabilityState = vi.hoisted(() => ({ registered: false }));

vi.mock('../../../shared/platform/desktopHostCapabilities', () => ({
  loadDesktopHostCapabilities: vi.fn(async () => ({
    globalCaptureShortcutRegistered: capabilityState.registered,
    globalCaptureSupported: true
  }))
}));

const ITEM: HotkeySettingItem = {
  commandId: APP_COMMAND_IDS.globalCaptureToInbox,
  isCustomized: true,
  primaryShortcutLabel: 'Alt+C',
  secondaryShortcutLabel: '',
  shortcutSummaryLabel: 'Alt+C',
  title: 'Capture to Inbox (global)'
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <LocalizationProvider initialLanguagePreference="en">{children}</LocalizationProvider>;
}

beforeEach(() => {
  capabilityState.registered = false;
});

it('shows the conflict until a completed settings save reports the shortcut active', async () => {
  const { result } = renderHook(() => useGlobalCaptureHotkeyItems([ITEM]), { wrapper: Wrapper });
  await waitFor(() => {
    expect(result.current[0]?.conflictMessage).toBe("Shortcut is already in use and isn't active yet.");
  });

  capabilityState.registered = true;
  act(() => window.dispatchEvent(new Event(RUNTIME_APP_SETTINGS_SAVED_EVENT)));

  await waitFor(() => expect(result.current[0]?.conflictMessage).toBeUndefined());
});
