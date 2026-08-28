// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function join(files) {
  return files.map(read).join('\n');
}

it('keeps retired mixed actions and their exclusive evidence paths absent', () => {
  for (const file of [
    'scripts/android/macos-a5-credential-handoff.mjs',
    'scripts/windows/windows-a5-pair-sync-recovery-action.mjs',
    'scripts/windows/windows-dev-pair-sync-evidence.mjs'
  ]) {
    expect(fs.existsSync(file), file).toBe(false);
  }

  const registries = join([
    'scripts/android/macos-a5-action-registry.mjs',
    'scripts/windows/windows-dev-control.mjs'
  ]);
  expect(registries).not.toMatch(/'pair-sync'|pair-sync-recover/u);

  const activeHostRules = join(['android/AGENTS.md', 'electron/AGENTS.md']);
  expect(activeHostRules).not.toMatch(/\|pair-sync(?:-recover)?[>|]/u);
});

it('keeps system entry and product ownership outside host adapters', () => {
  const scenarioSources = fs.readdirSync('scripts/sync-group')
    .filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))
    .map((name) => read(`scripts/sync-group/${name}`)).join('\n');
  expect(scenarioSources).not.toContain('system-entry-sync');

  const adapters = join([
    'scripts/android/macos-a5-sync-group-maintenance-action.mjs',
    'scripts/sync-group/multi-device-sync-windows-provider.mjs',
    'scripts/sync-group/multi-device-sync-stage-runtime.mjs',
    'scripts/windows/windows-dev-device-action.mjs'
  ]);
  expect(adapters).not.toMatch(/failureOwner\s*[:=]\s*['"]product/iu);
});

it('keeps pairing proof scoped to saved signable credentials', () => {
  const pairing = join([
    'android/app/src/androidTest/assets/foliole-pair-sync-evidence-observer.js',
    'scripts/sync-group/pair-sync-feature-contract.mjs'
  ]);
  for (const forbidden of [
    'companion-sync-inline-attention',
    'manualSyncRunId',
    'latestSyncRunStatus',
    'initial-sync-completed',
    'structure-pack-applied'
  ]) {
    expect(pairing, forbidden).not.toContain(forbidden);
  }
});

it('keeps sync success free of fixed waits and readiness business criteria', () => {
  const predicate = read('scripts/sync-group/sync-scenario-predicate.mjs');
  expect(predicate).not.toMatch(/90_000|latest|attention|special-inbox|canonical Inbox/iu);

  const readiness = join([
    'scripts/journey-readiness-contract.mjs',
    'scripts/journey-readiness-controller.mjs'
  ]);
  expect(readiness).not.toMatch(/businessCriteria|business criteria|successCriteria/iu);
});

it('keeps Windows tests from using Android implementation source as host proof', () => {
  const windowsTests = fs.readdirSync('scripts/windows')
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => read(`scripts/windows/${name}`)).join('\n');
  expect(windowsTests).not.toMatch(/FolioleCompanion(?:Existing)?PairSync/iu);
});

it('keeps multi-device Mac consumers on the source-bound hidden credential session', () => {
  const consumers = [
    'multi-device-sync-a-leave.mjs',
    'multi-device-sync-a-rejoin.mjs',
    'multi-device-sync-ab-convergence.mjs',
    'multi-device-sync-fresh-join.mjs',
    'multi-device-sync-from-zero.mjs',
    'multi-device-sync-participation.mjs',
    'multi-device-sync-stage-actions.mjs'
  ].map((name) => read(`scripts/sync-group/${name}`));
  for (const source of consumers) {
    expect(source).not.toContain('userDataPath');
    expect(source).toContain('runtimeRoot');
    expect(source).toContain('owned.root');
  }
});
