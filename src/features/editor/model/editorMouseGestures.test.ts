import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS,
  resolveEditorMouseGesture,
  resolveEditorMouseGestureAction
} from './editorMouseGestures';

describe('editorMouseGestures', () => {
  it('recognizes left-down and left-up gestures from the first two segments', () => {
    expect(resolveEditorMouseGesture(['left', 'down'])).toBe('left-down');
    expect(resolveEditorMouseGesture(['left', 'up', 'up'])).toBe('left-up');
  });

  it('rejects paths that do not start with left then vertical', () => {
    expect(resolveEditorMouseGesture(['down', 'left'])).toBeNull();
    expect(resolveEditorMouseGesture(['left'])).toBeNull();
    expect(resolveEditorMouseGesture(['left', 'right'])).toBeNull();
  });

  it('maps gestures to actions through bindings', () => {
    expect(resolveEditorMouseGestureAction(DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS, 'left-up')).toBe('scroll-top');
    expect(resolveEditorMouseGestureAction(DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS, 'left-down')).toBe('scroll-bottom');
    expect(resolveEditorMouseGestureAction([], 'left-up')).toBeNull();
  });
});
