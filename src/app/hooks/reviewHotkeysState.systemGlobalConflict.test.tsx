import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { getCommandShortcutOverrides } from '../../shared/commands/keymap';

import { useCommandShortcutState } from './reviewHotkeysState';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
});

it('blocks an application shortcut consumed by global Capture and keeps storage unchanged', () => {
  const { result } = renderHook(() => useCommandShortcutState([
    APP_COMMAND_IDS.globalCaptureToInbox,
    APP_COMMAND_IDS.addSelectionNote
  ]));

  let updateResult: ReturnType<typeof result.current.updateShortcut> | undefined;
  act(() => {
    updateResult = result.current.updateShortcut(
      APP_COMMAND_IDS.addSelectionNote,
      'primary',
      'Alt+Shift+A'
    );
  });

  expect(updateResult).toEqual({
    message: 'This shortcut conflicts with the global Capture shortcut. Choose another shortcut.',
    status: 'blocked'
  });
  expect(getCommandShortcutOverrides()).toEqual({});
  vi.restoreAllMocks();
});

it('accepts the non-conflicting macOS annotation shortcut', () => {
  const { result } = renderHook(() => useCommandShortcutState([
    APP_COMMAND_IDS.globalCaptureToInbox,
    APP_COMMAND_IDS.addSelectionNote
  ]));

  act(() => {
    expect(result.current.updateShortcut(
      APP_COMMAND_IDS.addSelectionNote,
      'primary',
      'Cmd+Shift+A'
    ).status).toBe('applied');
  });

  expect(getCommandShortcutOverrides()[APP_COMMAND_IDS.addSelectionNote]?.primary).toBe('Cmd+Shift+A');
  vi.restoreAllMocks();
});
