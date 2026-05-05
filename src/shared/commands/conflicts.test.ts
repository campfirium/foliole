import { describe, expect, it } from 'vitest';

import { buildCommandShortcutConflictMap } from './conflicts';

describe('command shortcut conflicts', () => {
  it('marks same-scope duplicate as error', () => {
    const conflicts = buildCommandShortcutConflictMap([
      {
        commandId: 'navigation.goBack',
        title: 'Go Back',
        scope: 'global',
        shortcut: { key: 'ArrowLeft', altKey: true }
      },
      {
        commandId: 'workspace.openSettings',
        title: 'Open Settings',
        scope: 'global',
        shortcut: { key: 'ArrowLeft', altKey: true }
      }
    ]);

    expect(conflicts['navigation.goBack']?.severity).toBe('error');
    expect(conflicts['workspace.openSettings']?.severity).toBe('error');
  });

  it('marks cross-scope duplicate as warning', () => {
    const conflicts = buildCommandShortcutConflictMap([
      {
        commandId: 'ui.closeSettings',
        title: 'Close Settings',
        scope: 'settings',
        shortcut: { key: 'Escape' }
      },
      {
        commandId: 'ui.closeCommandPalette',
        title: 'Close Palette',
        scope: 'commandPalette',
        shortcut: { key: 'Escape' }
      }
    ]);

    expect(conflicts['ui.closeSettings']?.severity).toBe('warning');
    expect(conflicts['ui.closeCommandPalette']?.severity).toBe('warning');
  });

  it('returns empty map when no conflicts exist', () => {
    const conflicts = buildCommandShortcutConflictMap([
      {
        commandId: 'navigation.goBack',
        title: 'Go Back',
        scope: 'global',
        shortcut: { key: 'ArrowLeft', altKey: true }
      },
      {
        commandId: 'workspace.openSettings',
        title: 'Open Settings',
        scope: 'global',
        shortcut: { key: 'o', ctrlKey: true }
      }
    ]);

    expect(conflicts).toEqual({});
  });
});
