// @vitest-environment node

import { expect, it } from 'vitest';

import { verifyPackagedEntitlements } from './packaged-entitlements-contract.mjs';

const GROUP = 'com.apple.security.application-groups\nV589TQH334.group.com.campfirium.foliole.agent-control';
const FILES = 'com.apple.security.files.bookmarks.app-scope\ncom.apple.security.files.user-selected.read-write';
const DIRECT_HELPER = 'com.apple.security.cs.allow-jit\ncom.apple.security.cs.allow-unsigned-executable-memory';

function directEntitlements() {
  return {
    app: `${GROUP}\n${FILES}\n${DIRECT_HELPER}`,
    cli: GROUP,
    cliRuntime: DIRECT_HELPER,
    codex: DIRECT_HELPER,
    helper: DIRECT_HELPER
  };
}

it('accepts the non-sandboxed Developer ID signing boundary', () => {
  expect(() => verifyPackagedEntitlements(directEntitlements(), 'developer-id')).not.toThrow();
});

it('rejects App Sandbox in a Developer ID package', () => {
  const entitlements = directEntitlements();
  entitlements.app += '\ncom.apple.security.app-sandbox';
  expect(() => verifyPackagedEntitlements(entitlements, 'developer-id'))
    .toThrow('packaged app must not include com.apple.security.app-sandbox');
});

it('rejects a Developer ID package without hardened-runtime memory entitlements', () => {
  const entitlements = directEntitlements();
  entitlements.app = entitlements.app.replace(
    '\ncom.apple.security.cs.allow-unsigned-executable-memory',
    ''
  );
  expect(() => verifyPackagedEntitlements(entitlements, 'developer-id'))
    .toThrow('packaged app is missing com.apple.security.cs.allow-unsigned-executable-memory');
});
