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

  it('returns empty map when storage payload is broken json', () => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides, '{broken');

    expect(getCommandShortcutOverrides()).toEqual({});
  });
});

describe('command keymap tertiary defaults', () => {
  it('preserves tertiary default shortcuts alongside overrides', () => {
    const resolved = resolveCommandShortcutMap({
      commandIds: ['review.readingRead'],
      defaults: {
        'review.readingRead': {
          primary: { key: 'w' },
          secondary: { key: ' ' },
          tertiary: { key: '3' }
        }
      },
      overrides: {
        'review.readingRead': { primary: 'R' }
      }
    });

    expect(resolved['review.readingRead']?.primary).toMatchObject({ key: 'r' });
    expect(resolved['review.readingRead']?.secondary).toMatchObject({ key: ' ' });
    expect(resolved['review.readingRead']?.tertiary).toMatchObject({ key: '3' });
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
