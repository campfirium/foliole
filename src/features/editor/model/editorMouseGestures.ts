export type EditorMouseGestureDirection = 'left' | 'right' | 'up' | 'down';
export const EDITOR_MOUSE_GESTURE_IDS = ['left', 'right', 'left-up', 'left-down'] as const;
export type EditorMouseGestureId = (typeof EDITOR_MOUSE_GESTURE_IDS)[number];
export type EditorMouseGestureActionId = 'scroll-top' | 'scroll-bottom';

export interface EditorMouseGestureBinding {
  action: EditorMouseGestureActionId;
  gesture: EditorMouseGestureId;
}

export const DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS: EditorMouseGestureBinding[] = [
  { action: 'scroll-top', gesture: 'left-up' },
  { action: 'scroll-bottom', gesture: 'left-down' }
];

export function resolveEditorMouseGesture(
  directions: EditorMouseGestureDirection[]
): EditorMouseGestureId | null {
  if (directions.length === 0) {
    return null;
  }

  if (directions[0] === 'right') {
    return 'right';
  }
  if (directions[0] === 'left' && directions.length === 1) {
    return 'left';
  }
  if (directions[0] === 'left' && directions[1] === 'down') {
    return 'left-down';
  }
  if (directions[0] === 'left' && directions[1] === 'up') {
    return 'left-up';
  }
  return null;
}

export function resolveEditorMouseGestureAction(
  bindings: EditorMouseGestureBinding[],
  gesture: EditorMouseGestureId | null
): EditorMouseGestureActionId | null {
  if (!gesture) {
    return null;
  }

  return bindings.find((binding) => binding.gesture === gesture)?.action ?? null;
}
