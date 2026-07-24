// @vitest-environment node

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildSeaConfig, codesignArgs, launcherSigningArgs } from './prepare-foliole-cli.mjs';

describe('Foliole macOS CLI preparation', () => {
  it('builds a deterministic Node SEA blob from the checked-in bootstrap', () => {
    const config = buildSeaConfig('/tmp/foliole-cli.blob');

    expect(config).toEqual({
      disableExperimentalSEAWarning: true,
      main: path.resolve('scripts/macos/foliole-cli-launcher/bootstrap.cjs'),
      output: '/tmp/foliole-cli.blob',
      useCodeCache: false,
      useSnapshot: false
    });
  });

  it('builds the Developer ID launcher unsigned before the final explicit signature', () => {
    expect(launcherSigningArgs('developer-id')).toEqual([
      'CODE_SIGNING_ALLOWED=NO',
      'CODE_SIGNING_REQUIRED=NO'
    ]);
  });

  it('adds a secure timestamp and Hardened Runtime to Developer ID CLI signatures', () => {
    expect(codesignArgs('identity', '/entitlements.plist', '/Foliole CLI.app', 'developer-id'))
      .toEqual([
        '--force', '--sign', 'identity', '--timestamp', '--options', 'runtime',
        '--entitlements', '/entitlements.plist', '/Foliole CLI.app'
      ]);
  });
});
