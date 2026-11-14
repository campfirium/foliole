import type { Input } from 'electron';
import { expect, it } from 'vitest';

import { shouldSuppressEditShortcutRepeat } from './editShortcutRepeat.js';

const keyDown: Input = {
  alt: false, code: '', control: false, isAutoRepeat: false, isComposing: false,
  key: '', location: 0, meta: false, modifiers: [], shift: false, type: 'keyDown'
};

it.each([
  { platform: 'darwin', modifiers: { meta: true }, accelerators: ['Command+U', 'Command+R'], redoKeys: [{ key: 'z', shift: true }] },
  { platform: 'win32', modifiers: { control: true }, accelerators: ['Control+U', 'Control+R'], redoKeys: [{ key: 'z', shift: true }, { key: 'y' }] }
] as const)('consumes only repeated edit shortcuts on $platform', ({ platform, modifiers, accelerators, redoKeys }) => {
  const bindings = [...['x', 'z', 'u', 'r'].map(key => ({ key })), ...redoKeys];
  for (const binding of bindings) {
    const pressed = { ...keyDown, ...modifiers, ...binding };
    expect(shouldSuppressEditShortcutRepeat(pressed, accelerators, platform)).toBe(false);
    expect(shouldSuppressEditShortcutRepeat({ ...pressed, isAutoRepeat: true }, accelerators, platform)).toBe(true);
    expect(shouldSuppressEditShortcutRepeat({ ...pressed, type: 'keyUp', isAutoRepeat: true }, accelerators, platform)).toBe(false);
  }
  for (const key of ['c', 'v', 'f']) {
    expect(shouldSuppressEditShortcutRepeat({ ...keyDown, ...modifiers, key, isAutoRepeat: true }, accelerators, platform)).toBe(false);
  }
});
