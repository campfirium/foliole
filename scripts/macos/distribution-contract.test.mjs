import { describe, expect, it } from 'vitest';

import {
  assertGithubDistributionContract,
  assertSandboxEntitlements
} from './distribution-contract.mjs';
import { runDistributionContractCheck } from './check-distribution-contract.mjs';

describe('macOS distribution contract', () => {
  it('keeps both maintained package channels on the sandboxed MAS runtime shape', async () => {
    await expect(runDistributionContractCheck()).resolves.toBeUndefined();
  });

  it('rejects the standard Electron runtime for GitHub packages', () => {
    expect(() => assertGithubDistributionContract({
      appId: 'com.campfirium.foliole',
      electronDist: 'node_modules/electron/dist',
      mac: {}
    })).toThrow('GitHub packages must use the cached MAS Electron runtime');
  });

  it('rejects removal of Apple App Sandbox from the shared entitlements', () => {
    expect(() => assertSandboxEntitlements('<plist><dict/></plist>'))
      .toThrow('missing com.apple.security.app-sandbox');
  });
});
