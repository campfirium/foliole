import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { CommandPaletteItem } from '../../shared/commands/types';

import { useAppCommandShortcutDispatcher } from './useAppCommandShortcutDispatcher';

function dispatchShortcut(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

function Harness({
  isCommandSurfaceOpen = false,
  items,
  runCommand = vi.fn()
}: {
  isCommandSurfaceOpen?: boolean;
  items: CommandPaletteItem[];
  runCommand?: (id: string) => void;
}) {
  useAppCommandShortcutDispatcher({
    isCommandSurfaceOpen,
    items,
    runCommand,
    shortcutMap: {
      'workspace.createFolder': { primary: { ctrlKey: true, altKey: true, key: 'f' } },
      'editor.toggleDisplayMode': { primary: { ctrlKey: true, key: '\\' } },
      'workspace.toggleList': { primary: { ctrlKey: true, key: 'l' } }
    }
  });
  return <input aria-label="text input" />;
}

it('runs the enabled palette command matched by a configured shortcut', () => {
  const runCommand = vi.fn();
  render(
    <Harness
      items={[{ enabled: true, id: 'workspace.toggleList', title: 'Toggle List' }]}
      runCommand={runCommand}
    />
  );

  const event = dispatchShortcut({ ctrlKey: true, key: 'l' });

  expect(event.defaultPrevented).toBe(true);
  expect(runCommand).toHaveBeenCalledWith('workspace.toggleList');
});

it('can dispatch editor display mode shortcuts through the command runner', () => {
  const runCommand = vi.fn();
  render(
    <Harness
      items={[{ enabled: true, id: 'editor.toggleDisplayMode', title: 'Toggle Editor Display Mode' }]}
      runCommand={runCommand}
    />
  );

  const event = dispatchShortcut({ ctrlKey: true, key: '\\' });

  expect(event.defaultPrevented).toBe(true);
  expect(runCommand).toHaveBeenCalledWith('editor.toggleDisplayMode');
});

it('can dispatch newly routed create command shortcuts', () => {
  const runCommand = vi.fn();
  render(
    <Harness
      items={[{ enabled: true, id: 'workspace.createFolder', title: 'Create Folder' }]}
      runCommand={runCommand}
    />
  );

  const event = dispatchShortcut({ ctrlKey: true, altKey: true, key: 'f' });

  expect(event.defaultPrevented).toBe(true);
  expect(runCommand).toHaveBeenCalledWith('workspace.createFolder');
});

it('does not run disabled commands or commands while another command surface is open', () => {
  const disabledRunCommand = vi.fn();
  const { unmount } = render(
    <Harness
      items={[{ enabled: false, id: 'workspace.toggleList', title: 'Toggle List' }]}
      runCommand={disabledRunCommand}
    />
  );

  expect(dispatchShortcut({ ctrlKey: true, key: 'l' }).defaultPrevented).toBe(false);
  expect(disabledRunCommand).not.toHaveBeenCalled();
  unmount();

  const blockedRunCommand = vi.fn();
  render(
    <Harness
      isCommandSurfaceOpen
      items={[{ enabled: true, id: 'workspace.toggleList', title: 'Toggle List' }]}
      runCommand={blockedRunCommand}
    />
  );

  expect(dispatchShortcut({ ctrlKey: true, key: 'l' }).defaultPrevented).toBe(false);
  expect(blockedRunCommand).not.toHaveBeenCalled();
});
