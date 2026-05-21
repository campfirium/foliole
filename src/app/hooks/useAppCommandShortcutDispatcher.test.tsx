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
      'app.undo': { primary: { ctrlKey: true, key: 'z' } },
      'app.redo': { primary: { ctrlKey: true, key: 'z', shiftKey: true }, tertiary: { ctrlKey: true, key: 'y' } },
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

it('does not dispatch app undo or redo while editable text is focused', () => {
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

  expect(dispatchShortcut({ ctrlKey: true, key: 'z' }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ ctrlKey: true, key: 'z', shiftKey: true }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ ctrlKey: true, key: 'y' }).defaultPrevented).toBe(false);
  expect(runCommand).not.toHaveBeenCalled();
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
