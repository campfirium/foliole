// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  acceptanceBuildEnv,
  ordinaryBuildEnv
} from './ios-sync-group-migration-acceptance-runner.mjs';

describe('iOS Sync Group migration acceptance runner', () => {
  it('isolates acceptance assets from ordinary companion builds', () => {
    const ambient = {
      KEEP: 'yes',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: 'ambient',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT: 'http://ambient',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: 'ambient'
    };
    expect(acceptanceBuildEnv(ambient)).toMatchObject({
      KEEP: 'yes',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: 'sync-group-migration'
    });
    expect(acceptanceBuildEnv(ambient)).not.toHaveProperty('VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT');
    expect(ordinaryBuildEnv(ambient)).toEqual({ KEEP: 'yes' });
  });

  it('requires a frozen pushed tip and a task-owned signed Simulator', () => {
    const source = fs.readFileSync('scripts/ios/ios-sync-group-migration-acceptance-runner.mjs', 'utf8');
    expect(source).toContain("['rev-parse', 'origin/dev']");
    expect(source).toContain('createOwnedIosSimulator({');
    expect(source).toContain("run(options, 'codesign', ['--verify', '--deep', '--strict', app])");
    expect(source).toContain('cleanupOwnedIosSimulator({');
    expect(source).toContain("path.join(artifactDir, 'receipt.json')");
  });
});
