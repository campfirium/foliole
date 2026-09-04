import { beforeEach, describe, expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { DEFAULT_EDITOR_MOUSE_GESTURE_TRAIL_COLOR } from '../../../shared/config/defaultAppearanceColors';

import {
  DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS,
  DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS,
  addCustomEditorMouseGesture,
  getEditorMouseGestureSettings,
  resetEditorMouseGestureBindings,
  setEditorMouseGestureBinding
} from './editorMouseGestureSettings';

describe('editorMouseGestureSettings', () => {
  beforeEach(() => window.localStorage.clear());

  it('creates the default twelve-gesture truth when storage is empty', () => {
    expect(getEditorMouseGestureSettings()).toEqual(DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS);
    expect(
      JSON.parse(
        window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureBindings) ?? '[]'
      )
    ).toHaveLength(12);
    expect(DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailColor).toBe(
      DEFAULT_EDITOR_MOUSE_GESTURE_TRAIL_COLOR
    );
  });

  it('converts legal legacy choices once and then only reads the new truth', () => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureLeftAction, 'scroll-bottom');
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureRightAction, 'disabled');
    const migrated = getEditorMouseGestureSettings();
    expect(migrated.bindings.find((item) => item.gesture === 'left')?.commandId).toBe(
      APP_COMMAND_IDS.scrollDocumentBottom
    );
    expect(migrated.bindings.find((item) => item.gesture === 'right')?.commandId).toBeNull();

    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureLeftAction, 'scroll-top');
    expect(
      getEditorMouseGestureSettings().bindings.find((item) => item.gesture === 'left')?.commandId
    ).toBe(APP_COMMAND_IDS.scrollDocumentBottom);
  });
});

describe('editorMouseGestureSettings persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('normalizes display values while preserving unknown command ids', () => {
    const bindings = DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS.map((item) =>
      item.gesture === 'left' ? { ...item, commandId: 'extension.missing' } : item
    );
    window.localStorage.setItem(
      APP_SETTINGS_STORAGE_KEYS.mouseGestureBindings,
      JSON.stringify(bindings)
    );
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailColor, '#ABCDEF');
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailLineWidth, '18');
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailOpacity, '-1');
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureSegmentThreshold, '6');
    const settings = getEditorMouseGestureSettings();
    expect(settings.bindings.find((item) => item.gesture === 'left')?.commandId).toBe(
      'extension.missing'
    );
    expect(settings).toMatchObject({
      segmentThresholdPx: 8,
      trailColor: '#abcdef',
      trailLineWidth: 12,
      trailOpacity: 0.05
    });
  });

  it('persists custom gestures and reset only restores gesture definitions and bindings', () => {
    getEditorMouseGestureSettings();
    setEditorMouseGestureBinding('up', APP_COMMAND_IDS.openWorkspaceSearch);
    expect(
      addCustomEditorMouseGesture(['left', 'right', 'up'], APP_COMMAND_IDS.openWorkspaceSearch)
    ).toBe(true);
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.mouseGesturesEnabled, 'false');
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailColor, '#123456');
    expect(getEditorMouseGestureSettings().bindings).toHaveLength(13);

    resetEditorMouseGestureBindings();
    const reset = getEditorMouseGestureSettings();
    expect(reset.bindings).toEqual(DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS);
    expect(reset.enabled).toBe(false);
    expect(reset.trailColor).toBe('#123456');
  });
});
