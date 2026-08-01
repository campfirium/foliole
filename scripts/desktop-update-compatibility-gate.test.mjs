// @vitest-environment node

import { describe, expect, it } from 'vitest';

import fs from 'node:fs';

import { resolveCompatibilityGateArgs } from './desktop-update-compatibility-gate.mjs';

describe('desktop update compatibility gate', () => {
  it('observes updater errors instead of allowing an unhandled error event to terminate diagnostics', () => {
    const source = fs.readFileSync('scripts/desktop-update-compatibility-gate.mjs', 'utf8');
    expect(source).toContain("updater.on('error'");
    expect(source).toContain('[desktop-update-compatibility] updater error:');
  });

  it('requires an explicit previous version and same-run artifact directory', () => {
    expect(resolveCompatibilityGateArgs([
      '--current-version=0.8.0',
      '--target-version=0.8.1',
      '--directory=artifacts/windows'
    ], 'win32')).toMatchObject({ currentVersion: '0.8.0', platform: 'win32', targetVersion: '0.8.1' });
  });

  it('refuses unsupported hosts instead of simulating their updater', () => {
    expect(() => resolveCompatibilityGateArgs([
      '--current-version=0.8.0', '--target-version=0.8.1', '--directory=artifacts'
    ], 'linux')).toThrow('does not support linux');
  });
});
