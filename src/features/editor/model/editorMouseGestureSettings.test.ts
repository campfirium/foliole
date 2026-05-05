import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS,
  getEditorMouseGestureBindings,
  getEditorMouseGestureSettings
} from './editorMouseGestureSettings';

describe('editorMouseGestureSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns the default settings when storage is empty', () => {
    expect(getEditorMouseGestureSettings()).toEqual(DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS);
  });

  it('normalizes malformed stored values', () => {
    window.localStorage.setItem('foliole-mouse-gesture-left-action', 'scroll-bottom');
    window.localStorage.setItem('foliole-mouse-gesture-right-action', 'oops');
    window.localStorage.setItem('foliole-mouse-gesture-trail-color', '#ABCDEF');
    window.localStorage.setItem('foliole-mouse-gesture-trail-line-width', '18');
    window.localStorage.setItem('foliole-mouse-gesture-trail-opacity', '-1');
    window.localStorage.setItem('foliole-mouse-gesture-segment-threshold', '6');
    window.localStorage.setItem('foliole-mouse-gesture-trail-point-threshold', '12');

    expect(getEditorMouseGestureSettings()).toEqual({
      ...DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS,
      gestureActions: {
        ...DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.gestureActions,
        left: 'scroll-bottom'
      },
      trailColor: '#abcdef',
      trailLineWidth: 12,
      trailOpacity: 0.05,
      segmentThresholdPx: 8,
      trailPointThresholdPx: 12
    });
  });

  it('builds runtime bindings from enabled actions only', () => {
    expect(
      getEditorMouseGestureBindings({
        ...DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS,
        gestureActions: {
          left: 'scroll-top',
          right: 'disabled',
          'left-up': 'scroll-bottom',
          'left-down': 'disabled'
        }
      })
    ).toEqual([
      { action: 'scroll-top', gesture: 'left' },
      { action: 'scroll-bottom', gesture: 'left-up' }
    ]);
  });
});
