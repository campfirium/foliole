import type { RuntimeKeyboardInputPayload } from '../../../shared/platform/nativeHotkeyRecordingRuntime';

function formatShortcutKey(value: string) {
  if (value === ' ') return 'Space';
  return value.length === 1 ? value.toUpperCase() : value;
}

export function nativeInputToShortcutLabel(input: RuntimeKeyboardInputPayload) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(input.key)) {
    return '';
  }
  const parts: string[] = [];
  if (input.metaKey) parts.push('Cmd');
  if (input.controlKey) parts.push('Ctrl');
  if (input.altKey) parts.push('Alt');
  if (input.shiftKey) parts.push('Shift');
  parts.push(formatShortcutKey(input.key));
  return parts.join('+');
}
