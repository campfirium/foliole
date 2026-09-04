import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';

import {
  BASE_EDITOR_MOUSE_GESTURES,
  type EditorMouseGestureBinding,
  type EditorMouseGestureDirection,
  type EditorMouseGestureId,
  normalizeEditorMouseGestureDirections,
  toEditorMouseGestureId,
  validateCustomEditorMouseGesture
} from './editorMouseGestures';

const DEFAULT_COMMANDS: Record<string, string | null> = {
  left: APP_COMMAND_IDS.goBack,
  right: APP_COMMAND_IDS.goForward,
  'left-up': APP_COMMAND_IDS.scrollDocumentTop,
  'left-down': APP_COMMAND_IDS.scrollDocumentBottom
};

export const DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS: EditorMouseGestureBinding[] =
  BASE_EDITOR_MOUSE_GESTURES.map((definition) => ({
    ...definition,
    commandId: DEFAULT_COMMANDS[definition.gesture] ?? null
  }));

const LEGACY_KEYS: Partial<Record<EditorMouseGestureId, string>> = {
  left: APP_SETTINGS_STORAGE_KEYS.mouseGestureLeftAction,
  right: APP_SETTINGS_STORAGE_KEYS.mouseGestureRightAction,
  'left-up': APP_SETTINGS_STORAGE_KEYS.mouseGestureLeftUpAction,
  'left-down': APP_SETTINGS_STORAGE_KEYS.mouseGestureLeftDownAction
};

function legacyCommandId(gesture: string, value: string | null) {
  if (value === 'disabled') return null;
  if (value === 'scroll-top') return APP_COMMAND_IDS.scrollDocumentTop;
  if (value === 'scroll-bottom') return APP_COMMAND_IDS.scrollDocumentBottom;
  return DEFAULT_COMMANDS[gesture] ?? null;
}

function migrateLegacyBindings() {
  const bindings = DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS.map((binding) => {
    const key = LEGACY_KEYS[binding.gesture];
    return key
      ? {
          ...binding,
          commandId: legacyCommandId(binding.gesture, getWhitelistedLocalStorageItem(key))
        }
      : binding;
  });
  writeEditorMouseGestureBindings(bindings);
  return bindings;
}

function isDirection(value: unknown): value is EditorMouseGestureDirection {
  return value === 'left' || value === 'right' || value === 'up' || value === 'down';
}

function parseStoredBindings(raw: string): EditorMouseGestureBinding[] | null {
  try {
    const stored = JSON.parse(raw) as unknown;
    if (!Array.isArray(stored)) return null;
    const custom: EditorMouseGestureBinding[] = [];
    const commandByGesture = new Map<string, string | null>();
    for (const item of stored) {
      if (!item || typeof item !== 'object') continue;
      const value = item as { commandId?: unknown; directions?: unknown; isCustom?: unknown };
      if (!Array.isArray(value.directions) || !value.directions.every(isDirection)) continue;
      const directions = normalizeEditorMouseGestureDirections(value.directions);
      const gesture = toEditorMouseGestureId(directions);
      const commandId = typeof value.commandId === 'string' ? value.commandId : null;
      if (
        value.isCustom === true &&
        validateCustomEditorMouseGesture(directions, custom) === 'valid'
      ) {
        custom.push({ commandId, directions, gesture, isCustom: true });
      } else if (BASE_EDITOR_MOUSE_GESTURES.some((base) => base.gesture === gesture)) {
        commandByGesture.set(gesture, commandId);
      }
    }
    return [
      ...DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS.map((binding) => ({
        ...binding,
        commandId: commandByGesture.has(binding.gesture)
          ? (commandByGesture.get(binding.gesture) ?? null)
          : binding.commandId
      })),
      ...custom
    ];
  } catch {
    return null;
  }
}

export function readEditorMouseGestureBindings() {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureBindings);
  if (raw === null) return migrateLegacyBindings();
  return parseStoredBindings(raw) ?? DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS;
}

function writeEditorMouseGestureBindings(bindings: EditorMouseGestureBinding[]) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.mouseGestureBindings,
    JSON.stringify(bindings)
  );
}

export function setEditorMouseGestureBinding(
  gesture: EditorMouseGestureId,
  commandId: string | null
) {
  writeEditorMouseGestureBindings(
    readEditorMouseGestureBindings().map((binding) =>
      binding.gesture === gesture ? { ...binding, commandId } : binding
    )
  );
}

export function addCustomEditorMouseGesture(
  directions: EditorMouseGestureDirection[],
  commandId: string
) {
  const bindings = readEditorMouseGestureBindings();
  if (validateCustomEditorMouseGesture(directions, bindings) !== 'valid') return false;
  const normalized = normalizeEditorMouseGestureDirections(directions);
  writeEditorMouseGestureBindings([
    ...bindings,
    {
      commandId,
      directions: normalized,
      gesture: toEditorMouseGestureId(normalized),
      isCustom: true
    }
  ]);
  return true;
}

export function resetEditorMouseGestureBindings() {
  writeEditorMouseGestureBindings(DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS);
}

export function hasCustomEditorMouseGestureBindings(bindings: EditorMouseGestureBinding[]) {
  return (
    bindings.length !== DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS.length ||
    bindings.some((binding) => {
      const defaultBinding = DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS.find(
        (item) => item.gesture === binding.gesture
      );
      return !defaultBinding || defaultBinding.commandId !== binding.commandId;
    })
  );
}
