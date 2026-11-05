// @vitest-environment node
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

import { expect, it } from 'vitest';

import signGithubApp from './sign-github-app.mjs';
import signMasApp, { createMasSignOptions } from './sign-mas-app.mjs';

it.each([signMasApp, signGithubApp])('delegates signing input validation to the installed signer', async (signApp) => {
  await expect(signApp({ app: '/invalid-signing-input.txt', optionsForFile: () => ({}) }))
    .rejects.toThrow('Extension of application must be `.app`.');
});

it('grants JIT only to embedded Codex while keeping ordinary tools on sandbox inheritance', () => {
  const options = createMasSignOptions({
    app: '/tmp/Foliole.app',
    type: 'development',
    optionsForFile: () => ({
      additionalArguments: [],
      entitlements: '/project/build/entitlements.mas.inherit.plist',
      hardenedRuntime: true
    })
  });

  expect(options.optionsForFile('/tmp/Foliole.app/Contents/MacOS/codex')).toMatchObject({
    additionalArguments: ['--identifier', 'com.campfirium.foliole.codex'],
    entitlements: expect.stringMatching(/entitlements\.mas\.codex\.plist$/),
    hardenedRuntime: true,
    timestamp: 'none'
  });
  expect(options.optionsForFile('/tmp/Foliole.app/Contents/MacOS/Foliole Global Capture')).toMatchObject({
    additionalArguments: ['--identifier', 'com.campfirium.foliole.global-capture'],
    entitlements: expect.stringMatching(/entitlements\.mas\.tool\.plist$/),
    hardenedRuntime: true,
    timestamp: 'none'
  });
  expect(options.optionsForFile('/tmp/Foliole.app/Contents/Frameworks/Foliole Helper.app')).toMatchObject({
    entitlements: '/project/build/entitlements.mas.inherit.plist'
  });

  const codexEntitlements = readFileSync(
    new URL('../../build/entitlements.mas.codex.plist', import.meta.url),
    'utf8'
  );
  expect(codexEntitlements).toContain('<key>com.apple.security.cs.allow-jit</key>');
});
