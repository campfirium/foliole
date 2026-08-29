import { expect, it } from 'vitest';

import { getPlatformDefaultCommandShortcuts } from './defaultShortcuts';
import { APP_COMMAND_IDS } from './ids';
import { matchesShortcutSet } from './shortcuts';

it('keeps annotation distinct from global capture and Select All on every desktop platform', () => {
  const mac = getPlatformDefaultCommandShortcuts('MacIntel');
  const windows = getPlatformDefaultCommandShortcuts('Win32');
  const linux = getPlatformDefaultCommandShortcuts('Linux x86_64');

  expect(mac[APP_COMMAND_IDS.addSelectionNote]).toEqual({ primary: { key: 'a', metaKey: true, shiftKey: true } });
  expect(mac[APP_COMMAND_IDS.globalCaptureToInbox]).toEqual({ primary: { key: 'a', altKey: true } });
  expect(matchesShortcutSet(
    new KeyboardEvent('keydown', { code: 'KeyA', key: 'a', metaKey: true }),
    mac[APP_COMMAND_IDS.addSelectionNote]
  )).toBe(false);
  expect(windows[APP_COMMAND_IDS.addSelectionNote]).toEqual({ primary: { key: 'a', altKey: true } });
  expect(linux[APP_COMMAND_IDS.addSelectionNote]).toEqual({ primary: { key: 'a', altKey: true } });
});
