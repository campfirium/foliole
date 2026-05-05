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
        title: 'Go Back',
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
        title: 'Close Settings',
        isEnabled: () => false,
        execute: firstExecute,
        shortcut: { key: 'Escape' }
      },
      {
        id: 'ui.closeContextMenu',
        title: 'Close Context Menu',
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

  it('runs command by id and blocks disabled commands', () => {
    const execute = vi.fn();
    const registry = createCommandRegistry([
      {
        id: 'workspace.openSettings',
        title: 'Open Settings',
        execute
      },
      {
        id: 'workspace.hiddenAction',
        title: 'Hidden',
        isEnabled: () => false,
        execute
      }
    ]);

    expect(registry.runById('workspace.openSettings')).toBe(true);
    expect(registry.runById('workspace.hiddenAction')).toBe(false);
    expect(registry.runById('workspace.missing')).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns palette items with filtering and enabled state', () => {
    const registry = createCommandRegistry([
      {
        id: 'navigation.goParent',
        title: 'Go Parent',
        section: 'Navigation',
        keywords: ['up'],
        isEnabled: () => false,
        execute: () => undefined
      },
      {
        id: 'workspace.openSettings',
        title: 'Open Settings',
        section: 'Workspace',
        execute: () => undefined
      }
    ]);

    const allItems = registry.getPaletteItems();
    const filteredItems = registry.getPaletteItems('settings');

    expect(allItems).toHaveLength(2);
    expect(allItems[0]).toMatchObject({ id: 'navigation.goParent', enabled: false });
    expect(filteredItems).toHaveLength(1);
    expect(filteredItems[0]?.id).toBe('workspace.openSettings');
  });

  it('evaluates enabled state against latest context snapshot', () => {
    let canRun = false;
    const registry = createCommandRegistry(
      [
        {
          id: 'review.revealAnswer',
          title: 'Show Answer',
          isEnabled: (context) => Boolean(context.isStudyMode),
          execute: () => undefined
        }
      ],
      () => ({ isStudyMode: canRun })
    );

    expect(registry.getPaletteItems()[0]?.enabled).toBe(false);

    canRun = true;
    expect(registry.getPaletteItems()[0]?.enabled).toBe(true);
    expect(registry.getCommandStates()[0]).toMatchObject({ id: 'review.revealAnswer', enabled: true });
  });

  it('supports externally resolved shortcut overrides', () => {
    const execute = vi.fn();
    const registry = createCommandRegistry([
      {
        id: 'workspace.openSettings',
        title: 'Open Settings',
        execute,
        shortcut: { key: 'o', ctrlKey: true, shiftKey: true }
      }
    ]);

    const defaultEvent = new KeyboardEvent('keydown', { key: 'o', ctrlKey: true });
    const overrideEvent = new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, shiftKey: true });

    expect(registry.runByShortcut(defaultEvent)).toBe(false);
    expect(registry.runByShortcut(overrideEvent)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
