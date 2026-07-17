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
const CODEX_ENTITLEMENTS = `${HELPER_ENTITLEMENTS}\ncom.apple.security.cs.allow-jit`;

function resolveEntitlements(subject) {
  if (subject.endsWith('/Contents/MacOS/codex')) return CODEX_ENTITLEMENTS;
  if (subject.endsWith('Foliole Helper.app')) return HELPER_ENTITLEMENTS;
  return APP_ENTITLEMENTS;
}

it('verifies signatures, final sandbox entitlements, profile, and notarization ticket', async () => {
  const checkAccess = vi.fn(async () => undefined);
  const run = vi.fn((command, args) => ({
    status: 0,
    stderr: args.includes('--entitlements') ? resolveEntitlements(args.at(-1)) : ''
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
  expect(run).toHaveBeenCalledWith('codesign', [
    '-d', '--entitlements', '-', '/artifacts/Foliole.app/Contents/MacOS/codex'
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

it('rejects a package whose embedded Codex signature cannot execute JIT code', async () => {
  const run = (command, args) => ({
    status: 0,
    stderr: args.includes('--entitlements')
      ? (args.at(-1).endsWith('/Contents/MacOS/codex') ? HELPER_ENTITLEMENTS : resolveEntitlements(args.at(-1)))
      : ''
  });

  await expect(verifyPackagedMacosApp({
    access: async () => undefined,
    appPath: '/artifacts/Foliole.app',
    run
  })).rejects.toThrow('packaged Codex is missing com.apple.security.cs.allow-jit');
});
