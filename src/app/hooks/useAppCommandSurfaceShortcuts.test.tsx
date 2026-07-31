import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { getPlatformDefaultCommandShortcuts } from '../../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem, CommandShortcutSet } from '../../shared/commands/types';

import { useAppCommandSurfaceShortcuts } from './useAppCommandSurfaceShortcuts';

type Surface = 'command' | 'go-to' | 'move-to' | 'none' | 'search';
type ShortcutMap = Record<string, CommandShortcutSet | undefined>;

const ITEMS: CommandPaletteItem[] = [
  { enabled: true, id: APP_COMMAND_IDS.openCommandPalette, title: 'Command Palette' },
  { enabled: true, id: APP_COMMAND_IDS.openWorkspaceSearch, title: 'Search' }
];

function Harness(props: {
  initialSurface?: Surface;
  isSettingsOpen?: boolean;
  items?: CommandPaletteItem[];
  onRunCommand?: (id: string) => void;
  shortcutMap: ShortcutMap;
}) {
  const [surface, setSurface] = useState<Surface>(props.initialSurface ?? 'none');
  const runCommand = (id: string) => {
    props.onRunCommand?.(id);
    setSurface(id === APP_COMMAND_IDS.openCommandPalette ? 'command' : 'search');
  };
  useAppCommandSurfaceShortcuts({
    isCommandPaletteOpen: surface === 'command',
    isSearchPaletteOpen: surface === 'search',
    isSettingsOpen: props.isSettingsOpen ?? false,
    items: props.items ?? ITEMS,
    runCommand,
    setIsCommandPaletteOpen: (open) => setSurface((current) => open ? 'command' : current === 'command' ? 'none' : current),
    setIsSearchPaletteOpen: (open) => setSurface((current) => open ? 'search' : current === 'search' ? 'none' : current),
    shortcutMap: props.shortcutMap
  });
  return <input aria-label="editor target" data-surface={surface} />;
}

function dispatchShortcut(init: KeyboardEventInit, stopBubbling = false) {
  const input = document.querySelector<HTMLInputElement>('input')!;
  if (stopBubbling) input.addEventListener('keydown', (event) => event.stopPropagation(), { once: true });
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => input.dispatchEvent(event));
  return event;
}

function expectSurface(surface: Surface) {
  expect(document.querySelector('input')).toHaveAttribute('data-surface', surface);
}

it('uses only the resolved macOS defaults and captures before editable targets stop bubbling', () => {
  const shortcutMap = getPlatformDefaultCommandShortcuts('MacIntel');
  render(<Harness shortcutMap={shortcutMap} />);

  expect(dispatchShortcut({ key: 'p', metaKey: true, shiftKey: true }, true).defaultPrevented).toBe(true);
  expectSurface('command');
  dispatchShortcut({ key: 'p', metaKey: true, shiftKey: true });
  expectSurface('none');
  expect(dispatchShortcut({ key: 'p', metaKey: true }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ key: 'k', metaKey: true }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ key: 'f', metaKey: true, shiftKey: true }).defaultPrevented).toBe(true);
  expectSurface('search');
});

it('matches every resolved slot without adding platform-specific keys', () => {
  const onRunCommand = vi.fn();
  const shortcutMap: ShortcutMap = {
    [APP_COMMAND_IDS.openCommandPalette]: {
      primary: { ctrlKey: true, key: 'p' },
      secondary: { altKey: true, key: 'p' },
      tertiary: { key: 'F10', shiftKey: true }
    }
  };
  render(<Harness onRunCommand={onRunCommand} shortcutMap={shortcutMap} />);

  for (const shortcut of [
    { ctrlKey: true, key: 'p' },
    { altKey: true, key: 'p' },
    { key: 'F10', shiftKey: true }
  ]) {
    dispatchShortcut(shortcut);
    expectSurface('command');
    dispatchShortcut(shortcut);
    expectSurface('none');
  }
  expect(onRunCommand).toHaveBeenCalledTimes(3);
});

it('uses a same-window shortcut map update immediately and retires the removed key', () => {
  const onRunCommand = vi.fn();
  const { rerender } = render(
    <Harness onRunCommand={onRunCommand} shortcutMap={{
      [APP_COMMAND_IDS.openCommandPalette]: { primary: { ctrlKey: true, key: 'p' } }
    }} />
  );
  dispatchShortcut({ ctrlKey: true, key: 'p' });
  dispatchShortcut({ ctrlKey: true, key: 'p' });

  rerender(<Harness onRunCommand={onRunCommand} shortcutMap={{
    [APP_COMMAND_IDS.openCommandPalette]: { primary: { ctrlKey: true, key: 'u', shiftKey: true } }
  }} />);
  expect(dispatchShortcut({ ctrlKey: true, key: 'p' }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ ctrlKey: true, key: 'u', shiftKey: true }).defaultPrevented).toBe(true);
  expect(onRunCommand).toHaveBeenCalledTimes(2);
});

it('does not consume shortcuts in settings or when the command is disabled', () => {
  const shortcutMap = getPlatformDefaultCommandShortcuts('Win32');
  const { rerender } = render(<Harness isSettingsOpen shortcutMap={shortcutMap} />);
  expect(dispatchShortcut({ ctrlKey: true, key: 'p' }).defaultPrevented).toBe(false);
  expect(dispatchShortcut({ ctrlKey: true, key: 'k' }).defaultPrevented).toBe(false);

  rerender(<Harness items={ITEMS.map((item) => ({ ...item, enabled: false }))} shortcutMap={shortcutMap} />);
  expect(dispatchShortcut({ ctrlKey: true, key: 'p' }).defaultPrevented).toBe(false);
  expectSurface('none');
});

it('ignores consumed, repeated, and composing events', () => {
  const onRunCommand = vi.fn();
  render(<Harness onRunCommand={onRunCommand} shortcutMap={getPlatformDefaultCommandShortcuts('Win32')} />);
  const consumed = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 'p' });
  consumed.preventDefault();
  document.querySelector('input')!.dispatchEvent(consumed);
  dispatchShortcut({ ctrlKey: true, key: 'p', repeat: true });
  dispatchShortcut({ ctrlKey: true, isComposing: true, key: 'p' });
  expect(onRunCommand).not.toHaveBeenCalled();
  expectSurface('none');
});

it.each([
  ['search', { ctrlKey: true, key: 'p' }, 'command'],
  ['command', { ctrlKey: true, key: 'k' }, 'search'],
  ['go-to', { ctrlKey: true, key: 'p' }, 'command'],
  ['move-to', { ctrlKey: true, key: 'k' }, 'search']
] as const)('switches %s to %s', (initialSurface, shortcut, expectedSurface) => {
  render(<Harness initialSurface={initialSurface} shortcutMap={getPlatformDefaultCommandShortcuts('Win32')} />);
  expect(dispatchShortcut(shortcut).defaultPrevented).toBe(true);
  expectSurface(expectedSurface);
});
