import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { getPlatformDefaultCommandShortcuts } from './defaultShortcuts';
import { APP_COMMAND_IDS } from './ids';
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

    expect(overrides).toEqual({ 'workspace.openSettings': { primary: 'Alt+S' } });
  });

  it('resolves defaults and runtime overrides', () => {
    const resolved = resolveCommandShortcutMap({
      commandIds: ['workspace.openSettings', 'navigation.goBack'],
      defaults: {
        'navigation.goBack': { primary: { key: 'ArrowLeft', altKey: true } }
      },
      overrides: {
        'workspace.openSettings': { primary: 'Ctrl+Shift+O' }
      }
    });

    expect(resolved['workspace.openSettings']?.primary).toMatchObject({ key: 'o', ctrlKey: true, shiftKey: true });
    expect(resolved['navigation.goBack']?.primary).toMatchObject({ key: 'ArrowLeft', altKey: true });
  });

  it('falls back to defaults when override cannot be parsed', () => {
    const resolved = resolveCommandShortcutMap({
      commandIds: ['review.revealAnswer'],
      defaults: {
        'review.revealAnswer': { primary: { key: ' ', shiftKey: true } }
      },
      overrides: {
        'review.revealAnswer': { primary: 'Invalid+Too+Many+Keys+A' }
      }
    });

    expect(resolved['review.revealAnswer']?.primary).toMatchObject({ key: ' ', shiftKey: true });
  });

  it('preserves navigation customization and restores the platform default when reset', () => {
    const defaults = getPlatformDefaultCommandShortcuts('MacIntel');
    const customized = resolveCommandShortcutMap({
      commandIds: [APP_COMMAND_IDS.goToLastChild],
      defaults,
      overrides: { [APP_COMMAND_IDS.goToLastChild]: { primary: 'Command+Shift+J' } }
    });
    const reset = resolveCommandShortcutMap({
      commandIds: [APP_COMMAND_IDS.goToLastChild],
      defaults,
      overrides: {}
    });

    expect(customized[APP_COMMAND_IDS.goToLastChild]?.primary).toEqual({ key: 'j', metaKey: true, shiftKey: true });
    expect(reset[APP_COMMAND_IDS.goToLastChild]?.primary).toEqual({ key: 'ArrowDown', metaKey: true });
  });

  it('returns empty map when storage payload is broken json', () => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides, '{broken');

    expect(getCommandShortcutOverrides()).toEqual({});
  });
});

describe('command keymap cleared slots', () => {
  it('keeps explicit blank slots cleared until the command is reset', () => {
    const resolved = resolveCommandShortcutMap({
      commandIds: ['app.redo'],
      defaults: {
        'app.redo': {
          primary: { key: 'z', ctrlKey: true, shiftKey: true },
          secondary: { key: 'y', ctrlKey: true }
        }
      },
      overrides: {
        'app.redo': { primary: '', secondary: '' }
      }
    });

    expect(resolved['app.redo']).toBeUndefined();
  });

  it('preserves blank slot overrides loaded from storage', () => {
    window.localStorage.setItem(
      APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides,
      JSON.stringify({ 'app.redo': { primary: '', secondary: 'Ctrl+R' } })
    );

    expect(getCommandShortcutOverrides()).toEqual({
      'app.redo': { primary: '', secondary: 'Ctrl+R' }
    });
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

    expect(resolved['workspace.toggleList']).toEqual({ primary: { key: 'l', ctrlKey: true } });
  });

  it('does not throw when localStorage read fails', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => getCommandShortcutOverrides()).not.toThrow();

    spy.mockRestore();
  });
});
