// @vitest-environment node
import { expect, it } from 'vitest';

import { createMasSignOptions } from './sign-mas-app.mjs';

it('uses exactly the sandbox inheritance profile for the embedded Codex tool', () => {
  const options = createMasSignOptions({
    app: '/tmp/Foliole.app',
    optionsForFile: () => ({
      additionalArguments: [],
      entitlements: '/project/build/entitlements.mas.inherit.plist',
      hardenedRuntime: true
    })
  });

  expect(options.optionsForFile('/tmp/Foliole.app/Contents/MacOS/codex')).toMatchObject({
    additionalArguments: ['--identifier', 'com.campfirium.foliole.codex'],
    entitlements: expect.stringMatching(/entitlements\.mas\.tool\.plist$/),
    hardenedRuntime: true
  });
  expect(options.optionsForFile('/tmp/Foliole.app/Contents/Frameworks/Foliole Helper.app')).toMatchObject({
    entitlements: '/project/build/entitlements.mas.inherit.plist'
  });
});
