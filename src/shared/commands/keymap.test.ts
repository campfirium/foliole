import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { getCommandShortcutOverrides, resolveCommandShortcutMap } from './keymap';

function clearStorage() {
  window.localStorage.clear();
}

describe('command keymap overrides', () => {
  beforeEach(() => {
    clearStorage();
  });

  it('reads valid overrides from storage and ignores invalid entries', () => {
    window.localStorage.setItem(
      APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides,
      JSON.stringify({
        'workspace.openSettings': 'Alt+S',
        'workspace.openTrash': 'Not+A+Shortcut+Extra'
      })
    );

    const overrides = getCommandShortcutOverrides();

    expect(overrides).toEqual({ 'workspace.openSettings': 'Alt+S' });
  });

  it('resolves defaults and runtime overrides', () => {
    const resolved = resolveCommandShortcutMap({
      commandIds: ['workspace.openSettings', 'navigation.goBack'],
      defaults: {
        'navigation.goBack': { key: 'ArrowLeft', altKey: true }
      },
      overrides: {
        'workspace.openSettings': 'Ctrl+Shift+O'
      }
    });

    expect(resolved['workspace.openSettings']).toMatchObject({ key: 'o', ctrlKey: true, shiftKey: true });
    expect(resolved['navigation.goBack']).toMatchObject({ key: 'ArrowLeft', altKey: true });
  });

  it('falls back to defaults when override cannot be parsed', () => {
    const resolved = resolveCommandShortcutMap({
      commandIds: ['review.revealAnswer'],
      defaults: {
        'review.revealAnswer': { key: ' ', shiftKey: true }
      },
      overrides: {
        'review.revealAnswer': 'Invalid+Too+Many+Keys+A'
      }
    });

    expect(resolved['review.revealAnswer']).toMatchObject({ key: ' ', shiftKey: true });
  });

  it('returns empty map when storage payload is broken json', () => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides, '{broken');

    expect(getCommandShortcutOverrides()).toEqual({});
  });
});

describe('command keymap parsing', () => {
  beforeEach(() => {
    clearStorage();
  });

  it('parses lowercase shortcut labels from storage', () => {
    window.localStorage.setItem(
      APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides,
      JSON.stringify({
        'workspace.toggleList': 'ctrl+l'
      })
    );

    const resolved = resolveCommandShortcutMap({
      commandIds: ['workspace.toggleList'],
      defaults: {},
      overrides: getCommandShortcutOverrides()
    });

    expect(resolved['workspace.toggleList']).toEqual({ key: 'l', ctrlKey: true });
  });

  it('does not throw when localStorage read fails', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => getCommandShortcutOverrides()).not.toThrow();

    spy.mockRestore();
  });
});
