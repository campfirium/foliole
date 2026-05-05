import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS,
  resolveEditorMouseGesture,
  resolveEditorMouseGestureAction
} from './editorMouseGestures';

describe('editorMouseGestures', () => {
  it('recognizes one-stroke and two-stroke gestures', () => {
    expect(resolveEditorMouseGesture(['left'])).toBe('left');
    expect(resolveEditorMouseGesture(['right'])).toBe('right');
    expect(resolveEditorMouseGesture(['left', 'down'])).toBe('left-down');
    expect(resolveEditorMouseGesture(['left', 'up', 'up'])).toBe('left-up');
  });

  it('rejects paths that do not match the supported gesture tree', () => {
    expect(resolveEditorMouseGesture(['down', 'left'])).toBeNull();
    expect(resolveEditorMouseGesture(['left', 'right'])).toBeNull();
    expect(resolveEditorMouseGesture(['up'])).toBeNull();
  });

  it('maps gestures to actions through bindings', () => {
    expect(resolveEditorMouseGestureAction(DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS, 'left-up')).toBe('scroll-top');
    expect(resolveEditorMouseGestureAction(DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS, 'left-down')).toBe('scroll-bottom');
    expect(resolveEditorMouseGestureAction([], 'left-up')).toBeNull();
  });
});
