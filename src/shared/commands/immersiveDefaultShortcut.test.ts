import { expect, it } from 'vitest';

import { getPlatformDefaultCommandShortcuts } from './defaultShortcuts';
import { APP_COMMAND_IDS } from './ids';
import { resolveNativeMenuAccelerator } from './nativeAccelerators';
import { matchesShortcutSet } from './shortcuts';

function keyEvent(init: KeyboardEventInit) {
  return new KeyboardEvent('keydown', init);
}

it('uses Option R for immersive reading on Mac desktop only', () => {
  const macDefaults = getPlatformDefaultCommandShortcuts({ includeBrowserReservedShortcuts: true, platform: 'MacIntel' });
  const shortcut = macDefaults[APP_COMMAND_IDS.toggleImmersiveMode];
  const chord = { key: '®', code: 'KeyR', altKey: true };

  expect(matchesShortcutSet(keyEvent(chord), shortcut)).toBe(true);
  expect(matchesShortcutSet(keyEvent({ key: 'F11' }), shortcut)).toBe(false);
  expect(matchesShortcutSet(keyEvent({ ...chord, altKey: false }), shortcut)).toBe(false);
  expect(resolveNativeMenuAccelerator(shortcut, 'MacIntel')).toBe('Alt+R');
  expect(Object.entries(macDefaults).filter(([, keys]) => matchesShortcutSet(keyEvent(chord), keys))
    .map(([commandId]) => commandId)).toEqual([APP_COMMAND_IDS.toggleImmersiveMode]);
});

it('keeps F11 on Windows desktop and omits the immersive shortcut in browser hosts', () => {
  const windowsDefaults = getPlatformDefaultCommandShortcuts({ includeBrowserReservedShortcuts: true, platform: 'Win32' });
  expect(matchesShortcutSet(keyEvent({ key: 'F11' }), windowsDefaults[APP_COMMAND_IDS.toggleImmersiveMode])).toBe(true);
  for (const platform of ['MacIntel', 'Win32']) {
    const browserDefaults = getPlatformDefaultCommandShortcuts({ includeBrowserReservedShortcuts: false, platform });
    expect(browserDefaults[APP_COMMAND_IDS.toggleImmersiveMode]).toBeUndefined();
  }
});
