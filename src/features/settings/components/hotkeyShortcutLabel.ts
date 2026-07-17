import type { RuntimeKeyboardInputPayload } from '../../../shared/platform/nativeHotkeyRecordingRuntime';

const ACCELERATOR_KEY_BY_CODE: Record<string, string> = {
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  AudioVolumeDown: 'VolumeDown',
  AudioVolumeMute: 'VolumeMute',
  AudioVolumeUp: 'VolumeUp',
  Backquote: '`',
  Backslash: '\\',
  Backspace: 'Backspace',
  BracketLeft: '[',
  BracketRight: ']',
  CapsLock: 'Capslock',
  Comma: ',',
  Delete: 'Delete',
  End: 'End',
  Enter: 'Enter',
  Equal: '=',
  Escape: 'Escape',
  Home: 'Home',
  Insert: 'Insert',
  IntlBackslash: '\\',
  MediaPlayPause: 'MediaPlayPause',
  MediaStop: 'MediaStop',
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack',
  Minus: '-',
  NumpadAdd: 'numadd',
  NumpadComma: 'numdec',
  NumpadDecimal: 'numdec',
  NumpadDivide: 'numdiv',
  NumpadEnter: 'Enter',
  NumpadEqual: '=',
  NumpadMultiply: 'nummult',
  NumpadSubtract: 'numsub',
  NumLock: 'Numlock',
  PageDown: 'PageDown',
  PageUp: 'PageUp',
  Period: '.',
  PrintScreen: 'PrintScreen',
  Quote: "'",
  ScrollLock: 'Scrolllock',
  Semicolon: ';',
  Slash: '/',
  Space: 'Space',
  Tab: 'Tab'
};

function acceleratorKeyFromCode(code: string) {
  const letterMatch = /^Key([A-Z])$/.exec(code);
  if (letterMatch) return letterMatch[1]!;
  const digitMatch = /^Digit([0-9])$/.exec(code);
  if (digitMatch) return digitMatch[1]!;
  const functionMatch = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code);
  if (functionMatch) return functionMatch[0];
  const numpadDigitMatch = /^Numpad([0-9])$/.exec(code);
  if (numpadDigitMatch) return `num${numpadDigitMatch[1]}`;
  return ACCELERATOR_KEY_BY_CODE[code];
}

function formatShortcutKey(value: string) {
  if (value === ' ') return 'Space';
  return value.length === 1 ? value.toUpperCase() : value;
}

export function nativeInputToShortcutLabel(input: RuntimeKeyboardInputPayload, acceleratorCompatible = false) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(input.key)) {
    return '';
  }
  const parts: string[] = [];
  if (input.metaKey) parts.push('Cmd');
  if (input.controlKey) parts.push('Ctrl');
  if (input.altKey) parts.push('Alt');
  if (input.shiftKey) parts.push('Shift');
  const key = acceleratorCompatible ? acceleratorKeyFromCode(input.code) ?? input.key : input.key;
  parts.push(formatShortcutKey(key));
  return parts.join('+');
}
