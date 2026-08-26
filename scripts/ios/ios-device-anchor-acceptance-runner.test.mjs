// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  acceptanceBuildEnv,
  ordinaryBuildEnv,
  verifyIosDeviceAnchorAcceptance
} from './ios-device-anchor-acceptance-runner.mjs';

const ANCHOR = '11111111-1111-4111-8111-111111111111';
const RESULT = {
  anchor_storage: 'keychain-after-first-unlock-this-device-only',
  canonical_database_path: '/data/foliole.db',
  database_path: '/data/foliole.db',
  device_anchor: ANCHOR,
  error: null,
  phase: 'anchor-observed',
  scenario: 'device-identity',
  status: 'passed'
};

describe('iOS device anchor acceptance runner', () => {
  it('verifies restart hydration and Device separation', () => {
    expect(verifyIosDeviceAnchorAcceptance(RESULT, RESULT)).toMatchObject({
      moved_identity_key: expect.any(String),
      other_device_identity_key: expect.any(String)
    });
    expect(() => verifyIosDeviceAnchorAcceptance(RESULT, {
      ...RESULT, device_anchor: '33333333-3333-4333-8333-333333333333'
    })).toThrow('did not persist');
  });

  it('isolates task acceptance assets and requires a frozen signed Simulator tip', () => {
    const ambient = {
      KEEP: 'yes', VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: 'ambient',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT: 'http://ambient',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: 'ambient'
    };
    expect(acceptanceBuildEnv(ambient)).toMatchObject({
      KEEP: 'yes', VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: 'device-identity'
    });
    expect(ordinaryBuildEnv(ambient)).toEqual({ KEEP: 'yes' });
    const source = fs.readFileSync('scripts/ios/ios-device-anchor-acceptance-runner.mjs', 'utf8');
    expect(source).toContain("['rev-parse', 'origin/dev']");
    expect(source).toContain('createOwnedIosSimulator({');
    expect(source).toContain("run(options, 'codesign', ['--verify', '--deep', '--strict', app])");
    expect(source).toContain("path.join(artifactDir, 'receipt.json')");
  });
});
