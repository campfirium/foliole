import { expect, it } from 'vitest';

import type { RuntimeKeyboardInputPayload } from '../../../shared/platform/nativeHotkeyRecordingRuntime';

import { nativeInputToShortcutLabel } from './hotkeyShortcutLabel';

function optionInput(code: string, key: string, shiftKey = false): RuntimeKeyboardInputPayload {
  return {
    altKey: true,
    code,
    controlKey: false,
    key,
    metaKey: false,
    shiftKey,
    type: 'keyDown'
  };
}

it.each([
  ['KeyC', 'ç', false, 'Alt+C'],
  ['KeyW', '∑', false, 'Alt+W'],
  ['Digit2', '™', false, 'Alt+2'],
  ['Slash', '¿', true, 'Alt+Shift+/'],
  ['ArrowUp', 'ArrowUp', false, 'Alt+Up'],
  ['F12', 'F12', false, 'Alt+F12'],
  ['Numpad1', 'End', false, 'Alt+num1'],
  ['NumpadAdd', '+', false, 'Alt+numadd'],
  ['Space', ' ', false, 'Alt+Space']
])('records Option plus %s as an Electron accelerator key', (code, key, shiftKey, expected) => {
  expect(nativeInputToShortcutLabel(optionInput(code, key, shiftKey), true)).toBe(expected);
});

it('keeps generated characters for non-global command shortcuts', () => {
  expect(nativeInputToShortcutLabel(optionInput('KeyC', 'ç'))).toBe('Alt+Ç');
});
