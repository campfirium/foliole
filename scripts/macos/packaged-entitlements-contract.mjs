const APP_GROUP = 'V589TQH334.group.com.campfirium.foliole.agent-control';

function requireEntitlements(source, names, subject) {
  for (const name of names) {
    if (!source.includes(name)) throw new Error(`${subject} is missing ${name}`);
  }
}

function rejectEntitlements(source, names, subject) {
  for (const name of names) {
    if (source.includes(name)) throw new Error(`${subject} must not include ${name}`);
  }
}

function verifySandboxBoundary(source, mode, subject, inherited = false) {
  const sandboxEntitlements = [
    'com.apple.security.app-sandbox',
    ...(inherited ? ['com.apple.security.inherit'] : [])
  ];
  if (mode === 'developer-id') rejectEntitlements(source, sandboxEntitlements, subject);
  else requireEntitlements(source, sandboxEntitlements, subject);
}

export function verifyPackagedEntitlements(entitlements, mode) {
  requireEntitlements(entitlements.app, [
    'com.apple.security.application-groups', APP_GROUP,
    'com.apple.security.cs.allow-jit',
    'com.apple.security.files.bookmarks.app-scope',
    'com.apple.security.files.user-selected.read-write'
  ], 'packaged app');
  if (mode === 'developer-id') {
    requireEntitlements(entitlements.app, [
      'com.apple.security.cs.allow-unsigned-executable-memory'
    ], 'packaged app');
  }
  verifySandboxBoundary(entitlements.app, mode, 'packaged app');

  requireEntitlements(entitlements.codex, ['com.apple.security.cs.allow-jit'], 'packaged Codex');
  verifySandboxBoundary(entitlements.codex, mode, 'packaged Codex', true);

  if (mode === 'developer-id') {
    requireEntitlements(entitlements.helper, [
      'com.apple.security.cs.allow-jit', 'com.apple.security.cs.allow-unsigned-executable-memory'
    ], 'packaged helper');
  }
  verifySandboxBoundary(entitlements.helper, mode, 'packaged helper', true);

  requireEntitlements(entitlements.cli, [
    'com.apple.security.application-groups', APP_GROUP
  ], 'packaged CLI');
  verifySandboxBoundary(entitlements.cli, mode, 'packaged CLI');

  requireEntitlements(entitlements.cliRuntime, [
    'com.apple.security.cs.allow-jit'
  ], 'packaged CLI runtime');
  verifySandboxBoundary(entitlements.cliRuntime, mode, 'packaged CLI runtime', true);
}
