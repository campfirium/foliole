import { expect, it, vi } from 'vitest';
import { constants } from 'node:fs';

import { verifyPackagedMacosApp } from './verify-packaged-app.mjs';

const APP_ENTITLEMENTS = [
  'com.apple.security.app-sandbox',
  'com.apple.security.application-groups',
  'V589TQH334.group.com.campfirium.foliole.agent-control',
  'com.apple.security.cs.allow-jit',
  'com.apple.security.files.bookmarks.app-scope',
  'com.apple.security.files.user-selected.read-write'
].join('\n');
const HELPER_ENTITLEMENTS = [
  'com.apple.security.app-sandbox',
  'com.apple.security.inherit'
].join('\n');
const CODEX_ENTITLEMENTS = `${HELPER_ENTITLEMENTS}\ncom.apple.security.cs.allow-jit`;
const CLI_RUNTIME_ENTITLEMENTS = `${HELPER_ENTITLEMENTS}\ncom.apple.security.cs.allow-jit`;
const CLI_ENTITLEMENTS = `${APP_ENTITLEMENTS}\ncom.apple.security.application-groups\nV589TQH334.group.com.campfirium.foliole.agent-control`;
const DIRECT_APP_ENTITLEMENTS = `${APP_ENTITLEMENTS.replace(
  'com.apple.security.app-sandbox\n',
  ''
)}\ncom.apple.security.cs.allow-unsigned-executable-memory`;
const DIRECT_HELPER_ENTITLEMENTS = [
  'com.apple.security.cs.allow-jit',
  'com.apple.security.cs.allow-unsigned-executable-memory'
].join('\n');
const DIRECT_CLI_ENTITLEMENTS = [
  'com.apple.security.application-groups',
  'V589TQH334.group.com.campfirium.foliole.agent-control'
].join('\n');
const TEAM_ID = 'V589TQH334';

function profileFor(path, mode = 'development') {
  const bundleId = path.includes('Foliole CLI.app') ? 'com.campfirium.foliole.cli' : 'com.campfirium.foliole';
  const development = mode === 'development'
    ? '<key>get-task-allow</key><true/><key>ProvisionedDevices</key><array><string>device</string></array>'
    : '';
  const developerId = mode === 'developer-id'
    ? '<key>ProvisionsAllDevices</key><true/>'
    : '';
  return `<?xml version="1.0"?><plist><dict>
    ${developerId}
    <key>TeamIdentifier</key><array><string>${TEAM_ID}</string></array>
    <key>Entitlements</key><dict>
      <key>com.apple.application-identifier</key><string>${TEAM_ID}.${bundleId}</string>
      <key>com.apple.developer.team-identifier</key><string>${TEAM_ID}</string>
      <key>com.apple.security.application-groups</key><array>
        <string>group.com.campfirium.foliole.agent-control</string>
      </array>${development}
    </dict>
  </dict></plist>`;
}

function resolveEntitlements(subject, mode) {
  if (mode === 'developer-id') {
    if (subject.endsWith('/Contents/MacOS/codex')) return DIRECT_HELPER_ENTITLEMENTS;
    if (subject.endsWith('/Contents/MacOS/foliole-runtime')) return DIRECT_HELPER_ENTITLEMENTS;
    if (subject.endsWith('Foliole Helper.app')) return DIRECT_HELPER_ENTITLEMENTS;
    if (subject.endsWith('Foliole CLI.app')) return DIRECT_CLI_ENTITLEMENTS;
    return DIRECT_APP_ENTITLEMENTS;
  }
  if (subject.endsWith('/Contents/MacOS/codex')) return CODEX_ENTITLEMENTS;
  if (subject.endsWith('/Contents/MacOS/foliole-runtime')) return CLI_RUNTIME_ENTITLEMENTS;
  if (subject.endsWith('Foliole Helper.app')) return HELPER_ENTITLEMENTS;
  if (subject.endsWith('Foliole CLI.app')) return CLI_ENTITLEMENTS;
  return APP_ENTITLEMENTS;
}

function createRun(options = {}) {
  const mode = options.mode ?? 'development';
  return vi.fn((command, args) => {
    if (command === 'security') return { status: 0, stdout: profileFor(args.at(-1), mode) };
    if (command === 'codesign' && args.includes('--entitlements')) {
      return { status: 0, stderr: resolveEntitlements(args.at(-1), mode) };
    }
    if (command === 'codesign' && args.includes('-dv')) {
      const bundleId = args.at(-1).endsWith('Foliole CLI.app')
        ? 'com.campfirium.foliole.cli'
        : 'com.campfirium.foliole';
      const authority = options.signatureMode === 'developer-id'
        ? 'Developer ID Application: CAMPFIRIUM LTD (V589TQH334)'
        : options.signatureMode === 'distribution'
          ? '3rd Party Mac Developer Application: CAMPFIRIUM LTD (V589TQH334)'
          : 'Apple Development: Chenyao Peng (VN9YGGWJSV)';
      return { status: 0, stderr: `Identifier=${bundleId}\nTeamIdentifier=${TEAM_ID}\nAuthority=${authority}` };
    }
    return { status: 0, stdout: '' };
  });
}

