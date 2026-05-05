import { describe, expect, it, vi } from 'vitest';

import { createCommandRegistry } from './registry';
import { matchesShortcut } from './shortcuts';

describe('command registry', () => {
  it('matches shortcut only when modifiers exactly match', () => {
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true });
    const matched = matchesShortcut(event, { key: 'ArrowLeft', altKey: true });
    const notMatched = matchesShortcut(event, { key: 'ArrowLeft', altKey: true, shiftKey: true });

    expect(matched).toBe(true);
    expect(notMatched).toBe(false);
  });

  it('runs command and prevents default when shortcut matches', () => {
    const execute = vi.fn();
    const registry = createCommandRegistry([
      {
        id: 'navigation.goBack',
        execute,
        shortcut: { key: 'ArrowLeft', altKey: true }
      }
    ]);
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    const consumed = registry.runByShortcut(event);

    expect(consumed).toBe(true);
    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('skips disabled command and continues matching next command', () => {
    const firstExecute = vi.fn();
    const secondExecute = vi.fn();
    const registry = createCommandRegistry([
      {
        id: 'ui.closeSettings',
        isEnabled: () => false,
        execute: firstExecute,
        shortcut: { key: 'Escape' }
      },
      {
        id: 'ui.closeContextMenu',
        execute: secondExecute,
        shortcut: { key: 'Escape' }
      }
    ]);
    const event = new KeyboardEvent('keydown', { key: 'Escape' });

    const consumed = registry.runByShortcut(event);

    expect(consumed).toBe(true);
    expect(firstExecute).not.toHaveBeenCalled();
    expect(secondExecute).toHaveBeenCalledTimes(1);
  });
});
