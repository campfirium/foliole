// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RETIRED_PACKAGE_SCRIPTS, RETIRED_SCRIPT_ASSETS } from '../lib/script-domain-retirements.mjs';

const retained = [
  'android-capture-annotation-audit.mjs',
  'android-native-ui-summary.mjs',
  'android-review-audit-state.ts',
  'android-review-audit-types.ts',
  'android-review-audit.ts',
  'android-review-selection.ts',
  'android-review-transition.ts',
  'android-sync-topology.mjs',
  'android-ui-scenario.mjs'
];
function source(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8');
}

describe('Windows Android DEV helper boundary', () => {
  it('keeps the named pure-domain helpers free of control and device lifecycle', () => {
    for (const name of retained) {
      const content = source(`scripts/android/${name}`);
      expect(content).not.toMatch(/windows-android-lab|node:child_process|process\.argv/u);
      expect(content).not.toMatch(/\b(?:claim|dispatcher|worker|runState|deviceResolver)\b/iu);
    }
  });

  it('removes Lab, detached server, and Windows shell wrapper assets', () => {
    const windowsAssets = fs.readdirSync(path.resolve('scripts/windows'));
    const androidAssets = fs.readdirSync(path.resolve('scripts/android'));

    expect(windowsAssets.filter((name) => /^windows-android-(?:lab|dev-server)/u.test(name))).toEqual([]);
    expect(androidAssets.filter((name) => /^windows-.+\.sh$/u.test(name))).toEqual([]);
    for (const filePath of RETIRED_SCRIPT_ASSETS) expect(fs.existsSync(path.resolve(filePath))).toBe(false);
  });

  it('exposes only the fixed action gate and hosted Linux Android checks', () => {
    const packageScripts = JSON.parse(source('package.json')).scripts;
    for (const name of RETIRED_PACKAGE_SCRIPTS) expect(packageScripts[name]).toBeUndefined();
    expect(packageScripts['android:sync']).toBe('node scripts/android/native-linux-host.mjs sync');
    expect(packageScripts['android:host:lint']).toBe('node scripts/android/native-linux-host.mjs gradle lint');
    expect(packageScripts['android:host:test']).toBe('node scripts/android/native-linux-host.mjs gradle testDebugUnitTest');

    const controller = source('scripts/windows/windows-dev-control.mjs');
    const adapter = source('scripts/windows/windows-dev-device-action.mjs');
    expect(controller).toContain("'appearance', 'build', 'capture-annotation', 'deploy', 'live', 'secondary', 'verify'");
    expect(adapter).toContain("WINDOWS_DEV_ADB_PORT = '5037'");
    expect(adapter).toContain("WINDOWS_DEV_A5_SERIAL = '87a33a4b'");
    expect(`${controller}\n${adapter}`).not.toMatch(/windows-android-lab-(?:request|state|operation|worker)/u);
  });

  it('preserves the separate physical release validation chain', () => {
    for (const filePath of [
      'scripts/windows/windows-device-worker.mjs',
      'scripts/windows/windows-validation-kit-runner.mjs',
      'scripts/windows/release-windows-validation-kit-contract.test.mjs'
    ]) expect(fs.existsSync(path.resolve(filePath))).toBe(true);
  });
});
