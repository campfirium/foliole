import { describe, expect, it } from 'vitest';

import { buildCommandShortcutConflictMap, findSystemGlobalShortcutConflict } from './conflicts';

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

it('keeps Alt-letter conflicts based on the declared shortcut', () => {
  const conflicts = buildCommandShortcutConflictMap([
    { commandId: 'editor.highlight', title: 'Highlight', scope: 'global', shortcut: { altKey: true, key: 'z' } },
    { commandId: 'editor.other', title: 'Other', scope: 'global', shortcut: { altKey: true, key: 'Z' } }
  ]);

  expect(conflicts['editor.highlight']?.severity).toBe('error');
  expect(conflicts['editor.other']?.severity).toBe('error');
});

it('blocks application shortcuts consumed by a system-global shortcut', () => {
  const shortcutMap = {
    'capture.globalToInbox': { primary: { altKey: true, key: 'a' } },
    'editor.addSelectionNote': { primary: { key: 'a', metaKey: true, shiftKey: true } }
  };

  expect(findSystemGlobalShortcutConflict({
    candidate: { altKey: true, key: 'a', shiftKey: true },
    commandId: 'editor.addSelectionNote',
    shortcutMap,
    systemGlobalCommandId: 'capture.globalToInbox'
  })).toBe('capture.globalToInbox');
  expect(findSystemGlobalShortcutConflict({
    candidate: { key: 'a', metaKey: true, shiftKey: true },
    commandId: 'editor.addSelectionNote',
    shortcutMap,
    systemGlobalCommandId: 'capture.globalToInbox'
  })).toBeNull();
});

it('blocks a system-global shortcut that would consume an existing application shortcut', () => {
  expect(findSystemGlobalShortcutConflict({
    candidate: { altKey: true, key: 'a' },
    commandId: 'capture.globalToInbox',
    shortcutMap: {
      'capture.globalToInbox': { primary: { altKey: true, key: 'a' } },
      'editor.addSelectionNote': { primary: { altKey: true, key: 'a', shiftKey: true } }
    },
    systemGlobalCommandId: 'capture.globalToInbox'
  })).toBe('editor.addSelectionNote');
});
