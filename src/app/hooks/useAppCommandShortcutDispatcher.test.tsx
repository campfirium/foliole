import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem } from '../../shared/commands/types';

import { useAppCommandShortcutDispatcher } from './useAppCommandShortcutDispatcher';

function dispatchShortcut(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

function dispatchShortcutFrom(target: HTMLElement, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
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
      'app.undo': { primary: { ctrlKey: true, key: 'z' } },
      'app.redo': { primary: { ctrlKey: true, key: 'z', shiftKey: true }, secondary: { ctrlKey: true, key: 'y' } },
      'import.clipboard': { primary: { ctrlKey: true, altKey: true, key: 'v' } },
      'import.singleFileToInbox': { primary: { ctrlKey: true, key: 'o' } },
      'editor.toggleImmersiveMode': { primary: { key: 'F10' } },
      'workspace.renameNode': { primary: { key: 'F4' } },
      'workspace.toggleDevTools': { primary: { altKey: true, key: 'i' } },
      'workspace.createFolder': { primary: { ctrlKey: true, altKey: true, key: 'f' } },
      'editor.toggleDisplayMode': { primary: { ctrlKey: true, key: '\\' } },
      'workspace.toggleList': { primary: { key: '[' }, secondary: { ctrlKey: true, key: 'l' } },
      'workspace.toggleRightSidebar': { primary: { key: ']' } },
      'workspace.toggleBothSidebars': { primary: { key: '\\' } }
    }
  });
  return <section data-undo-history-owner="content"><input aria-label="text input" /></section>;
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

it('routes remapped app commands without retaining their former hardcoded keys', () => {
  const runCommand = vi.fn();
  render(
    <Harness
      items={[
        { enabled: true, id: APP_COMMAND_IDS.toggleDevTools, title: 'Toggle DevTools' },
        { enabled: true, id: APP_COMMAND_IDS.renameNode, title: 'Rename Node' }
      ]}
      runCommand={runCommand}
    />
  );

  expect(dispatchShortcut({ ctrlKey: true, key: 'i', shiftKey: true }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ key: 'F2' }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ altKey: true, key: 'i' }).defaultPrevented).toBe(true);
  expect(dispatchShortcut({ key: 'F4' }).defaultPrevented).toBe(true);
  expect(runCommand).toHaveBeenNthCalledWith(1, APP_COMMAND_IDS.toggleDevTools);
  expect(runCommand).toHaveBeenNthCalledWith(2, APP_COMMAND_IDS.renameNode);
});

it('dispatches import shortcuts before an editor target can stop bubbling', () => {
  const runCommand = vi.fn();
  render(
    <Harness
      items={[
        { enabled: true, id: 'import.singleFileToInbox', title: 'Import Files' },
        { enabled: true, id: 'import.clipboard', title: 'Import Clipboard' }
      ]}
      runCommand={runCommand}
    />
  );
  const input = document.querySelector('input')!;
  input.addEventListener('keydown', (event) => event.stopPropagation());
  input.focus();

  expect(dispatchShortcutFrom(input, { ctrlKey: true, key: 'o' }).defaultPrevented).toBe(true);
  expect(dispatchShortcutFrom(input, { ctrlKey: true, altKey: true, key: 'v' }).defaultPrevented).toBe(true);
  expect(runCommand).toHaveBeenNthCalledWith(1, 'import.singleFileToInbox');
  expect(runCommand).toHaveBeenNthCalledWith(2, 'import.clipboard');
});

it('dispatches non-editing bracket sidebar shortcuts', () => {
  const runCommand = vi.fn();
  render(
    <Harness
      items={[
        { enabled: true, id: 'workspace.toggleList', title: 'Toggle Left Sidebar' },
        { enabled: true, id: 'workspace.toggleRightSidebar', title: 'Toggle Right Sidebar' },
        { enabled: true, id: 'workspace.toggleBothSidebars', title: 'Toggle Both Sidebars' }
      ]}
      runCommand={runCommand}
    />
  );

  expect(dispatchShortcut({ key: '[' }).defaultPrevented).toBe(true);
  expect(dispatchShortcut({ key: ']' }).defaultPrevented).toBe(true);
  expect(dispatchShortcut({ key: '\\' }).defaultPrevented).toBe(true);
  expect(runCommand).toHaveBeenNthCalledWith(1, 'workspace.toggleList');
  expect(runCommand).toHaveBeenNthCalledWith(2, 'workspace.toggleRightSidebar');
  expect(runCommand).toHaveBeenNthCalledWith(3, 'workspace.toggleBothSidebars');
});

