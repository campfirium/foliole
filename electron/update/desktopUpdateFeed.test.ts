import { expect, it } from 'vitest';

import { desktopUpdateFeedUrl, isValidDesktopUpdateVersion } from './desktopUpdateFeed.js';

it('derives the updater feed only from a validated release version', () => {
  expect(desktopUpdateFeedUrl('0.8.1')).toBe(
    'https://github.com/campfirium/foliole/releases/download/v0.8.1/'
  );
  expect(desktopUpdateFeedUrl('1.0.0-rc.1')).toContain('/v1.0.0-rc.1/');
  expect(isValidDesktopUpdateVersion('01.2.3')).toBe(false);
  expect(() => desktopUpdateFeedUrl('https://attacker.invalid/update')).toThrow(
    'invalid desktop update target version'
  );
});
