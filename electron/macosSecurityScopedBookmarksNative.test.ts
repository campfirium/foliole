import { expect, it } from 'vitest';

import { loadMacosSecurityScopedBookmarkAdapter } from './macosSecurityScopedBookmarksNative.js';

it('short-circuits before loading the native addon on non-macOS platforms', () => {
  expect(loadMacosSecurityScopedBookmarkAdapter('win32')).toEqual({
    message: 'macOS only',
    status: 'platform_not_supported'
  });
});
