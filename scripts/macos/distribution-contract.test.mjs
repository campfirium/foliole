// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  assertDeveloperIdEntitlements,
  assertGithubDistributionContract,
  assertSandboxEntitlements
} from './distribution-contract.mjs';
import { runDistributionContractCheck } from './check-distribution-contract.mjs';

describe('macOS distribution contract', () => {
  it('keeps GitHub on standard Electron and MAS on the sandboxed MAS runtime', async () => {
    await expect(runDistributionContractCheck()).resolves.toBeUndefined();
  });

  it('rejects the MAS Electron runtime for GitHub packages', () => {
    expect(() => assertGithubDistributionContract({
      appId: 'com.campfirium.foliole',
      electronDist: '.tmp/electron-mas-arm64',
      extraMetadata: { folioleBuildChannel: 'github' },
      mac: {}
    })).toThrow('GitHub packages must use the standard Electron runtime');
  });

  it('rejects removal of Apple App Sandbox from the shared entitlements', () => {
    expect(() => assertSandboxEntitlements('<plist><dict/></plist>'))
      .toThrow('missing com.apple.security.app-sandbox');
  });

  it('rejects Apple App Sandbox in direct-distribution entitlements', () => {
    expect(() => assertDeveloperIdEntitlements(
      '<key>com.apple.security.app-sandbox</key>'
    )).toThrow('Developer ID app must not use App Sandbox');
  });

  it('requires hardened-runtime memory entitlements for direct distribution', () => {
    expect(() => assertDeveloperIdEntitlements([
      '<key>com.apple.security.application-groups</key>',
      '<key>com.apple.security.files.bookmarks.app-scope</key>',
      '<key>com.apple.security.files.user-selected.read-write</key>'
    ].join('\n'))).toThrow('missing com.apple.security.cs.allow-jit');
  });
});
