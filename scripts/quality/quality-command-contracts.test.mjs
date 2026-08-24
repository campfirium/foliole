// @vitest-environment node

import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import packageJson from '../../package.json' with { type: 'json' };

import {
  QUALITY_COMMAND_CONTRACTS,
  assertQualityCommandAllowed,
  isPublicQualityPackageCommand,
  publicQualityPackageCommands
} from './quality-command-contracts.mjs';

describe('quality command registry', () => {
  it('classifies every public quality package entry exactly once', () => {
    const packageEntries = Object.keys(packageJson.scripts).filter(isPublicQualityPackageCommand).sort();

    expect(publicQualityPackageCommands()).toEqual(packageEntries);
    for (const name of packageEntries.filter((entry) => entry.startsWith('quality:'))) {
      const runner = QUALITY_COMMAND_CONTRACTS.get(name)?.runner;
      expect(runner, name).toBeTruthy();
      expect(QUALITY_COMMAND_CONTRACTS.has(runner), name).toBe(true);
    }
  });

  it('guards every hosted-only package entry before its aggregate starts', () => {
    const hostedEntries = [...QUALITY_COMMAND_CONTRACTS.values()]
      .filter((entry) => entry.classification === 'hosted-only' && entry.surface === 'npm');

    for (const entry of hostedEntries) {
      expect(packageJson.scripts[entry.name], entry.name)
        .toMatch(new RegExp(`^node scripts/quality/quality-command-contracts\\.mjs allow ${entry.name} && `, 'u'));
      expect(QUALITY_COMMAND_CONTRACTS.has(entry.runner), entry.name).toBe(true);
    }
  });

  it('keeps every local-quick entry inside all five limits', () => {
    const localEntries = [...QUALITY_COMMAND_CONTRACTS.values()]
      .filter((entry) => entry.classification === 'local-quick');

    expect(localEntries.length).toBeGreaterThan(0);
    for (const entry of localEntries) {
      expect(Object.values(entry.localQuickCriteria), entry.name).toEqual([true, true, true, true, true]);
    }
  });

  it('runs declaration scanning locally while keeping network hardening hosted', () => {
    expect(QUALITY_COMMAND_CONTRACTS.get('deps:scan')?.classification).toBe('local-quick');
    expect(QUALITY_COMMAND_CONTRACTS.get('deps:hardening:check')?.classification).toBe('hosted-only');
  });

  it('rejects hosted-only entries locally and admits only GitHub-hosted Actions', () => {
    expect(() => assertQualityCommandAllowed('quality:desktop', { env: {} }))
      .toThrow('requires a GitHub-hosted Actions runner');
    expect(() => assertQualityCommandAllowed('quality:desktop', {
      env: { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' }
    })).toThrow('requires a GitHub-hosted Actions runner');
    expect(assertQualityCommandAllowed('quality:desktop', {
      env: { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' }
    }).classification).toBe('hosted-only');
  });

  it('guards every directly reachable hosted runner', () => {
    const runnerSources = new Map([
      ['runner:quality-gate-target', new URL('./quality-gate-target.sh', import.meta.url)],
      ['runner:quality-gate-repair', new URL('./quality-gate-repair.mjs', import.meta.url)],
      ['runner:ios-runtime-contract', new URL('../ios/ios-runtime-contract-tests.mjs', import.meta.url)],
      ['runner:ios-simulator-bucket', new URL('../ios/ios-hosted-acceptance-bucket.mjs', import.meta.url)],
      ['runner:ios-simulator', new URL('../ios/ios-bootstrap-acceptance.mjs', import.meta.url)],
      ['runner:ios-sqlite-capability', new URL('../sync/ios-capacitor-sqlite-capability-gate.mjs', import.meta.url)],
      ['runner:sql-surface-scan', new URL('../sync/sql-surface-scan.mjs', import.meta.url)],
      ['runner:android-host-quality', new URL('../android/native-linux-host.mjs', import.meta.url)],
      ['runner:release-target-contract', new URL('../release-target-contract.mjs', import.meta.url)],
      ['runner:release-draft-assets', new URL('../release-assembly-assets.mjs', import.meta.url)],
      ['runner:desktop-update-release-gate', new URL('../desktop-update-release-policy.mjs', import.meta.url)],
      ['runner:release-manifest-pages', new URL('../prepare-release-manifest-site.mjs', import.meta.url)]
    ]);
    for (const [runner, sourceUrl] of runnerSources) {
      expect(readFileSync(sourceUrl, 'utf8'), runner).toContain(runner);
    }
  });

  it('requires exact release state and rejects unknown mutations', () => {
    expect(readFileSync(new URL('../release-publish.mjs', import.meta.url), 'utf8'))
      .toContain("assertQualityCommandAllowed('release-control:publish'");
    expect(readFileSync(new URL('../release-latest.mjs', import.meta.url), 'utf8'))
      .toContain("assertQualityCommandAllowed('release-control:latest'");
    const expectedStates = new Map([
      ['release-control:draft-body', 'unpublished-draft'],
      ['release-control:abandon-draft', 'explicitly-abandoned-unpublished-draft'],
      ['release-control:abandon-ref', 'explicitly-abandoned-release-ref'],
      ['release-control:publish', 'user-confirmed-unpublished-draft'],
      ['release-control:latest', 'user-confirmed-published-release-latest']
    ]);
    for (const [name, state] of expectedStates) {
      expect(() => assertQualityCommandAllowed(name), name).toThrow(`requires release state: ${state}`);
      expect(() => assertQualityCommandAllowed(name, { state }), name)
        .toThrow('requires owner: pinned-release-task');
      expect(assertQualityCommandAllowed(name, {
        owner: 'pinned-release-task', state
      }).classification).toBe('release-control');
    }
    expect(() => assertQualityCommandAllowed('release-control:replace-assets'))
      .toThrow('unregistered quality or release command');
  });
});