it('does not dispatch bracket sidebar shortcuts while editable text is focused', () => {
  const runCommand = vi.fn();
  render(
    <Harness
      items={[
        { enabled: true, id: 'workspace.toggleList', title: 'Toggle Left Sidebar' },
        { enabled: true, id: 'workspace.toggleRightSidebar', title: 'Toggle Right Sidebar' },
        { enabled: true, id: 'workspace.toggleBothSidebars', title: 'Toggle Both Sidebars' }
      ]}
      runCommand={runCommand}
    />
  );
  document.querySelector('input')!.focus();

  expect(dispatchShortcut({ key: '[' }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ key: ']' }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ key: '\\' }).defaultPrevented).toBe(false);
  expect(runCommand).not.toHaveBeenCalled();
});

it('dispatches app undo when no editable text is focused', () => {
  const runCommand = vi.fn();
  render(
    <Harness
      items={[{ enabled: true, id: 'app.undo', title: 'Undo Dismiss Topic' }]}
      runCommand={runCommand}
    />
  );

  const event = dispatchShortcut({ ctrlKey: true, key: 'z' });

  expect(event.defaultPrevented).toBe(true);
  expect(runCommand).toHaveBeenCalledWith('app.undo');
});

it('dispatches configured app undo and redo through the content owner while editing', () => {
  const runCommand = vi.fn();
  render(
    <Harness
      items={[
        { enabled: true, id: 'app.undo', title: 'Undo Dismiss Topic' },
        { enabled: true, id: 'app.redo', title: 'Redo Dismiss Topic' }
      ]}
      runCommand={runCommand}
    />
  );
  const input = document.querySelector('input')!;
  input.focus();

  expect(dispatchShortcutFrom(input, { ctrlKey: true, key: 'z' }).defaultPrevented).toBe(true);
  expect(dispatchShortcutFrom(input, { ctrlKey: true, key: 'z', shiftKey: true }).defaultPrevented).toBe(true);
  expect(dispatchShortcutFrom(input, { ctrlKey: true, key: 'y' }).defaultPrevented).toBe(true);
  expect(runCommand).toHaveBeenNthCalledWith(1, 'app.undo');
  expect(runCommand).toHaveBeenNthCalledWith(2, 'app.redo');
  expect(runCommand).toHaveBeenNthCalledWith(3, 'app.redo');
});

it('dispatches app redo from Ctrl+Y when no editable text is focused', () => {
  const runCommand = vi.fn();
  render(
    <Harness
      items={[{ enabled: true, id: 'app.redo', title: 'Redo Create Annotation' }]}
      runCommand={runCommand}
    />
  );

  const event = dispatchShortcut({ ctrlKey: true, key: 'y' });

  expect(event.defaultPrevented).toBe(true);
  expect(runCommand).toHaveBeenCalledWith('app.redo');
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

it('leaves command surface entry shortcuts to their dedicated capture handler', () => {
  const runCommand = vi.fn();
  render(
    <Harness
      items={[
        { enabled: true, id: APP_COMMAND_IDS.openCommandPalette, title: 'Command Palette' },
        { enabled: true, id: APP_COMMAND_IDS.openWorkspaceSearch, title: 'Search' }
      ]}
      runCommand={runCommand}
    />
  );

  expect(dispatchShortcut({ ctrlKey: true, key: 'p' }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ ctrlKey: true, key: 'k' }).defaultPrevented).toBe(false);
  expect(runCommand).not.toHaveBeenCalled();
});
