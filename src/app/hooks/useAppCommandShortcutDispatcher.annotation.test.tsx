import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { getPlatformDefaultCommandShortcuts } from '../../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { useAppCommandShortcutDispatcher } from './useAppCommandShortcutDispatcher';

function Harness({ platform, runCommand }: { platform: string; runCommand: (id: string) => void }) {
  useAppCommandShortcutDispatcher({
    isCommandSurfaceOpen: false,
    items: [{ enabled: true, id: APP_COMMAND_IDS.addSelectionNote, title: 'Annotate Selection' }],
    runCommand,
    shortcutMap: getPlatformDefaultCommandShortcuts(platform)
  });
  return <input aria-label="Editor" />;
}

function dispatchShortcut(init: KeyboardEventInit) {
  const input = document.querySelector('input')!;
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  input.dispatchEvent(event);
  return event;
}

it('dispatches macOS annotation only from the shifted physical Option A chord', () => {
  const runCommand = vi.fn();
  render(<Harness platform="MacIntel" runCommand={runCommand} />);

  expect(dispatchShortcut({ altKey: true, code: 'KeyA', key: 'Å' }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ metaKey: true, code: 'KeyA', key: 'a' }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ altKey: true, code: 'KeyA', key: 'Å', shiftKey: true }).defaultPrevented).toBe(true);
  expect(runCommand).toHaveBeenCalledOnce();
  expect(runCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.addSelectionNote);
});

it.each(['Win32', 'Linux x86_64'])('dispatches %s annotation from Alt A', (platform) => {
  const runCommand = vi.fn();
  render(<Harness platform={platform} runCommand={runCommand} />);

  expect(dispatchShortcut({ altKey: true, code: 'KeyA', key: 'a' }).defaultPrevented).toBe(true);
  expect(dispatchShortcut({ altKey: true, code: 'KeyA', key: 'a', shiftKey: true }).defaultPrevented).toBe(false);
  expect(runCommand).toHaveBeenCalledOnce();
  expect(runCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.addSelectionNote);
});
