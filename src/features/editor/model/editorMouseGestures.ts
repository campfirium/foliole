export type EditorMouseGestureDirection = 'left' | 'right' | 'up' | 'down';
export type EditorMouseGestureId = string;

export interface EditorMouseGestureDefinition {
  directions: EditorMouseGestureDirection[];
  gesture: EditorMouseGestureId;
  isCustom: boolean;
}

export interface EditorMouseGestureBinding extends EditorMouseGestureDefinition {
  commandId: string | null;
}

const DIRECTIONS: EditorMouseGestureDirection[] = ['up', 'down', 'left', 'right'];

export function toEditorMouseGestureId(directions: EditorMouseGestureDirection[]) {
  return directions.join('-');
}

export function normalizeEditorMouseGestureDirections(
  directions: EditorMouseGestureDirection[],
  maxSegments = 8
) {
  return directions.reduce<EditorMouseGestureDirection[]>((result, direction) => {
    if (result.length < maxSegments && result.at(-1) !== direction) result.push(direction);
    return result;
  }, []);
}

export const BASE_EDITOR_MOUSE_GESTURES: EditorMouseGestureDefinition[] = DIRECTIONS.flatMap(
  (first) => [
    { directions: [first], gesture: first, isCustom: false },
    ...DIRECTIONS.filter((second) => second !== first).map((second) => ({
      directions: [first, second],
      gesture: `${first}-${second}`,
      isCustom: false
    }))
  ]
);

export const EDITOR_MOUSE_GESTURE_IDS = BASE_EDITOR_MOUSE_GESTURES.map(
  (gesture) => gesture.gesture
);

export function resolveEditorMouseGesture(
  directions: EditorMouseGestureDirection[],
  bindings: EditorMouseGestureBinding[] = []
): EditorMouseGestureId | null {
  const gesture = toEditorMouseGestureId(normalizeEditorMouseGestureDirections(directions));
  if (!gesture) return null;
  return [...BASE_EDITOR_MOUSE_GESTURES, ...bindings].some((item) => item.gesture === gesture)
    ? gesture
    : null;
}

export function resolveEditorMouseGestureCommand(
  bindings: EditorMouseGestureBinding[],
  gesture: EditorMouseGestureId | null
) {
  return gesture
    ? (bindings.find((binding) => binding.gesture === gesture)?.commandId ?? null)
    : null;
}

export function validateCustomEditorMouseGesture(
  directions: EditorMouseGestureDirection[],
  bindings: EditorMouseGestureBinding[]
): 'valid' | 'empty' | 'conflict' {
  const normalized = normalizeEditorMouseGestureDirections(directions);
  if (!normalized.length) return 'empty';
  const gesture = toEditorMouseGestureId(normalized);
  return [...BASE_EDITOR_MOUSE_GESTURES, ...bindings].some((item) => item.gesture === gesture)
    ? 'conflict'
    : 'valid';
}