it('verifies signatures, final sandbox entitlements, profile, and notarization ticket', async () => {
  const checkAccess = vi.fn(async () => undefined);
  const run = createRun();

  await verifyPackagedMacosApp({
    access: checkAccess,
    appPath: '/artifacts/Foliole.app',
    notarized: true,
    run
  });

  expect(checkAccess).toHaveBeenCalledWith('/artifacts/Foliole.app/Contents/embedded.provisionprofile');
  expect(checkAccess).toHaveBeenCalledWith(
    '/artifacts/Foliole.app/Contents/Helpers/Foliole CLI.app/Contents/MacOS/foliole', constants.X_OK
  );
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

it('rejects a package whose public launcher is not executable', async () => {
  const checkAccess = vi.fn(async (file, mode) => {
    if (file.endsWith('/Foliole CLI.app/Contents/MacOS/foliole') && mode === constants.X_OK) {
      throw new Error('permission denied');
    }
  });

  await expect(verifyPackagedMacosApp({
    access: checkAccess,
    appPath: '/artifacts/Foliole.app',
    run: createRun()
  })).rejects.toThrow('permission denied');
});

it('rejects a package whose final app signature lost App Sandbox', async () => {
  const run = createRun();
  run.mockImplementation((command, args) => {
    if (command === 'security') return { status: 0, stdout: profileFor(args.at(-1)) };
    if (command === 'codesign' && args.includes('-dv')) {
      const bundleId = args.at(-1).endsWith('Foliole CLI.app')
        ? 'com.campfirium.foliole.cli'
        : 'com.campfirium.foliole';
      return { status: 0, stderr: `Identifier=${bundleId}\nTeamIdentifier=${TEAM_ID}\nAuthority=Apple Development:` };
    }
    return { status: 0, stderr: args.includes('--entitlements') ? HELPER_ENTITLEMENTS : '' };
  });

  await expect(verifyPackagedMacosApp({
    access: async () => undefined,
    appPath: '/artifacts/Foliole.app',
    run
  })).rejects.toThrow('packaged app is missing com.apple.security.application-groups');
});

it('rejects a package whose embedded Codex signature cannot execute JIT code', async () => {
  const run = createRun();
  const baseImplementation = run.getMockImplementation();
  run.mockImplementation((command, args, runOptions) => {
    if (command === 'codesign' && args.includes('--entitlements') && args.at(-1).endsWith('/Contents/MacOS/codex')) {
      return { status: 0, stderr: HELPER_ENTITLEMENTS };
    }
    return baseImplementation(command, args, runOptions);
  });

  await expect(verifyPackagedMacosApp({
    access: async () => undefined,
    appPath: '/artifacts/Foliole.app',
    run
  })).rejects.toThrow('packaged Codex is missing com.apple.security.cs.allow-jit');
});

it('rejects a package whose CLI runtime cannot execute JIT code', async () => {
  const run = createRun();
  const baseImplementation = run.getMockImplementation();
  run.mockImplementation((command, args, runOptions) => {
    if (command === 'codesign' && args.includes('--entitlements') && args.at(-1).endsWith('/foliole-runtime')) {
      return { status: 0, stderr: HELPER_ENTITLEMENTS };
    }
    return baseImplementation(command, args, runOptions);
  });

  await expect(verifyPackagedMacosApp({
    access: async () => undefined,
    appPath: '/artifacts/Foliole.app',
    run
  })).rejects.toThrow('packaged CLI runtime is missing com.apple.security.cs.allow-jit');
});

it('rejects a development profile in a distribution package', async () => {
  await expect(verifyPackagedMacosApp({
    access: async () => undefined,
    appPath: '/artifacts/Foliole.app',
    mode: 'distribution',
    run: createRun({ mode: 'development', signatureMode: 'distribution' })
  })).rejects.toThrow('app profile is a development profile');
});

it('accepts distinct Developer ID profiles and signatures for GitHub distribution', async () => {
  const checkAccess = vi.fn(async () => undefined);
  await expect(verifyPackagedMacosApp({
    access: checkAccess,
    appPath: '/artifacts/Foliole.app',
    mode: 'developer-id',
    run: createRun({ mode: 'developer-id', signatureMode: 'developer-id' })
  })).resolves.toBeUndefined();
  expect(checkAccess).toHaveBeenCalledWith(
    '/artifacts/Foliole.app/Contents/Frameworks/Squirrel.framework/Versions/A/Squirrel', constants.X_OK
  );
  expect(checkAccess).toHaveBeenCalledWith(
    '/artifacts/Foliole.app/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt', constants.X_OK
  );
});

it('rejects a Developer ID package without the native Squirrel installer runtime', async () => {
  const checkAccess = vi.fn(async (file) => {
    if (file.endsWith('/Squirrel.framework/Versions/A/Squirrel')) throw new Error('missing Squirrel');
  });
  await expect(verifyPackagedMacosApp({
    access: checkAccess,
    appPath: '/artifacts/Foliole.app',
    mode: 'developer-id',
    run: createRun({ mode: 'developer-id', signatureMode: 'developer-id' })
  })).rejects.toThrow('missing Squirrel');
});

it('rejects a non-Developer ID profile in a GitHub distribution package', async () => {
  await expect(verifyPackagedMacosApp({
    access: async () => undefined,
    appPath: '/artifacts/Foliole.app',
    mode: 'developer-id',
    run: createRun({ mode: 'distribution', signatureMode: 'developer-id' })
  })).rejects.toThrow('app profile is not a Developer ID profile');
});

it('rejects a development signing identity in a distribution package', async () => {
  await expect(verifyPackagedMacosApp({
    access: async () => undefined,
    appPath: '/artifacts/Foliole.app',
    mode: 'distribution',
    run: createRun({ mode: 'distribution', signatureMode: 'development' })
  })).rejects.toThrow('packaged app signature is missing Authority=3rd Party Mac Developer Application');
});
