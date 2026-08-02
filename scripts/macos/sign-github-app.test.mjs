// @vitest-environment node

import { expect, it } from 'vitest';

import { createGithubSignOptions } from './sign-github-app.mjs';

it('uses non-sandboxed direct-distribution entitlements for embedded tools', () => {
  const options = createGithubSignOptions({
    app: '/tmp/Foliole.app',
    type: 'distribution',
    optionsForFile: () => ({ entitlements: '/project/build/entitlements.mac.inherit.plist' })
  });

  expect(options.optionsForFile('/tmp/Foliole.app/Contents/MacOS/codex').entitlements)
    .toMatch(/entitlements\.mac\.inherit\.plist$/);
  expect(options.optionsForFile('/tmp/Foliole.app/Contents/MacOS/Foliole Global Capture').entitlements)
    .toMatch(/entitlements\.mac\.tool\.plist$/);
});
