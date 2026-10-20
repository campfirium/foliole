// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createSimulatorAcceptanceBuildArgs,
  HOSTED_LOOPBACK_ENDPOINT_ENV
} from './ios-simulator-acceptance-runner.mjs';

const BUILD_OPTIONS = {
  bundleId: 'com.campfirium.foliole.ios.acceptance', derivedData: '/derived', repoRoot: '/repo',
  resourceArgs: [], udid: 'SIM'
};

function compilationConditions(env) {
  const arg = createSimulatorAcceptanceBuildArgs({ ...BUILD_OPTIONS, env })
    .find((value) => value.startsWith('SWIFT_ACTIVE_COMPILATION_CONDITIONS='));
  return arg?.slice('SWIFT_ACTIVE_COMPILATION_CONDITIONS='.length).split(' ');
}

describe('hosted iOS loopback endpoint seam', () => {
  it('stays off unless the hosted bucket explicitly enables it', () => {
    expect(compilationConditions({})).toEqual(['$(inherited)', 'FOLIOLE_IOS_BRIDGE_ACCEPTANCE']);
    expect(compilationConditions({ [HOSTED_LOOPBACK_ENDPOINT_ENV]: 'true' }))
      .not.toContain(HOSTED_LOOPBACK_ENDPOINT_ENV);
    expect(compilationConditions({ [HOSTED_LOOPBACK_ENDPOINT_ENV]: '1' }))
      .toEqual(['$(inherited)', 'FOLIOLE_IOS_BRIDGE_ACCEPTANCE', HOSTED_LOOPBACK_ENDPOINT_ENV]);
  });

  it('only replaces the host of a resolved service on simulator acceptance builds', () => {
    const source = fs.readFileSync('ios/App/App/FolioleCompanionBonjourEndpoint.swift', 'utf8');
    expect(source).toContain('#if FOLIOLE_IOS_HOSTED_LOOPBACK_ENDPOINT && targetEnvironment(simulator)');
    expect(source).toMatch(/guard service\.port > 0,[\s\S]*else \{ return nil \}\s*return "http:\/\/\\\(hostedAcceptanceLoopbackHost \?\? host\)/u);
    expect(source).not.toMatch(/#if DEBUG[\s\S]*hostedAcceptanceLoopbackHost/u);
  });

  it('keeps every committed build configuration free of the seam', () => {
    const project = fs.readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
    expect(project).not.toContain(HOSTED_LOOPBACK_ENDPOINT_ENV);
    const tracked = execFileSync('git', ['grep', '--untracked', '-l', HOSTED_LOOPBACK_ENDPOINT_ENV, '--', '.'], { encoding: 'utf8' })
      .trim().split('\n').sort();
    expect(tracked).toEqual([
      '.github/workflows/hosted-quality-ios.yml',
      'ios/App/App/FolioleCompanionBonjourEndpoint.swift',
      'scripts/ios/ios-hosted-loopback-endpoint.test.mjs',
      'scripts/ios/ios-simulator-acceptance-runner.mjs'
    ]);
  });

  it('enables the seam for the staged sync group bucket only', () => {
    const workflow = fs.readFileSync('.github/workflows/hosted-quality-ios.yml', 'utf8');
    expect(workflow).toContain(
      `${HOSTED_LOOPBACK_ENDPOINT_ENV}: \${{ matrix.bucket == 'sync-group-and-content' && '1' || '' }}`
    );
  });
});
