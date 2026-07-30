// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const retained = [
  ['scripts/android/android-capture-annotation-audit.mjs', 'Capture/Cloze/Note persistence audit'],
  ['scripts/android/android-native-ui-summary.mjs', 'native UI snapshot parsing'],
  ['scripts/android/android-review-audit-state.ts', 'Review database state read'],
  ['scripts/android/android-review-audit-types.ts', 'Review audit domain types'],
  ['scripts/android/android-review-audit.ts', 'Review audit orchestration'],
  ['scripts/android/android-review-selection.ts', 'Review acceptance selection'],
  ['scripts/android/android-review-transition.ts', 'Review transition validation'],
  ['scripts/android/android-sync-topology.mjs', 'sync topology diagnosis'],
  ['scripts/android/android-ui-scenario.mjs', 'stable UI scenario mapping']
];

const deleteWithLegacyControlPlane = [
  ['scripts/windows/windows-android-lab-capture-annotation-audit.mjs', 'device CLI wrapper'],
  ['scripts/windows/windows-android-lab-review-action.mjs', 'run state and device discovery'],
  ['scripts/windows/windows-android-lab-review-audit.ts', 'run-bound CLI wrapper'],
  ['scripts/windows/windows-android-lab-review-scenario.mjs', 'run state and general execution'],
  ['scripts/windows/windows-android-lab-review-snapshot.mjs', 'device snapshot helper'],
  ['scripts/windows/windows-android-lab-sync-topology-collect.mjs', 'device discovery CLI'],
  ['scripts/windows/windows-android-lab-sync-topology.mjs', 'legacy CLI wrapper'],
  ['scripts/windows/windows-android-lab-ui-automation.mjs', 'general device execution CLI'],
  ['scripts/windows/windows-android-lab-ui-progress.mjs', 'run progress state']
];

const forbiddenRetainedSource = [
  /windows-android-lab-(?:control|device|dispatcher|evidence|operation|request|state|worker)/u,
  /FOLIOLE_ANDROID_(?:ADB_PATH|ADB_SERVER_PORT|LAB_EVIDENCE_ROOT|SERIAL)/u,
  /node:child_process/u,
  /process\.argv/u
];

function source(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8');
}

describe('Windows Android DEV purpose-specific helper boundary', () => {
  it('keeps a named pure-domain set without Lab lifecycle, device access, or CLI reachability', () => {
    for (const [filePath] of retained) {
      const content = source(filePath);
      for (const pattern of forbiddenRetainedSource) expect(content).not.toMatch(pattern);
    }
    expect(source('scripts/android/android-review-audit-types.ts')).not.toMatch(
      /commitSha|deploymentRunId|deviceIdentity|runId/u
    );
  });

  it('accounts for every remaining purpose-specific Lab helper in the delete set', () => {
    const remaining = fs.readdirSync(path.resolve('scripts/windows'))
      .filter((name) => /^windows-android-lab-(?:capture-.+|review-.+|sync-topology(?:-.+)?|ui-.+)\.(?:mjs|ts)$/u.test(name))
      .filter((name) => !name.endsWith('.test.mjs'))
      .map((name) => `scripts/windows/${name}`)
      .sort();
    expect(remaining).toEqual(deleteWithLegacyControlPlane.map(([filePath]) => filePath).sort());
    for (const [filePath, reason] of deleteWithLegacyControlPlane) {
      expect(fs.existsSync(path.resolve(filePath)), `${filePath}: ${reason}`).toBe(true);
    }
  });

  it('leaves fixed A5 port and serial ownership only in the task 4 device adapter', () => {
    const adapter = source('scripts/windows/windows-dev-device-action.mjs');
    expect(adapter).toContain("WINDOWS_DEV_ADB_PORT = '5037'");
    expect(adapter).toContain("WINDOWS_DEV_A5_SERIAL = '87a33a4b'");
    expect(adapter).not.toContain('process.argv');

    const packageScripts = Object.values(JSON.parse(source('package.json')).scripts).join('\n');
    for (const [filePath] of deleteWithLegacyControlPlane) {
      expect(packageScripts).not.toContain(path.basename(filePath));
    }
  });
});
