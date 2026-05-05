export type EditorMouseGestureDirection = 'left' | 'right' | 'up' | 'down';
export type EditorMouseGestureId = 'left-down' | 'left-up';
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
  if (directions.length < 2) {
    return null;
  }

  const normalized = directions.slice(0, 2);
  if (normalized[0] === 'left' && normalized[1] === 'down') {
    return 'left-down';
  }
  if (normalized[0] === 'left' && normalized[1] === 'up') {
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
