import type { Input } from 'electron';
import { expect, it } from 'vitest';

import { shouldSuppressEditShortcutRepeat } from './editShortcutRepeat.js';

const keyDown: Input = {
  alt: false, code: '', control: false, isAutoRepeat: false, isComposing: false,
  key: '', location: 0, meta: false, modifiers: [], shift: false, type: 'keyDown'
};

it.each([
  { platform: 'darwin', input: { meta: true }, undo: 'Command+U' },
  { platform: 'win32', input: { control: true }, undo: 'Control+U' }
] as const)('consumes only repeated cut and undo shortcuts on $platform', ({ platform, input, undo }) => {
  for (const key of ['x', 'z', 'u']) {
    const pressed = { ...keyDown, ...input, key };
    expect(shouldSuppressEditShortcutRepeat(pressed, undo, platform)).toBe(false);
    expect(shouldSuppressEditShortcutRepeat({ ...pressed, isAutoRepeat: true }, undo, platform)).toBe(true);
    expect(shouldSuppressEditShortcutRepeat({ ...pressed, type: 'keyUp' }, undo, platform)).toBe(false);
  }
  for (const key of ['c', 'v', 'y']) {
    expect(shouldSuppressEditShortcutRepeat({ ...keyDown, ...input, key, isAutoRepeat: true }, undo, platform)).toBe(false);
  }
  expect(shouldSuppressEditShortcutRepeat({
    ...keyDown, ...input, key: 'z', shift: true, isAutoRepeat: true
  }, undo, platform)).toBe(false);
});
