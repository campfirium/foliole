import { expect, it, vi } from 'vitest';

import { verifyPackagedMacosApp } from './verify-packaged-app.mjs';

const APP_ENTITLEMENTS = [
  'com.apple.security.app-sandbox',
  'com.apple.security.files.bookmarks.app-scope',
  'com.apple.security.files.user-selected.read-write'
].join('\n');
const HELPER_ENTITLEMENTS = [
  'com.apple.security.app-sandbox',
  'com.apple.security.inherit'
].join('\n');

it('verifies signatures, final sandbox entitlements, profile, and notarization ticket', async () => {
  const checkAccess = vi.fn(async () => undefined);
  const run = vi.fn((command, args) => ({
    status: 0,
    stderr: args.includes('--entitlements')
      ? (args.at(-1).endsWith('Foliole Helper.app') ? HELPER_ENTITLEMENTS : APP_ENTITLEMENTS)
      : ''
  }));

  await verifyPackagedMacosApp({
    access: checkAccess,
    appPath: '/artifacts/Foliole.app',
    notarized: true,
    run
  });

  expect(checkAccess).toHaveBeenCalledWith('/artifacts/Foliole.app/Contents/embedded.provisionprofile');
  expect(run).toHaveBeenCalledWith('codesign', [
    '--verify', '--deep', '--strict', '/artifacts/Foliole.app'
  ], { encoding: 'utf8' });
  expect(run).toHaveBeenCalledWith('xcrun', [
    'stapler', 'validate', '/artifacts/Foliole.app'
  ], { encoding: 'utf8' });
});

it('rejects a package whose final app signature lost App Sandbox', async () => {
  const run = (command, args) => ({
    status: 0,
    stderr: args.includes('--entitlements') ? HELPER_ENTITLEMENTS : ''
  });

  await expect(verifyPackagedMacosApp({
    access: async () => undefined,
    appPath: '/artifacts/Foliole.app',
    run
  })).rejects.toThrow('packaged app is missing com.apple.security.files.bookmarks.app-scope');
});
